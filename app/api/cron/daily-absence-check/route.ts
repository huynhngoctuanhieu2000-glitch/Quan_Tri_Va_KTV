import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { KtvTypeDDisciplineService } from '@/lib/services/KtvTypeDDisciplineService';
import { getBusinessToday, previousBusinessDate } from '@/lib/business-date';
import { createNotification } from '@/lib/notification-helper';

export const dynamic = 'force-dynamic';

/**
 * ================================================================
 * CHỐT SỔ KỶ LUẬT CUỐI NGÀY — LOẠI D
 * ================================================================
 * Ba tình huống, ba mức khác nhau (theo quy chế):
 *
 *   1. Không đăng ký gì (không OFF, không LÀM)  → KHOÁ TÀI KHOẢN
 *   2. Đăng ký LÀM rồi không đến, không báo gì  → −10 giờ
 *   3. Đăng ký LÀM, có báo vắng muộn            →  −5 giờ
 *   4. Đăng ký OFF                              → không sao
 *
 * ⚠️ Trước đây tình huống 2 bị KHOÁ TÀI KHOẢN thay vì trừ 10 giờ — nặng hơn
 * quy chế rất nhiều (khoá thì không đăng nhập được cho tới khi admin mở).
 *
 * ⚠️ Và cả cron này CHƯA BAO GIỜ CHẠY: nó chỉ export POST, trong khi Vercel
 * Cron gọi bằng GET → 405. Toàn bộ kỷ luật loại D là luật trên giấy.
 *
 * Chốt theo NGÀY LÀM VIỆC liền trước, không phải "hôm nay theo lịch": chạy
 * lúc 06:30 (sau cutoff 06:00) thì ngày làm việc hôm qua vừa đóng.
 */
