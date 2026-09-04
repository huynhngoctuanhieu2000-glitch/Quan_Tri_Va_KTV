import { NextResponse } from 'next/server';
import { requirePermission, requireBusinessUser } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createNotification } from '@/lib/notification-helper';
import { vnToday } from '@/lib/vn-time';

export const dynamic = 'force-dynamic';

const MAX_PHOTOS = 5;

/** Ngày VN lùi n ngày, dạng 'YYYY-MM-DD'. */
function vnDaysAgo(n: number): string {
    const vn = new Date(Date.now() + 7 * 60 * 60 * 1000 - n * 86400000);
    return vn.toISOString().slice(0, 10);
}

export async function POST(request: Request) {
    try {
        await requirePermission('ktv_office_scoring');
        const bUser = await requireBusinessUser();
        if (!bUser) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = getSupabaseAdmin();
        if (!supabase) {
            return NextResponse.json({ success: false, error: 'Supabase admin chưa được cấu hình' }, { status: 500 });
        }

        const body = await request.json().catch(() => ({}));
        const { staffId, workDate, criteriaIds, note, photosBase64 } = body as {
            staffId?: string;
            workDate?: string;
            criteriaIds?: string[];
            note?: string;
            photosBase64?: string[];
        };

        if (!staffId || !workDate || !Array.isArray(criteriaIds) || criteriaIds.length === 0) {
            return NextResponse.json({ success: false, error: 'Thiếu KTV, ngày vi phạm hoặc danh sách lỗi.' }, { status: 400 });
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate)) {
            return NextResponse.json({ success: false, error: 'Ngày vi phạm không hợp lệ.' }, { status: 400 });
        }
        if (workDate > vnToday()) {
            return NextResponse.json({ success: false, error: 'Không thể trừ điểm cho ngày ở tương lai.' }, { status: 400 });
        }

        // Lễ tân chỉ được trừ hôm nay và hôm qua — không giới hạn thì dễ trừ bù
        // cả tuần trước, KTV không còn cách nào phản hồi. Quản lý trừ được mọi ngày.
        const role = String(bUser.role || '').toUpperCase();
        const isManager = ['ADMIN', 'DEV', 'MANAGER'].includes(role);
        if (!isManager && workDate < vnDaysAgo(1)) {
            return NextResponse.json(
                { success: false, error: 'Chỉ Quản lý mới trừ điểm được cho ngày cũ hơn hôm qua.' },
                { status: 403 }
            );
        }

        // KTV phải tồn tại và đúng Loại D.
        const { data: staff, error: staffErr } = await supabase
            .from('Staff')
            .select('id, full_name, work_type')
            .eq('id', staffId)
            .maybeSingle();
        if (staffErr) throw staffErr;
        if (!staff) {
            return NextResponse.json({ success: false, error: 'Không tìm thấy KTV.' }, { status: 404 });
        }
        if (staff.work_type !== 'TYPE_D') {
            return NextResponse.json({ success: false, error: 'Chỉ áp dụng cho KTV Loại D.' }, { status: 400 });
        }

        // Lấy tiêu chí từ DB — KHÔNG tin điểm do client gửi lên.
        const { data: criteria, error: critErr } = await supabase
            .from('KTVOfficeCriteria')
            .select('id, label, points, requires_photo')
            .in('id', criteriaIds)
            .eq('is_active', true);
        if (critErr) throw critErr;

        if (!criteria || criteria.length !== criteriaIds.length) {
            return NextResponse.json({ success: false, error: 'Có tiêu chí không tồn tại hoặc đã ngừng áp dụng.' }, { status: 400 });
        }

        const photos = Array.isArray(photosBase64) ? photosBase64.slice(0, MAX_PHOTOS) : [];
        const needPhoto = criteria.some((c: any) => c.requires_photo);
        if (needPhoto && photos.length === 0) {
            const names = criteria.filter((c: any) => c.requires_photo).map((c: any) => c.label).join(', ');
            return NextResponse.json(
                { success: false, error: `Các lỗi sau bắt buộc có ảnh minh chứng: ${names}.` },
                { status: 400 }
            );
        }

        // Chặn trừ trùng trong ngày (DB cũng có unique index, đây là lớp báo lỗi thân thiện).
        const { data: existing } = await supabase
            .from('KTVOfficeScoreLog')
            .select('criteria_id, criteria_label')
            .eq('staff_id', staffId)
            .eq('work_date', workDate)
            .in('criteria_id', criteriaIds)
            .is('revoked_at', null);
        if (existing && existing.length > 0) {
            const names = existing.map((e: any) => e.criteria_label).join(', ');
            return NextResponse.json(
                { success: false, error: `Ngày ${workDate} đã trừ các lỗi này rồi: ${names}. Mỗi lỗi chỉ trừ 1 lần/ngày.` },
                { status: 409 }
            );
        }

        // Upload ảnh trước khi ghi log — có ảnh hỏng thì dừng, không ghi nửa vời.
        const photoUrls: string[] = [];
        for (let i = 0; i < photos.length; i++) {
            const raw = photos[i];
            if (typeof raw !== 'string' || !raw.startsWith('data:image/')) continue;
            const ext = raw.match(/^data:image\/(\w+);base64,/)?.[1] || 'jpg';
            const buffer = Buffer.from(raw.replace(/^data:image\/\w+;base64,/, ''), 'base64');
            const path = `office-evidence/${staffId}/${workDate}/${Date.now()}_${i}.${ext}`;

            const { data: up, error: upErr } = await supabase.storage
                .from('attendance')
                .upload(path, buffer as any, { contentType: `image/${ext}`, upsert: false });
            if (upErr) {
                console.error('❌ [Office] Lỗi upload ảnh minh chứng:', upErr);
                return NextResponse.json({ success: false, error: 'Không tải được ảnh minh chứng lên. Vui lòng thử lại.' }, { status: 500 });
            }
            const { data: pub } = supabase.storage.from('attendance').getPublicUrl(up.path);
            photoUrls.push(pub.publicUrl);
        }

        // bUser.techCode có thể là UUID (tài khoản admin không gắn mã NV) — tra tên thật
        // để KTV nhìn lịch sử biết ai chấm, chứ không phải một chuỗi UUID vô nghĩa.
        const { data: actor } = await supabase
            .from('Staff')
            .select('full_name')
            .eq('id', bUser.techCode)
            .maybeSingle();
        const createdByName = actor?.full_name
            || (bUser.role ? `Quản lý (${bUser.role})` : null)
            || bUser.techCode
            || 'Không rõ';
        const rows = criteria.map((c: any) => ({
            staff_id: staffId,
            work_date: workDate,
            criteria_id: c.id,
            criteria_label: c.label,          // snapshot, phòng khi quy chế đổi tên tiêu chí
            points_deducted: Number(c.points) || 0,
            note: note?.trim() || null,
            photo_urls: photoUrls,
            created_by: bUser.techCode,
            created_by_name: createdByName,
        }));

        const { data: inserted, error: insErr } = await supabase
            .from('KTVOfficeScoreLog')
            .insert(rows)
            .select('id');
        if (insErr) {
            // 23505 = đụng unique index chặn trừ trùng 1 lỗi/ngày.
            if ((insErr as any).code === '23505') {
                return NextResponse.json(
                    { success: false, error: 'Một trong các lỗi này vừa được người khác trừ. Vui lòng tải lại trang.' },
                    { status: 409 }
                );
            }
            throw insErr;
        }

        const totalPoints = criteria.reduce((a: number, c: any) => a + (Number(c.points) || 0), 0);
        const detail = criteria.map((c: any) => `${c.label} (−${c.points}đ)`).join(', ');

        // Báo cho KTV biết ngay, kèm lý do — không để họ cuối tháng mới ngã ngửa.
        await createNotification({
            type: 'WARNING',
            message: `Bạn bị trừ ${totalPoints} điểm Office ngày ${workDate}: ${detail}.${photoUrls.length ? ` Có ${photoUrls.length} ảnh minh chứng.` : ''}`,
            employeeId: staffId,
        }).catch(err => console.error('❌ [Office] Không gửi được thông báo:', err));

        // Nhật ký để truy vết khi lễ tân và KTV tranh chấp.
        // Bọc try/catch: nhật ký hỏng không được chặn nghiệp vụ đã ghi thành công.
        try {
            await supabase.from('SecurityAuditLogs').insert({
                employee_id: staffId,
                employee_name: staff.full_name || staffId,
                event_type: 'OFFICE_SCORE_DEDUCT',
                ip_address: '127.0.0.1',
                user_agent: 'API',
                details: {
                    workDate,
                    criteriaIds,
                    totalPoints,
                    photoCount: photoUrls.length,
                    by: bUser.techCode,
                    note: note?.trim() || null,
                },
            });
        } catch (logErr) {
            console.error('❌ [Office] Không ghi được nhật ký:', logErr);
        }

        return NextResponse.json({
            success: true,
            inserted: inserted?.length || 0,
            totalPoints,
            photoUrls,
        });
    } catch (error: any) {
        const msg = error?.message || 'Lỗi không xác định';
        const status = msg === 'Forbidden' ? 403 : msg === 'Unauthorized' ? 401 : 500;
        if (status === 500) console.error('Lỗi khi trừ điểm Office:', error);
        return NextResponse.json({ success: false, error: msg }, { status });
    }
}
