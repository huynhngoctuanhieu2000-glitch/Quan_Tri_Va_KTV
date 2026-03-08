import { NextResponse } from 'next/server';

/**
 * API Gửi tương tác từ KTV
 * POST /api/ktv/interaction
 * Body: { bookingId: string, type: 'WATER' | 'SUPPORT' | 'EMERGENCY' }
 */
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { bookingId, type } = body;

        if (!bookingId || !type) {
            return NextResponse.json({ success: false, error: 'bookingId and type are required' }, { status: 400 });
        }

        console.log(`🔔 [API KTV Interaction] Booking ${bookingId} sent ${type}`);
        
        // 1. Gửi thông báo Push cho Lễ tân và Quản lý
        try {
            const baseUrl = request.url.split('/api')[0];
            const messageMap: any = {
                'WATER': 'Khách cần nước uống',
                'SUPPORT': 'Cần hỗ trợ gấp tại phòng',
                'EMERGENCY': 'BÁO ĐỘNG: Khách đang giận dữ'
            };
            
            await fetch(`${baseUrl}/api/notifications/push`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: `Yêu cầu từ phòng: ${bookingId.split('-')[1] || bookingId}`, 
                    message: messageMap[type] || `Yêu cầu: ${type}`,
                    url: '/reception/dispatch',
                    // targetStaffIds không truyền để mặc định gửi cho admin/reception
                })
            });
        } catch (err) {
            console.error('❌ [API KTV Interaction] Push notification failed:', err);
        }

        return NextResponse.json({ success: true, message: `Sent interaction: ${type}` });
    } catch (error: any) {
        console.error('API Error (POST /api/ktv/interaction):', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
