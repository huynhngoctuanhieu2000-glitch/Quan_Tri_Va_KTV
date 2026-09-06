import { NextResponse } from 'next/server';
import { BookingModificationService } from '@/lib/services/BookingModificationService';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { bookingId, itemId, reason, cancelCredit } = body;

        if (!bookingId || !itemId) {
            return NextResponse.json(
                { success: false, error: 'Thiếu bookingId hoặc itemId' },
                { status: 400 }
            );
        }

        // Mặc định KHÔNG cộng giờ đã làm — hai trong ba tình huống huỷ là lỗi KTV.
        // Quầy muốn cho thì phải bật công tắc trong hộp thoại.
        const credit = cancelCredit === 'WORKED' ? 'WORKED' : 'NONE';

        const result = await BookingModificationService.cancelBookingItem(
            bookingId,
            itemId,
            reason || '',
            credit
        );

        if (!result.success) {
            return NextResponse.json({ success: false, error: result.error }, { status: 400 });
        }

        return NextResponse.json({ success: true, data: result });
    } catch (error: any) {
        console.error('❌ [API] Cancel Booking Item Error:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Lỗi server' },
            { status: 500 }
        );
    }
}
