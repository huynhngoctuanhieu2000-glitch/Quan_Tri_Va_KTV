import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { syncTurnsForDate } from '@/lib/turn-sync';
import { recomputeBookingStatus } from '@/lib/dispatch-status';
import { getBusinessDate } from '../booking/_shared/utils';

/**
 * ============================================================
 * ⏹️ KẾT THÚC ĐƠN SỚM KHI ĐANG TẠM DỪNG
 * ============================================================
 * Nút "Kết thúc" trên thẻ Kanban của đơn đang tạm dừng.
 *
 * ⏱️ MỐC GIỜ (quyết định tiền công — không được sai):
 *   - Giờ kết thúc lấy `pauseStart` (lúc bấm tạm dừng), KHÔNG lấy giờ hiện tại.
 *     Khoảng từ lúc tạm dừng đến lúc lễ tân bấm kết thúc là thời gian chờ,
 *     KTV không làm nên không được tính tiền.
 *   - `actualStartTime` đã được resumeItem() dời tới trước đúng bằng tổng thời
 *     gian đã tạm dừng trước đó, nên (pauseStart − actualStartTime) chính là
 *     số phút làm thực của chặng này.
 *   - Phải ghi `customCommissionDuration`: thiếu nó thì
 *     KtvCommissionService.calculateItemDuration trả về giờ GÁN → trả thừa tiền.
 *   - Chặn trên tại giờ gán, đúng quy tắc của computeMinutes (KtvDLedgerEngine),
 *     để mốc giờ hỏng không đẻ ra tua 24 tiếng.
 *
 * 🔓 GIẢI PHÓNG KTV: phần trước đây thiếu, gây kẹt đơn.
 *   syncTurnsForDate() CHỈ đếm lại turns_completed, không hề nhả KTV.
 *   Phải tự tay: KtvAssignments → COMPLETED, TurnQueue → waiting,
 *   rồi promote_next_assignment() để KTV nhận đơn kế tiếp.
 *   (RPC không tự nhả được khi TurnQueue.status = 'working'.)
 * ============================================================
 */

/** Mốc giờ trong DB có khi là ISO, có khi là 'YYYY-MM-DD HH:mm:ss' không kèm timezone. */
function parseMs(v: any): number {
    if (!v) return NaN;
    if (typeof v !== 'string') return new Date(v).getTime();
    const normalized = v.includes('T') ? v : v.replace(' ', 'T');
    const hasZone = /(Z|[+-]\d{2}:?\d{2})$/.test(normalized);
    return new Date(hasZone ? normalized : normalized + 'Z').getTime();
}

