import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * API Gửi tương tác từ KTV
 * POST /api/ktv/interaction
 * Body: { bookingId: string, type: 'WATER' | 'SUPPORT' | 'EMERGENCY' | 'BUY_MORE' | 'EARLY_EXIT' }
 */
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { bookingId, type } = body;

        if (!bookingId || !type) {
            return NextResponse.json({ success: false, error: 'bookingId and type are required' }, { status: 400 });
        }

        const supabase = getSupabaseAdmin();
        if (!supabase) throw new Error('Supabase admin not initialized');

        // 1. Lấy thông tin chi tiết đơn hàng (Phòng, Giường)
        const { data: booking, error: bError } = await supabase
            .from('Bookings')
            .select('roomName, bedId')
            .eq('id', bookingId)
            .single();

        const roomInfo = booking ? `phòng ${booking.roomName || '???'}${booking.bedId ? ` giường ${booking.bedId}` : ''}` : `phòng (không rõ)`;
        const roomUpper = booking ? `Phòng ${booking.roomName || '???'}${booking.bedId ? ` giường ${booking.bedId}` : ''}` : `Phòng (không rõ)`;

        // 2. Map template tin nhắn theo yêu cầu của User
        const messageMap: Record<string, string> = {
            'EARLY_EXIT': `KH ${roomUpper} đang xuống cb đón khách nhé quầy`,
            'WATER': `Yêu cầu mang nước/trà lên ${roomInfo}`,
            'BUY_MORE': `Khách muốn làm thêm, cần lễ tân lên tư vấn ở ${roomInfo}`,
            'SUPPORT': `Báo các vấn đề kỹ thuật hoặc thiếu đồ dùng ở ${roomInfo}`,
            'EMERGENCY': `🚨 KHẨN CẤP: Sự cố lớn tại ${roomUpper}!`
        };

        const finalMessage = messageMap[type] || `Yêu cầu (${type}) tại ${roomInfo}`;

        // 3. Lưu vào bảng StaffNotifications để Lễ tân nhận Realtime
        console.log(`💾 [API KTV Interaction] Inserting notification:`, { bookingId, type, message: finalMessage });
        const { data: nData, error: nError } = await supabase
            .from('StaffNotifications')
            .insert({
                bookingId,
                type,
                message: finalMessage,
                isRead: false
            })
            .select()
            .single();

        if (nError) {
            console.error('❌ [API KTV Interaction] Failed to insert notification:', nError);
            return NextResponse.json({ success: false, error: 'Failed to create internal notification' }, { status: 500 });
        }
        
        console.log('✅ [API KTV Interaction] Notification stored successfully:', nData);
        console.log(`🔔 [API KTV Interaction] Booking ${bookingId} (${roomInfo}) sent ${type}: ${finalMessage}`);
        
        // 4. Gửi thông báo Push
        const { sendPushNotification } = await import('@/lib/push-helper');
        sendPushNotification({
            title: `Yêu cầu từ ${roomUpper}`,
            message: finalMessage,
            targetRoles: ['ADMIN', 'RECEPTIONIST'],
            url: '/reception/dispatch',
        }).catch(err => console.error('❌ [API KTV Interaction] Push notification failed:', err));

        return NextResponse.json({ success: true, message: finalMessage });
    } catch (error: any) {
        console.error('API Error (POST /api/ktv/interaction):', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
