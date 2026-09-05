import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { KtvDisciplineService } from '@/lib/services/KtvDisciplineService';
import { ktvDisplayLabel } from '@/lib/constants/staff.constants';

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
        // Loại A/B/D hiện MÃ để khớp bảng điều phối; loại C ("Nhập tay") mới hiện tên.
        const staffName = ktvDisplayLabel(staffData?.work_type, staffId, staffData?.full_name);
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
        const { data: itemData } = await supabase
            .from('BookingItems').select('technicianCodes, status, options').eq('id', itemId).maybeSingle();
        if (itemData && itemData.technicianCodes) {
            // So khớp KHÔNG phân biệt hoa thường — chỗ tra đơn phía trên cũng vậy.
            // Trước đây so bằng `!==` thuần: lệch một chữ hoa là không gỡ được, KTV
            // từ chối xong vẫn dính đơn.
            const me = String(staffId).toLowerCase();
            const newTechCodes = itemData.technicianCodes.filter((id: string) => String(id).toLowerCase() !== me);
            // Nếu không còn KTV nào thì đưa về PREPARING để Lễ tân điều phối lại
            const newStatus = newTechCodes.length === 0 ? 'PREPARING' : itemData.status;

            // Xoá mốc "đã nhận đơn" CỦA RIÊNG người từ chối. Không xoá thì lúc quầy
            // điều phối lại chính đơn này cho họ, màn KTV coi như đã xác nhận rồi và
            // bỏ luôn bước nhận/từ chối. Mốc của đồng nghiệp giữ nguyên.
            const opts = typeof (itemData as any).options === 'string'
                ? JSON.parse((itemData as any).options || '{}')
                : ((itemData as any).options || {});
            const acceptedByStaff = { ...(opts.acceptedByStaff || {}) };
            delete acceptedByStaff[String(staffId).toUpperCase()];
            const nextOpts: Record<string, any> = { ...opts, acceptedByStaff };
            if (String(nextOpts.acceptedBy || '').toLowerCase() === me) {
                delete nextOpts.acceptedAt;
                delete nextOpts.acceptedBy;
            }

            await supabase.from('BookingItems').update({ 
                technicianCodes: newTechCodes,
                status: newStatus,
                options: nextOpts
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
        //
        // Type PHẢI có rule trong SystemConfigs.notification_rules. Trước đây dùng
        // 'WARNING' — type không có rule — mà mọi bộ lọc trong NotificationProvider
        // đều là `if (rule && ...)`, nên thông báo lọt qua hết và phát cho TẤT CẢ
        // vai trò: một KTV từ chối thì cả spa cùng nhận.
        const { data: bookingRow } = await supabase
            .from('BookingItems').select('bookingId').eq('id', itemId).maybeSingle();
        const { data: bk } = (bookingRow as any)?.bookingId
            ? await supabase.from('Bookings').select('billCode').eq('id', (bookingRow as any).bookingId).maybeSingle()
            : { data: null };
        const billLabel = (bk as any)?.billCode || itemId;

        await supabase.from('StaffNotifications').insert({
            employeeId: null,           // không nhắm riêng ai — lọc theo vai trò
            type: 'KTV_REJECT_ORDER',
            message: `⛔ KTV ${staffName} vừa TỪ CHỐI đơn ${billLabel}. Lý do: ${reason}`,
            bookingId: (bookingRow as any)?.bookingId || null,
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
