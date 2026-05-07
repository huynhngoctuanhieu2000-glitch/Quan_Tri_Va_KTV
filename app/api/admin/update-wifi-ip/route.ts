import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(request: Request) {
    try {
        // Lấy IP của người dùng từ headers
        const forwardedFor = request.headers.get('x-forwarded-for');
        const realIp = request.headers.get('x-real-ip');
        const clientIp = forwardedFor ? forwardedFor.split(',')[0].trim() : (realIp || 'unknown');

        if (clientIp === 'unknown') {
            return NextResponse.json({ success: false, error: 'Không thể xác định địa chỉ IP mạng của bạn.' }, { status: 400 });
        }

        const supabase = getSupabaseAdmin();
        if (!supabase) {
            return NextResponse.json({ success: false, error: 'Supabase không được khởi tạo.' }, { status: 500 });
        }

        // Cập nhật cấu hình IP vào DB
        const { error: updateError } = await supabase
            .from('SystemConfigs')
            .update({ value: [clientIp] })
            .eq('key', 'spa_wifi_ips');

        if (updateError) {
            console.error('❌ [Update Wifi IP] Lỗi cập nhật Supabase:', updateError);
            return NextResponse.json({ success: false, error: 'Lỗi cập nhật cấu hình: ' + updateError.message }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            message: 'Cập nhật IP Wi-Fi thành công!',
            newIp: clientIp
        });

    } catch (error: any) {
        console.error('❌ [Update Wifi IP] Unhandled error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