export async function POST(req: Request) {
    try {
        await requirePermission('dispatch_board');

        const supabase = getSupabaseAdmin();
        if (!supabase) {
            return NextResponse.json({ success: false, error: 'Supabase admin chưa được cấu hình' }, { status: 500 });
        }

        const body = await req.json().catch(() => ({}));
        const bookingId = body.bookingId;
        const itemIds = body.itemIds || [];

        if (!bookingId || !Array.isArray(itemIds) || itemIds.length === 0) {
            return NextResponse.json({ success: false, error: 'Thiếu thông tin đơn hàng (bookingId hoặc itemIds)' }, { status: 400 });
        }

        const { data: itemsToProcess, error: itemsError } = await supabase
            .from('BookingItems')
            .select('id, bookingId, status, pauseStart, segments, "technicianCodes"')
            .in('id', itemIds);

        if (itemsError) throw itemsError;
        if (!itemsToProcess || itemsToProcess.length === 0) {
            return NextResponse.json({ success: false, error: 'Không tìm thấy dịch vụ' }, { status: 404 });
        }

        const pausedItems = itemsToProcess.filter(it => it.status === 'PAUSED');
        if (pausedItems.length === 0) {
            return NextResponse.json({ success: false, error: 'Không có dịch vụ nào đang tạm dừng để kết thúc' }, { status: 400 });
        }

        const affectedKtvIds = new Set<string>();
        const finishedItemIds: string[] = [];

        for (const it of pausedItems) {
            // Mốc kết thúc = lúc bấm tạm dừng. Chỉ khi thiếu pauseStart (dữ liệu cũ) mới đành lấy giờ hiện tại.
            const effectiveEnd = it.pauseStart || new Date().toISOString();
            const endMs = parseMs(effectiveEnd);

            let segs = it.segments;
            if (typeof segs === 'string') {
                try { segs = JSON.parse(segs); } catch { segs = []; }
            }

            const payload: any = {
                status: 'CLEANING',
                pauseStart: null,          // gỡ cờ tạm dừng, nếu không UI vẫn coi đơn đang dừng
                timeEnd: effectiveEnd,     // khớp với actualEndTime của chặng
            };

            if (Array.isArray(segs)) {
                for (const seg of segs) {
                    if (!seg.actualStartTime || seg.actualEndTime) continue;

                    const startMs = parseMs(seg.actualStartTime);
                    let workedMins = 0;
                    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs) {
                        workedMins = Math.round((endMs - startMs) / 60000);
                    }

                    // Chặn trên tại giờ gán — mốc hỏng không được đẻ ra giờ làm ảo.
                    const assignedMins = Number(seg.duration) || 0;
                    if (assignedMins > 0 && workedMins > assignedMins) workedMins = assignedMins;

                    seg.actualEndTime = effectiveEnd;
                    seg.customCommissionDuration = workedMins;
                    seg.note = 'FINISHED_EARLY_ON_PAUSE';

                    if (seg.ktvId) affectedKtvIds.add(String(seg.ktvId));
                }
                payload.segments = JSON.stringify(segs);
            }

            if (Array.isArray(it.technicianCodes)) {
                it.technicianCodes.filter(Boolean).forEach((k: string) => affectedKtvIds.add(String(k)));
            }

            const { error: updErr } = await supabase.from('BookingItems').update(payload).eq('id', it.id);
            if (updErr) throw updErr;
            finishedItemIds.push(it.id);
        }

        // ─── Tính lại trạng thái Booking (cả đơn cha lẫn đơn con) ───
        const { data: booking, error: bookingErr } = await supabase
            .from('Bookings')
            .select('id, parent_booking_id')
            .eq('id', bookingId)
            .maybeSingle();
        if (bookingErr) throw bookingErr;

        const parentId = booking?.parent_booking_id || bookingId;
        const { data: childBookings } = await supabase
            .from('Bookings')
            .select('id')
            .eq('parent_booking_id', parentId);

        const allBookingIds = Array.from(new Set([parentId, bookingId, ...(childBookings?.map(b => b.id) || [])]));

        const { data: allBookingItems } = await supabase
            .from('BookingItems')
            .select('status')
            .in('bookingId', allBookingIds);

        if (allBookingItems && allBookingItems.length > 0) {
            let bStatus = recomputeBookingStatus(allBookingItems.map(i => i.status));
            if (bStatus === 'DONE') bStatus = 'CLEANING'; // items vừa chuyển sang CLEANING
            const { error: bUpdErr } = await supabase.from('Bookings').update({ status: bStatus }).in('id', allBookingIds);
            if (bUpdErr) throw bUpdErr;
        }

        // ─── Giải phóng KTV ───
        // Tìm tua theo current_order_id chứ KHÔNG theo ngày: tua ca đêm bắt đầu
        // trước mốc cắt ngày (06:00) nằm ở ngày làm việc hôm trước, lọc theo
        // ngày hôm nay sẽ không thấy và KTV kẹt đơn.
        const { data: turnsHolding } = await supabase
            .from('TurnQueue')
            .select('id, employee_id, date, status')
            .in('current_order_id', allBookingIds);

        const releasedDates = new Set<string>();
        const handledKtvIds = new Set<string>();

        for (const turn of turnsHolding || []) {
            if (!turn.employee_id) continue;
            handledKtvIds.add(String(turn.employee_id));
            const turnDate = turn.date || getBusinessDate();
            releasedDates.add(turnDate);

            await supabase
                .from('KtvAssignments')
                .update({ status: 'COMPLETED', updated_at: new Date().toISOString() })
                .eq('employee_id', turn.employee_id)
                .eq('business_date', turnDate)
                .in('booking_id', allBookingIds)
                .in('status', ['ACTIVE', 'QUEUED', 'READY']);

            // promote_next_assignment KHÔNG nhả TurnQueue khi status='working',
            // nên phải hạ 'working' xuống trước rồi mới gọi RPC.
            // KTV đã xin nghỉ (off) thì giữ nguyên off, đừng kéo về hàng chờ.
            await supabase
                .from('TurnQueue')
                .update({
                    status: turn.status === 'off' ? 'off' : 'waiting',
                    current_order_id: null,
                    booking_item_id: null,
                    booking_item_ids: [],
                    room_id: null,
                    bed_id: null,
                    start_time: null,
                    estimated_end_time: null,
                })
                .eq('id', turn.id);

            await supabase.rpc('promote_next_assignment', {
                p_employee_id: turn.employee_id,
                p_business_date: turnDate,
            });
        }

        // KTV có trong chặng nhưng TurnQueue không còn trỏ vào đơn này:
        // vẫn phải đóng assignment treo, nếu không họ không được gán đơn mới.
        const businessDate = getBusinessDate();
        for (const ktvId of Array.from(affectedKtvIds)) {
            if (handledKtvIds.has(ktvId)) continue;
            await supabase
                .from('KtvAssignments')
                .update({ status: 'COMPLETED', updated_at: new Date().toISOString() })
                .eq('employee_id', ktvId)
                .in('booking_id', allBookingIds)
                .in('status', ['ACTIVE', 'QUEUED', 'READY']);

            await supabase.rpc('promote_next_assignment', {
                p_employee_id: ktvId,
                p_business_date: businessDate,
            });
        }

        // TurnLedger đã được ghi từ lúc điều phối (DISPATCH_CONFIRM) nên tua vẫn
        // được tính đủ; đây chỉ là đồng bộ lại turns_completed cho đúng.
        releasedDates.add(businessDate);
        for (const d of Array.from(releasedDates)) {
            await syncTurnsForDate(d);
        }

        return NextResponse.json({
            success: true,
            data: { itemIdsFinished: finishedItemIds, releasedKtvIds: Array.from(affectedKtvIds) },
        });
    } catch (e: any) {
        const msg = e?.message || 'Server error';
        const status = msg === 'Forbidden' ? 403 : msg === 'Unauthorized' ? 401 : 500;
        if (status === 500) console.error('finish-early-paused error:', e);
        return NextResponse.json({ success: false, error: msg }, { status });
    }
}