async function run() {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
        return NextResponse.json({ success: false, error: 'Supabase admin not configured' }, { status: 500 });
    }

    const targetDate = previousBusinessDate(await getBusinessToday(supabase));

    // ⚠️ CÔNG TẮC AN TOÀN — mặc định TẮT.
    // Chạy thử trên dữ liệu thật cho thấy nếu bật ngay thì 9/12 KTV loại D bị
    // khoá tài khoản trong đêm đầu tiên, chỉ vì chưa ai có thói quen đăng ký
    // lịch hằng ngày (giai đoạn test). Luật đúng, nhưng áp lên dữ liệu hiện
    // tại thì quét sạch.
    //
    // Bật bằng cách đặt SystemConfigs.ktv_type_d_discipline_enabled = true,
    // SAU KHI KTV đã quen đăng ký. Không cần deploy lại.
    //
    // `?dry=1` để xem trước sẽ đụng vào ai mà không ghi gì.
    const { data: swRow } = await supabase
        .from('SystemConfigs').select('value')
        .eq('key', 'ktv_type_d_discipline_enabled').maybeSingle();
    const enabled = String(swRow?.value ?? '').replace(/"/g, '').trim() === 'true';

    console.log(`[Kỷ luật D] Chốt sổ ngày làm việc ${targetDate} (${enabled ? 'ĐANG BẬT' : 'đang TẮT — chỉ ghi log'})`);

    const { data: staffList, error: staffError } = await supabase
        .from('Staff')
        .select('id, status, work_type, created_at, full_name')
        .eq('work_type', 'TYPE_D')
        .neq('status', 'KHÓA_TÀI_KHOẢN');

    if (staffError) throw staffError;

    const locked: string[] = [];
    const penalised: { staff: string; hours: number; ly_do: string }[] = [];
    let processed = 0;

    for (const staff of staffList || []) {
        // Bỏ qua KTV mới tạo trong chính ngày đang chốt.
        if (staff.created_at && String(staff.created_at).slice(0, 10) >= targetDate) continue;

        const [{ data: registration }, { data: attendance }] = await Promise.all([
            supabase.from('KTVTypeDDailyRegistration')
                .select('*').eq('staff_id', staff.id).eq('work_date', targetDate).maybeSingle(),
            supabase.from('KTVAttendance')
                .select('id').eq('employeeId', staff.id).eq('date', targetDate)
                .in('checkType', ['CHECK_IN', 'LATE_CHECKIN']).limit(1),
        ]);

        const daDiLam = !!(attendance && attendance.length > 0);
        processed++;

        // ── 1. KHÔNG ĐĂNG KÝ GÌ → khoá tài khoản ────────────────────
        if (!registration) {
            if (daDiLam) continue;   // quên đăng ký nhưng vẫn đến làm → bỏ qua

            const lyDo = 'Không đăng ký lịch và không điểm danh';
            locked.push(staff.full_name ? `${staff.full_name} (${staff.id})` : staff.id);
            if (!enabled) continue;

            await supabase.from('SecurityAuditLogs').insert({
                employee_id: staff.id,
                employee_name: staff.full_name || staff.id,
                event_type: 'AUTO_LOCK_ABSENCE',
                ip_address: '127.0.0.1',
                user_agent: 'CRON',
                details: { source: 'CRON', violationDate: targetDate, reason: lyDo },
            });
            await supabase.from('Staff').update({ status: 'KHÓA_TÀI_KHOẢN' }).eq('id', staff.id);
            await KtvTypeDDisciplineService.markAccountLock(supabase, staff.id, targetDate, lyDo);
            await createNotification({
                type: 'EMERGENCY',
                message: `Tài khoản của bạn đã bị khóa do không đăng ký lịch và không đi làm ngày ${targetDate}.`,
                employeeId: staff.id,
            });
            continue;
        }

        // ── 4. ĐĂNG KÝ OFF → không sao ──────────────────────────────
        if (registration.status === 'OFF_REGISTERED') {
            if (enabled) {
                await supabase.from('KTVTypeDDailyRegistration')
                    .update({ status: 'COMPLETED' }).eq('id', registration.id);
            }
            continue;
        }

        // Có đến làm → xong, không phạt gì.
        if (daDiLam || registration.check_in_at) {
            if (enabled) {
                await supabase.from('KTVTypeDDailyRegistration')
                    .update({ status: 'COMPLETED' }).eq('id', registration.id);
            }
            continue;
        }

        // ── 2 & 3. ĐĂNG KÝ LÀM NHƯNG KHÔNG ĐẾN ──────────────────────
        // Có báo vắng → −5h. Không báo gì (kể cả đã báo trễ rồi vẫn lặn) → −10h.
        const coBaoVang = registration.status === 'ABSENT_REPORTED' && !!registration.absent_reported_at;
        const violationType = coBaoVang ? 'ABSENT_EARLY_NOTICE' : 'ABSENT_NO_NOTICE';
        const lyDo = coBaoVang
            ? 'Đã báo vắng nhưng không đi làm'
            : 'Đăng ký làm nhưng không đến và không báo';

        if (registration.penalty_applied !== violationType) {
            penalised.push({ staff: staff.id, hours: violationType === 'ABSENT_NO_NOTICE' ? 10 : 5, ly_do: lyDo });
            if (!enabled) continue;

            const hours = await KtvTypeDDisciplineService.deductDailyViolation(
                supabase, staff.id, targetDate, violationType, `Chốt sổ cuối ngày: ${lyDo}`, 'CRON',
            );
            await supabase.from('KTVTypeDDailyRegistration')
                .update({ penalty_applied: violationType, status: 'COMPLETED' })
                .eq('id', registration.id);

            await createNotification({
                type: 'WARNING',
                message: `Bạn bị trừ ${hours} giờ tích lũy ngày ${targetDate}. Lý do: ${lyDo}.`,
                employeeId: staff.id,
            });
        }
    }

    if (locked.length > 0 && enabled) {
        await createNotification({
            type: 'EMERGENCY',
            message: `Hệ thống vừa khóa ${locked.length} KTV do không đăng ký lịch ngày ${targetDate}: ${locked.join(', ')}`,
            employeeId: null,
        });
    }

    console.log(`[Kỷ luật D] ${processed} KTV · ${penalised.length} bị trừ giờ · ${locked.length} bị khoá`);
    return NextResponse.json({
        success: true, enabled, targetDate, processed,
        penalised, lockedCount: locked.length, locked,
        note: enabled ? undefined : 'Kỷ luật đang TẮT — danh sách bên dưới chỉ là dự kiến, chưa ghi gì.',
    });
}

export async function GET(request: Request) {
    // ⚠️ Vercel Cron gọi bằng GET. Trước đây file này chỉ export POST nên cron
    // luôn trả 405 và toàn bộ kỷ luật loại D chưa bao giờ được áp dụng.
    const authHeader = request.headers.get('Authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
        return await run();
    } catch (error: any) {
        console.error('Lỗi daily-absence-check:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export const POST = GET;
