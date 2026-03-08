'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export async function getDispatchData(date: string) {
    try {
        const supabase = getSupabaseAdmin();
        if (!supabase) throw new Error('Supabase admin not initialized');

        // 1. Fetch Staff
        const { data: staffs, error: sError } = await supabase.from('Staff').select('*');
        if (sError) throw sError;

        // 2. Fetch TurnQueue
        const { data: turns, error: tError } = await supabase
            .from('TurnQueue')
            .select('*')
            .eq('date', date)
            .order('queue_position', { ascending: true });
        if (tError) throw tError;

        // 3. Fetch Bookings for selected date
        // bookingDate is "timestamp without time zone"
        const startOfDay = `${date} 00:00:00`;
        const endOfDay = `${date} 23:59:59`;

        const { data: bData, error: bError } = await supabase
            .from('Bookings')
            .select('*')
            .gte('bookingDate', startOfDay)
            .lte('bookingDate', endOfDay)
            .neq('status', 'CANCELLED')
            .order('createdAt', { ascending: true });

        if (bError) throw bError;

        let bookings: any[] = bData || [];

        // 4. Fetch Services FIRST to build map (safer than complex filtering)
        const { data: allServices, error: svcError } = await supabase
            .from('Services')
            .select('id, code, nameVN, nameEN, duration, description') // Added description
            .limit(1000);

        if (svcError) {
            console.error('❌ [Server] Error fetching Services:', svcError.message);
        }
        console.log(`📡 [Server] Fetched: ${allServices?.length || 0} services for mapping`);

        let servicesMap: Record<string, { name: string; duration: number; description: string }> = {};
        if (allServices) {
            allServices.forEach((s: any) => {
                const info = {
                    name: (typeof s.nameVN === 'object' && s.nameVN !== null) ? (s.nameVN.vn || s.nameVN.en || s.nameVN) : (s.nameVN || s.nameEN || `Dịch vụ ${s.code || s.id}`),
                    duration: s.duration ?? 60,
                    description: (typeof s.description === 'object' && s.description !== null) 
                        ? (s.description.vn || s.description.en || '') 
                        : (s.description || '')
                };
                
                // Trình dọn dẹp cuối cùng: Đảm bảo không còn object nào lọt vào UI
                if (typeof info.name === 'object') info.name = String(info.name);
                if (typeof info.description === 'object') info.description = String(info.description);
                if (s.id) servicesMap[String(s.id).trim().toLowerCase()] = info;
                if (s.code) servicesMap[String(s.code).trim().toLowerCase()] = info;
            });
        }
        console.log(`📡 [Server] servicesMap has nhs0002: ${!!servicesMap['nhs0002']}`);

        // 5. Fetch BookingItems separately
        if (bookings.length > 0) {
            const bookingIds = bookings.map(b => b.id);
            const { data: items, error: iError } = await supabase
                .from('BookingItems')
                .select('*')
                .in('bookingId', bookingIds);

            if (iError) {
                console.error('❌ [Server] Error fetching BookingItems:', iError.message);
            }

            // Attach BookingItems (with service info) to each booking
            bookings = bookings.map(b => ({
                ...b,
                BookingItems: (items || [])
                    .filter(i => i.bookingId === b.id)
                    .map(i => {
                        const sId = String(i.serviceId || '').trim().toLowerCase();
                        const svcInfo = servicesMap[sId];
                        
                        // Ưu tiên duration từ database nếu có và > 0
                        let finalDuration = 60; // Mặc định chung
                        if (svcInfo && svcInfo.duration > 0) {
                            finalDuration = svcInfo.duration;
                        } else if (sId.toLowerCase().includes('nhs0000')) {
                            finalDuration = 1;
                        } else {
                            // LOG ĐỂ DEBUG: Tại sao không tìm thấy hoặc duration <= 0?
                            console.warn(`⚠️ [Dispatch] Service lookup failed or duration invalid for sId: "${sId}". svcInfo found: ${!!svcInfo}`);
                        }

                        return {
                            ...i,
                            service_name: svcInfo?.name || `DV ${sId.toUpperCase()}`,
                            serviceName: svcInfo?.name || `DV ${sId.toUpperCase()}`, // Thêm camelCase cho đồng bộ
                            service_description: svcInfo?.description || '',
                            duration: finalDuration,
                        };
                    })
            }));
        }

        console.log(`📡 [Server] Fetched: ${bookings.length} bookings for ${date}`);
        bookings.forEach(b => {
            const totalDur = (b.BookingItems || []).reduce((acc: number, i: any) => acc + (i.duration || 0), 0);
            console.log(`  📋 ${b.billCode}: ${(b.BookingItems || []).length} services, Total Dur: ${totalDur}p`);
            if (b.BookingItems && b.BookingItems.length > 0) {
              console.log(`     - First Item: ${b.BookingItems[0].service_name}, dur=${b.BookingItems[0].duration}`);
            }
        });

        // 6. Fetch Rooms and Beds
        const { data: rooms } = await supabase.from('Rooms').select('*');
        const { data: beds } = await supabase.from('Beds').select('*');

        return {
            success: true,
            data: {
                staffs,
                turns,
                bookings,
                rooms: rooms || [],
                beds: beds || [],
                allServices: allServices || []
            },
            // Gửi kèm log nếu có lỗi svc query
            _debugSvcCount: bookings.length > 0 ? bookings[0].BookingItems?.length : 0
        };
    } catch (error: any) {
        console.error('❌ [Server] getDispatchData error:', error);
        return { success: false, error: error.message || 'Unknown error' };
    }
}

