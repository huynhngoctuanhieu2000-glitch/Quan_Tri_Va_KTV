import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

/**
 * KTV bấm "Báo quầy nhận đơn" — báo cho quầy biết đã nhận tua được điều phối.
 *
 * KHÔNG đổi trạng thái đơn, KHÔNG bắt đầu tính giờ. Chỉ là tín hiệu để lễ tân
 * biết KTV đã thấy đơn và đang tới. Việc bắt đầu tua vẫn theo luồng cũ.
 *
 * Cặp với `/api/ktv/discipline/reject-order` — hai lựa chọn khi có đơn mới.
 *
 * Body: { staffId, bookingItemId }
 *   `bookingItemId` nhận cả id của BookingItem lẫn của Booking.
 */
export async function POST(request: Request) {
    try {
        const { staffId, bookingItemId } = await request.json();
        if (!staffId || !bookingItemId) {
            return NextResponse.json(
                { success: false, error: 'Thiếu staffId hoặc bookingItemId' }, { status: 400 });
        }

        const supabase = getSupabaseAdmin();
        if (!supabase) {
            return NextResponse.json({ success: false, error: 'Supabase init failed' }, { status: 500 });
        }

        // Chấp nhận cả hai loại id — màn hình KTV có chỗ truyền booking id.
        let itemId: string = bookingItemId;
        let bookingId: string | null = null;

        const { data: direct } = await supabase
            .from('BookingItems').select('id, bookingId').eq('id', bookingItemId).maybeSingle();
        if (direct) {
            bookingId = (direct as any).bookingId;
        } else {
            const { data: candidates } = await supabase
                .from('BookingItems').select('id, technicianCodes').eq('bookingId', bookingItemId);
            const mine = (candidates || []).find((i: any) =>
                (i.technicianCodes || []).some((t: string) => String(t).toLowerCase() === String(staffId).toLowerCase()));
            if (!mine) {
                return NextResponse.json(
                    { success: false, error: 'Không tìm thấy đơn đang gán cho bạn.' }, { status: 404 });
            }
            itemId = mine.id;
            bookingId = bookingItemId;
        }

        const [{ data: staff }, { data: booking }] = await Promise.all([
            supabase.from('Staff').select('full_name').eq('id', staffId).maybeSingle(),
            bookingId
                ? supabase.from('Bookings').select('billCode').eq('id', bookingId).maybeSingle()
                : Promise.resolve({ data: null }),
        ]);

        const staffName = staff?.full_name || staffId;
        const bill = (booking as any)?.billCode || itemId;

        // Ghi mốc đã nhận vào options — màn KTV dựa vào đây để biết đơn đã qua bước
        // xác nhận hay chưa. Không có mốc này thì reload trang là mất trạng thái.
        const { data: cur } = await supabase
            .from('BookingItems').select('options').eq('id', itemId).maybeSingle();
        const curOpts = typeof (cur as any)?.options === 'string'
            ? JSON.parse((cur as any).options || '{}')
            : ((cur as any)?.options || {});

        if (!curOpts.acceptedAt) {
            const { error: upErr } = await supabase
                .from('BookingItems')
                .update({ options: { ...curOpts, acceptedAt: new Date().toISOString(), acceptedBy: staffId } })
                .eq('id', itemId);
            if (upErr) {
                console.error('[Accept Order] Không ghi được mốc nhận đơn:', upErr);
                return NextResponse.json(
                    { success: false, error: 'Không lưu được xác nhận. Vui lòng thử lại.' }, { status: 500 });
            }
        }

        await supabase.from('StaffNotifications').insert({
            employeeId: null,           // gửi chung cho quầy
            type: 'INFO',
            message: `✅ KTV ${staffName} đã NHẬN đơn ${bill} và đang tới phòng.`,
        });

        console.log(`[Accept Order] ${staffId} nhận đơn ${bill} (item ${itemId})`);
        return NextResponse.json({ success: true, billCode: bill, bookingItemId: itemId });

    } catch (error: any) {
        console.error('Lỗi API accept order:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
