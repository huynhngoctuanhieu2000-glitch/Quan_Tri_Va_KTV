import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { KtvDisciplineService } from '@/lib/services/KtvDisciplineService';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { staffId, bookingItemId, reason } = body;

        if (!staffId || !bookingItemId || !reason) {
            return NextResponse.json({ success: false, error: 'Thiếu thông tin bắt buộc (staffId, bookingItemId, reason)' }, { status: 400 });
        }

        const supabase = getSupabaseAdmin();
        if (!supabase) {
            return NextResponse.json({ success: false, error: 'Supabase init failed' }, { status: 500 });
        }

        // Màn hình KTV từng gửi nhầm BOOKING id vào đây (nextBookingId). Chấp nhận
        // cả hai: nếu id không khớp BookingItem nào thì coi như booking id và tìm
        // đơn con đang gán cho chính KTV này.
        let itemId: string = bookingItemId;
        const { data:directItem } = await supabase
            .from('BookingItems').select('id').eq('id', bookingItemId).maybeSingle();
        if (!directItem) {
            const { data: candidates } = await supabase
                .from('BookingItems')
                .select('id, technicianCodes, status')
                .eq('bookingId', bookingItemId);
            const mine = (candidates || []).find((i: any) =>
                (i.technicianCodes || []).some((t: string) => String(t).toLowerCase() === String(staffId).toLowerCase()));
            if (!mine) {
                return NextResponse.json(
                    { success: false, error: 'Không tìm thấy đơn đang gán cho bạn.' }, { status: 404 });
            }
            itemId = mine.id;
        }

        // 1. Lấy thông tin KTV
        const { data: staffData } = await supabase.from('Staff').select('full_name, work_type').eq('id', staffId).single();
        const staffName = staffData?.full_name || staffId;
        const isTypeD = staffData?.work_type === 'TYPE_D';

        // 2. Tính thời gian làm việc liên tục
        const { totalMins } = await KtvDisciplineService.calculateContinuousWorkMins(supabase, staffId);
        
        // 3. Lấy cấu hình miễn phạt
        const { data: exemptData } = await supabase.from('SystemConfigs').select('value').eq('key', 'ktv_continuous_work_exempt_hours').single();
        const exemptHours = exemptData?.value ? Number(exemptData.value) : 4;
        
        const isExempted = totalMins >= (exemptHours * 60);

        // 4. Thực hiện phạt (hoặc miễn phạt nếu đạt)
        //
        // Loại D KHÔNG dùng hệ điểm kỷ luật của A/B/C. Quy chế loại D: từ chối
        // tua đã gán → trừ GẤP 3 LẦN thời lượng gói dịch vụ vào giờ tích lũy
        // (gói 60 phút → trừ 3 giờ). Hàm deductOrderReject() có sẵn từ lâu
        // nhưng chưa nơi nào gọi, nên luật này chưa từng được áp dụng.
        let disciplineResult: any = null;
        let hoursDeducted = 0;

        if (isTypeD) {
            if (!isExempted) {
                const { data: item } = await supabase
                    .from('BookingItems').select('serviceId, segments').eq('id', itemId).maybeSingle();

                // Thời lượng gói: ưu tiên phút đã gán cho chính KTV này, không
                // có thì lấy thời lượng chuẩn của dịch vụ.
                let mins = 0;
                try {
                    const segs = typeof item?.segments === 'string' ? JSON.parse(item.segments) : (item?.segments || []);
                    for (const sg of (Array.isArray(segs) ? segs : [])) {
                        if (sg?.ktvId && String(sg.ktvId).toLowerCase() === String(staffId).toLowerCase()) {
                            mins += Number(sg.duration) || 0;
                        }
                    }
                } catch { /* dùng thời lượng chuẩn bên dưới */ }

                if (mins <= 0 && item?.serviceId) {
                    const { data: svc } = await supabase
                        .from('Services').select('duration').eq('id', item.serviceId).maybeSingle();
                    mins = Number(svc?.duration) || 60;
                }
                if (mins <= 0) mins = 60;

                const { KtvTypeDDisciplineService } = await import('@/lib/services/KtvTypeDDisciplineService');
                const { getBusinessToday } = await import('@/lib/business-date');
                const workDate = await getBusinessToday(supabase);

                hoursDeducted = await KtvTypeDDisciplineService.deductOrderReject(
                    supabase, staffId, workDate, itemId, mins,
                );
                console.log(`[Type D] ${staffId} từ chối tua ${bookingItemId} (${mins}p) → trừ ${hoursDeducted}h`);
            }
        } else {
            disciplineResult = await KtvDisciplineService.deductPoints(
                supabase,
                staffId,
                'ORDER_REJECT',
                `Từ chối nhận đơn ${bookingItemId} - Lý do: ${reason}`,
                isExempted
            );
        }

        // 5. Gỡ KTV khỏi BookingItem và TurnQueue
        // Lấy BookingItem hiện tại
        const { data: itemData } = await supabase.from('BookingItems').select('technicianCodes, status').eq('id', itemId).maybeSingle();
        if (itemData && itemData.technicianCodes) {
            const newTechCodes = itemData.technicianCodes.filter((id: string) => id !== staffId);
            // Nếu không còn KTV nào thì đưa về PREPARING để Lễ tân điều phối lại
            const newStatus = newTechCodes.length === 0 ? 'PREPARING' : itemData.status;

            await supabase.from('BookingItems').update({ 
                technicianCodes: newTechCodes,
                status: newStatus
            }).eq('id', itemId);
        }

        // Cập nhật TurnQueue của KTV này (gỡ đơn đang làm)
        const { getBusinessToday } = await import('@/lib/business-date');
        const dateStr = await getBusinessToday(supabase);
        const { data: turnData } = await supabase.from('TurnQueue')
            .select('id, booking_item_ids')
            .eq('employee_id', staffId)
            .eq('date', dateStr)
            .single();

        if (turnData) {
            let newBookingItemIds = turnData.booking_item_ids || [];
            if (newBookingItemIds.includes(itemId)) {
                newBookingItemIds = newBookingItemIds.filter((id: string) => id !== itemId);
            }
            
            await supabase.from('TurnQueue').update({
                current_order_id: newBookingItemIds.length > 0 ? newBookingItemIds[0] : null,
                booking_item_ids: newBookingItemIds,
                status: newBookingItemIds.length > 0 ? 'assigned' : 'waiting'
            }).eq('id', turnData.id);
        }

        // 6. Gửi thông báo cho Lễ tân
        await supabase.from('StaffNotifications').insert({
            employeeId: null, // Gửi chung
            type: 'WARNING',
            message: `KTV ${staffName} vừa từ chối phục vụ đơn ${itemId}. Lý do: ${reason}`
        });

        return NextResponse.json({
            success: true,
            isExempted,
            // Loại D trừ GIỜ tích lũy, A/B/C trừ ĐIỂM kỷ luật — hai hệ khác nhau.
            hoursDeducted: isTypeD ? hoursDeducted : 0,
            penaltyPoints: disciplineResult?.penaltyPoints ?? 0,
            newTotal: disciplineResult?.newTotal ?? null,
            totalMins
        });

    } catch (error: any) {
        console.error('Lỗi API reject order:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