export async function processDispatch(bookingId: string, dispatchData: {
    status: string;
    technicianCode: string | null;
    bedId: string | null;
    roomName: string | null;
    staffAssignments: any[];
    date: string;
    notes?: string; // Ghi chú của điều phối
    itemUpdates?: { id: string, options: any }[]; // Ghi chú cho KTV trong từng item
}) {
    try {
        const supabase = getSupabaseAdmin();
        if (!supabase) throw new Error('Supabase admin not initialized');

        // 1. Update TurnQueue for each assigned staff
        for (const assignment of dispatchData.staffAssignments) {
            const { error: tError } = await supabase
                .from('TurnQueue')
                .update({
                    status: 'working',
                    current_order_id: bookingId,
                    turns_completed: assignment.turnsCompleted,
                    queue_position: assignment.queuePos,
                    estimated_end_time: assignment.endTime
                })
                .eq('employee_id', assignment.ktvId)
                .eq('date', dispatchData.date);

            if (tError) {
                console.error('❌ [Server] TurnQueue update error:', tError);
                throw tError;
            }
        }

        // 2. Update Booking
        const { error: bError } = await supabase
            .from('Bookings')
            .update({
                status: 'PREPARING',
                technicianCode: dispatchData.technicianCode,
                bedId: dispatchData.bedId,
                roomName: dispatchData.roomName,
                notes: dispatchData.notes, // Lưu ghi chú điều phối
                updatedAt: new Date().toISOString()
            })
            .eq('id', bookingId);

        if (bError) {
            console.error('❌ [Server] Booking update error:', bError);
            throw bError;
        }

        // 3. Update BookingItems options (Ghi chú cho KTV)
        if (dispatchData.itemUpdates && dispatchData.itemUpdates.length > 0) {
            for (const item of dispatchData.itemUpdates) {
                await supabase
                    .from('BookingItems')
                    .update({ options: item.options })
                    .eq('id', item.id);
            }
        }

        return { success: true };
    } catch (error: any) {
        console.error('❌ [Server] processDispatch error:', error);
        return { success: false, error: error.message };
    }
}

