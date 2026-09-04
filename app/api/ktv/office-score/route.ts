import { NextResponse } from 'next/server';
import { requireBusinessUser } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { KtvOfficeScoreService } from '@/lib/services/KtvOfficeScoreService';
import { vnToday } from '@/lib/vn-time';

export const dynamic = 'force-dynamic';

/**
 * Điểm Office của CHÍNH KTV đang đăng nhập — điểm hôm nay + điểm tháng.
 * Trừ điểm mà KTV không tra cứu được thì sẽ khiếu nại liên tục, nên phải
 * cho họ tự xem. KTV chỉ đọc được của mình, không truyền staffId từ client.
 */
export async function GET() {
    try {
        const bUser = await requireBusinessUser();
        if (!bUser) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = getSupabaseAdmin();
        if (!supabase) {
            return NextResponse.json({ success: false, error: 'Supabase admin chưa được cấu hình' }, { status: 500 });
        }

        const staffId = bUser.techCode;
        const { data: staff } = await supabase
            .from('Staff')
            .select('id, work_type')
            .eq('id', staffId)
            .maybeSingle();

        // Chỉ Loại D có điểm Office. Vai trò khác trả về null để UI ẩn hẳn ô này.
        if (!staff || staff.work_type !== 'TYPE_D') {
            return NextResponse.json({ success: true, applicable: false, data: null });
        }

        const today = vnToday();
        const month = today.slice(0, 7);
        const scores = await KtvOfficeScoreService.computeMonth(supabase, [staffId], month);
        const m = scores.get(staffId)!;

        const todayEntry = m.days.find(d => d.workDate === today);

        return NextResponse.json({
            success: true,
            applicable: true,
            data: {
                today,
                // Chưa đi làm hôm nay thì chưa có điểm ngày — trả null để UI nói rõ,
                // không hiện 100 làm KTV tưởng đã được chấm.
                todayScore: todayEntry ? todayEntry.dayScore : null,
                todayHits: todayEntry ? todayEntry.hits.map(h => ({
                    label: h.label,
                    points: h.points,
                    note: h.note,
                    photoCount: h.photoUrls.length,
                })) : [],
                monthScore: m.final,
                workDays: m.workDays,
                repeats: m.repeats,
                repeatPenalty: m.repeatPenalty,
                exemptPct: m.exemptPct,
                fundDue: m.fundDue,
            },
        });
    } catch (error: any) {
        const msg = error?.message || 'Lỗi không xác định';
        const status = msg === 'Unauthorized' ? 401 : 500;
        if (status === 500) console.error('Lỗi khi lấy điểm Office của KTV:', error);
        return NextResponse.json({ success: false, error: msg }, { status });
    }
}
