/**
 * ============================================================
 * 🔓 HANDLER: RELEASE_KTV
 * ============================================================
 * 
 * Giải phóng KTV khỏi đơn hàng sau khi hoàn tất handover.
 * 
 * 📋 LUỒNG:
 *   1. Set KtvAssignments.status = 'COMPLETED'
 *   2. Gọi RPC promote_next_assignment() để KTV nhận đơn tiếp theo
 * 
 * 🚫 KHÔNG ĐƯỢC:
 *   - Thay đổi Booking status ở bước này (đã xử lý ở orchestrator)
 *   - Clear TurnQueue (promote_next_assignment tự xử lý)
 * 
 * 📊 DB OPERATIONS (tự xử lý):
 *   - UPDATE KtvAssignments (status → COMPLETED)
 *   - RPC promote_next_assignment
 * 
 * 📤 TRẢ VỀ: void (fire-and-forget, chạy sau booking update)
 * 
 * 💡 NOTE: File này chỉ ~25 dòng nhưng tách riêng để:
 *   - Giữ consistency với convention _handlers/
 *   - Extensible cho tương lai (audit log, notification, etc.)
 * ============================================================
 */

import { HandlerContext } from '../_shared/utils';

export async function handleReleaseKTV(ctx: HandlerContext): Promise<void> {
    const { supabase, technicianCode, today, bookingId } = ctx;

    await supabase
        .from('KtvAssignments')
        .update({ status: 'COMPLETED', updated_at: new Date().toISOString() })
        .eq('employee_id', technicianCode)
        .eq('business_date', today)
        .eq('booking_id', bookingId)
        .in('status', ['ACTIVE', 'QUEUED', 'READY']);

    await supabase.rpc('promote_next_assignment', {
        p_employee_id: technicianCode,
        p_business_date: today
    });
}