export async function cancelBooking(bookingId: string, date: string) {
    try {
        const supabase = getSupabaseAdmin();
        if (!supabase) throw new Error('Supabase admin not initialized');

        // 1. Cập nhật trạng thái Booking thành CANCELLED
        const { error: bError } = await supabase
            .from('Bookings')
            .update({ 
                status: 'CANCELLED',
                updatedAt: new Date().toISOString()
            })
            .eq('id', bookingId);

        if (bError) throw bError;

        // 2. Giải phóng KTV trong TurnQueue nếu đang gán cho đơn này
        const { error: tError } = await supabase
            .from('TurnQueue')
            .update({
                status: 'waiting',
                current_order_id: null,
                estimated_end_time: null
            })
            .eq('current_order_id', bookingId)
            .eq('date', date);

        if (tError) {
            console.error('❌ [Server] TurnQueue cleanup error:', tError);
            // Không throw lỗi ở đây để vẫn hoàn tất việc hủy đơn
        }

        return { success: true };
    } catch (error: any) {
        console.error('❌ [Server] cancelBooking error:', error);
        return { success: false, error: error.message };
    }
}

export async function updateBookingStatus(bookingId: string, newStatus: string, date: string) {
    try {
        const supabase = getSupabaseAdmin();
        if (!supabase) throw new Error('Supabase admin not initialized');

        // 1. Cập nhật trạng thái Booking
        const { error: bError } = await supabase
            .from('Bookings')
            .update({ 
                status: newStatus,
                updatedAt: new Date().toISOString()
            })
            .eq('id', bookingId);

        if (bError) throw bError;

        // 2. Nếu trạng thái mới là COMPLETED hoặc CANCELLED, giải phóng KTV trong TurnQueue
        if (newStatus === 'COMPLETED' || newStatus === 'CANCELLED') {
            const { error: tError } = await supabase
                .from('TurnQueue')
                .update({
                    status: 'waiting',
                    current_order_id: null,
                    estimated_end_time: null
                })
                .eq('current_order_id', bookingId)
                .eq('date', date);

            if (tError) {
                console.error('❌ [Server] TurnQueue cleanup error:', tError);
            }
        }

        return { success: true };
    } catch (error: any) {
        console.error('❌ [Server] updateBookingStatus error:', error);
        return { success: false, error: error.message };
    }
}

export async function createQuickBooking(data: {
    customerName: string;
    customerPhone?: string;
    serviceId: string;
    bookingDate: string; // "YYYY-MM-DD"
}) {
    try {
        const supabase = getSupabaseAdmin();
        if (!supabase) throw new Error('Supabase admin not initialized');

        // 1. Tạo billCode ngẫu nhiên (VD: S260307-ABCD)
        const dateStr = data.bookingDate.replace(/-/g, '').substring(2);
        const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
        const billCode = `S${dateStr}-${randomStr}`;

        // 2. Lấy thông tin dịch vụ để lấy giá tiền & thời gian
        const { data: svc, error: sError } = await supabase
            .from('Services')
            .select('priceVND, duration')
            .eq('id', data.serviceId)
            .single();
        
        if (sError) throw new Error(`Không tìm thấy dịch vụ: ${sError.message}`);

        // 3. Tạo Booking
        const { data: booking, error: bError } = await supabase
            .from('Bookings')
            .insert({
                customerName: data.customerName,
                customerPhone: data.customerPhone || '',
                billCode,
                status: 'PENDING',
                bookingDate: `${data.bookingDate} ${new Date().toLocaleTimeString('en-GB')}`,
                totalAmount: svc.priceVND || 0,
                paymentMethod: 'Tiền mặt', // Mặc định
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            })
            .select()
            .single();

        if (bError) throw bError;

        const { error: iError } = await supabase
            .from('BookingItems')
            .insert({
                bookingId: booking.id,
                serviceId: data.serviceId,
                quantity: 1,
                price: svc.priceVND || 0,
                createdAt: new Date().toISOString(),
            });

        if (iError) throw iError;

        return { success: true, bookingId: booking.id };
    } catch (error: any) {
        console.error('❌ [Server] createQuickBooking error:', error);
        return { success: false, error: error.message };
    }
}
