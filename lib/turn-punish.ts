import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * ================================================================
 * TƯỚC TUA CỦA KTV (TurnLedger.is_punished)
 * ================================================================
 * `syncTurnsForDate` đã lọc sẵn `is_punished = true` ra khỏi `turns_completed`,
 * nên đánh dấu cờ này là KTV mất lượt tua.
 *
 * ⚠️ HAI CÁI BẪY, cả hai đều đã từng làm "mất tua" trở thành vô hiệu:
 *
 * 1. `TurnLedger.booking_id` lưu mã ĐƠN CHA, không phải đơn con.
 *    RPC điều phối ghi `COALESCE(parent_booking_id, id)`. Nếu huỷ một đơn con
 *    rồi UPDATE theo mã đơn con thì khớp 0 dòng — cờ không bao giờ được bật.
 *    (Đúng lỗi này đã xảy ra: T007 bị huỷ đơn 07/09 mà vẫn `is_punished=false`.)
 *
 * 2. Một bill tách nhiều khách chỉ có MỘT dòng sổ cho mỗi KTV. Huỷ một đơn con
 *    mà tước tua ngay là cướp luôn công của những đơn con khác họ vẫn đang làm.
 *    Nên chỉ tước khi KTV không còn dịch vụ nào chưa huỷ trong CẢ bill.
 * ================================================================
 */

/** Mã đơn mà sổ cái tua dùng: luôn là đơn cha nếu đơn này là đơn con. */
export async function ledgerBookingIdOf(supabase: SupabaseClient, bookingId: string): Promise<string> {
    const { data } = await supabase
        .from('Bookings')
        .select('parent_booking_id')
        .eq('id', bookingId)
        .maybeSingle();
    return (data as any)?.parent_booking_id || bookingId;
}

/**
 * Tước tua của một KTV cho một bill — nhưng chỉ khi họ đã hết việc trong bill đó.
 *
 * @returns true nếu thực sự tước, false nếu bỏ qua vì KTV còn dịch vụ khác.
 */
export async function punishTurnIfIdle(
    supabase: SupabaseClient,
    opts: { bookingId: string; employeeId: string; date: string }
): Promise<boolean> {
    const { bookingId, employeeId, date } = opts;
    if (!bookingId || !employeeId || !date) return false;

    const parentId = await ledgerBookingIdOf(supabase, bookingId);

    // Toàn bộ bill: đơn cha + mọi đơn con.
    const { data: children } = await supabase
        .from('Bookings')
        .select('id')
        .eq('parent_booking_id', parentId);
    const familyIds = Array.from(new Set([parentId, bookingId, ...(children || []).map((b: any) => b.id)]));

    // Còn dịch vụ nào chưa huỷ mà KTV này phụ trách thì thôi, đừng tước.
    const { data: alive } = await supabase
        .from('BookingItems')
        .select('id')
        .in('bookingId', familyIds)
        .contains('technicianCodes', [employeeId])
        .neq('status', 'CANCELLED')
        .limit(1);

    if (alive && alive.length > 0) return false;

    const { error } = await supabase
        .from('TurnLedger')
        .update({ is_punished: true })
        .eq('date', date)
        .eq('booking_id', parentId)
        .eq('employee_id', employeeId);

    if (error) {
        console.error('[punishTurnIfIdle] không tước được tua:', error.message);
        return false;
    }
    return true;
}
