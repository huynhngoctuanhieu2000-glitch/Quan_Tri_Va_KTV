'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { sendPushNotification } from '@/lib/push-helper';

export async function getDispatchData(date: string) {
    try {
        const supabase = getSupabaseAdmin();
        if (!supabase) throw new Error('Supabase admin not initialized');

        // 1. Fetch Staff
        const { data: staffs, error: sError } = await supabase.from('Staff').select('*');
        if (sError) throw sError;

        const { data: turns, error: tError } = await supabase
            .from('TurnQueue')
            .select('*')
            .eq('date', date)
            .order('turns_completed', { ascending: true })
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
            .select('id, code, nameVN, nameEN, duration, description, category, priceVND, imageUrl')
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
                .select('*, segments')
                .in('bookingId', bookingIds);

            if (iError) {
                console.error('❌ [Server] Error fetching BookingItems:', iError.message);
            }

            // Attach BookingItems (with service info) to each booking
            bookings = bookings.map(b => ({
                ...b,
                BookingItems: (items || [])
                    .filter(i => i.bookingId === b.id)
                    .sort((a, b) => {
                        const matchA = a.id.match(/-item(\d+)$/);
                        const matchB = b.id.match(/-item(\d+)$/);
                        
                        if (matchA && matchB) {
                            return parseInt(matchA[1], 10) - parseInt(matchB[1], 10);
                        } else if (matchA && !matchB) {
                            return 1; // a is add-on, b is original -> a comes after b
                        } else if (!matchA && matchB) {
                            return -1; // a is original, b is add-on -> a comes before b
                        }
                        
                        // Both are original items, fallback to localeCompare
                        return a.id.localeCompare(b.id);
                    })
                    .map(i => {
                        const sId = String(i.serviceId || '').trim().toLowerCase();
                        const svcInfo = servicesMap[sId];
                        
                        // Ưu tiên duration từ database nếu có
                        let finalDuration = svcInfo?.duration !== undefined ? svcInfo.duration : 0;
                        if (sId.toLowerCase().includes('nhs0000')) {
                            finalDuration = 1;
                        } else if (!svcInfo) {
                            // Mặc định cho những dịch vụ không tìm thấy trong DB (có thể là lỗi data cũ)
                            finalDuration = 60; 
                            console.warn(`⚠️ [Dispatch] Service lookup failed for sId: "${sId}". Defaulting to 60p.`);
                        }

                        return {
                            ...i,
                            service_name: svcInfo?.name || `DV ${sId.toUpperCase()}`,
                            serviceName: svcInfo?.name || `DV ${sId.toUpperCase()}`, // Thêm camelCase cho đồng bộ
                            service_description: svcInfo?.description || '',
                            duration: finalDuration,
                            timeStart: i.timeStart || null,
                            timeEnd: i.timeEnd || null,
                            status: i.status || 'NEW',
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
        const { data: configs } = await supabase.from('SystemConfigs').select('*');

        const transitionConfig = configs?.find((c: any) => c.key === 'room_transition_time' || c.key === 'thoi_gian_doi_phong');
        const roomTransitionTime = transitionConfig ? (parseInt(transitionConfig.value, 10) || 1) : 1;

        return {
            success: true,
            data: {
                staffs,
                turns,
                bookings,
                rooms: rooms || [],
                beds: beds || [],
                allServices: allServices || [],
                roomTransitionTime
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
    notes?: string;
    itemUpdates?: { 
        id: string, 
        roomName?: string | null, 
        bedId?: string | null, 
        technicianCodes?: string[], 
        status?: string,
        segments?: any[],
        options: any 
    }[];
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
                    booking_item_id: assignment.bookingItemId, 
                    room_id: assignment.roomId, // Lưu phòng gán cho KTV này
                    bed_id: assignment.bedId, // Lưu giường gán cho KTV này
                    turns_completed: assignment.turnsCompleted,
                    queue_position: assignment.queuePos,
                    start_time: assignment.startTime,
                    estimated_end_time: assignment.endTime,
                    last_served_at: new Date().toISOString()
                })
                .eq('employee_id', assignment.ktvId)
                .eq('date', dispatchData.date);

            if (tError) {
                console.error('❌ [Server] TurnQueue update error:', tError);
                throw tError;
            }
        }

        // 2. Update Booking (Dữ liệu tổng quát cho Bill)
        const { error: bError } = await supabase
            .from('Bookings')
            .update({
                status: dispatchData.status || 'PREPARING',
                technicianCode: dispatchData.technicianCode,
                bedId: dispatchData.bedId,
                roomName: dispatchData.roomName,
                notes: dispatchData.notes,
                updatedAt: new Date().toISOString()
            })
            .eq('id', bookingId);

        if (bError) {
            console.error('❌ [Server] Booking update error:', bError);
            throw bError;
        }

        // 3. Update BookingItems (Dữ liệu chi tiết từng dịch vụ)
        if (dispatchData.itemUpdates && dispatchData.itemUpdates.length > 0) {
            for (const item of dispatchData.itemUpdates) {
                await supabase
                    .from('BookingItems')
                    .update({ 
                        roomName: item.roomName,
                        bedId: item.bedId,
                        technicianCodes: item.technicianCodes || [],
                        status: item.status || 'PREPARING',
                        segments: item.segments || [],
                        options: item.options 
                    })
                    .eq('id', item.id);
            }
        }

        // 4. Send background push and realtime notification to KTVs
        if (dispatchData.staffAssignments && dispatchData.staffAssignments.length > 0) {
            const staffIds = dispatchData.staffAssignments.map(a => a.ktvId).filter(Boolean);
            
            // 4a. Insert StaffNotifications for realtime UI updates
            for (const staffId of staffIds) {
                await supabase.from('StaffNotifications').insert({
                    bookingId: bookingId,
                    employeeId: staffId,
                    type: 'NEW_ORDER',
                    message: `Bạn được phân công cho đơn hàng ${bookingId}. Vui lòng kiểm tra ứng dụng.`,
                    isRead: false
                });
            }

            // 4b. Send Push Notification for OS level alerts
            if (staffIds.length > 0) {
                await sendPushNotification({
                    title: 'Bạn có ca làm mới! 💆',
                    message: `Bạn được phân công cho đơn hàng ${bookingId}. Vui lòng kiểm tra ứng dụng.`,
                    targetStaffIds: staffIds,
                    url: '/ktv/dashboard'
                }).catch(err => console.error('Push error:', err));
            }
        }

        const { syncTurnsForDate } = await import('@/lib/turn-sync');
        await syncTurnsForDate(dispatchData.date);

        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function saveDraftDispatch(bookingId: string, dispatchData: {
    technicianCode: string | null;
    bedId: string | null;
    roomName: string | null;
    notes?: string;
    itemUpdates?: { 
        id: string, 
        roomName?: string | null, 
        bedId?: string | null, 
        technicianCodes?: string[], 
        segments?: any[],
        options: any 
    }[];
}) {
    try {
        const supabase = getSupabaseAdmin();
        if (!supabase) throw new Error('Supabase admin not initialized');

        // 1. Update Booking (Dữ liệu tổng quát cho Bill, không đổi status)
        const { error: bError } = await supabase
            .from('Bookings')
            .update({
                technicianCode: dispatchData.technicianCode,
                bedId: dispatchData.bedId,
                roomName: dispatchData.roomName,
                notes: dispatchData.notes,
                updatedAt: new Date().toISOString()
            })
            .eq('id', bookingId);

        if (bError) {
            console.error('❌ [Server] Booking draft update error:', bError);
            throw bError;
        }

        // 2. Update BookingItems (Dữ liệu chi tiết từng dịch vụ, không đổi status)
        if (dispatchData.itemUpdates && dispatchData.itemUpdates.length > 0) {
            for (const item of dispatchData.itemUpdates) {
                await supabase
                    .from('BookingItems')
                    .update({ 
                        roomName: item.roomName,
                        bedId: item.bedId,
                        technicianCodes: item.technicianCodes || [],
                        segments: item.segments || [],
                        options: item.options 
                    })
                    .eq('id', item.id);
            }
        }

        // Fetch bookingDate to sync turns correctly
        const { data: bData } = await supabase.from('Bookings').select('bookingDate').eq('id', bookingId).single();
        if (bData && bData.bookingDate) {
            const dateStr = bData.bookingDate.split('T')[0];
            const { syncTurnsForDate } = await import('@/lib/turn-sync');
            await syncTurnsForDate(dateStr);
        }

        return { success: true };
    } catch (error: any) {
        console.error('❌ [Server] saveDraftDispatch error:', error);
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

        // Cập nhật trạng thái các BookingItems chưa hoàn thành về CANCELLED
        const { error: itemError } = await supabase
            .from('BookingItems')
            .update({ status: 'CANCELLED' })
            .eq('bookingId', bookingId)
            .neq('status', 'DONE')
            .neq('status', 'CANCELLED');
            
        if (itemError) console.error('❌ [Server] BookingItems update error:', itemError);

        // 2. Giải phóng KTV trong TurnQueue nếu đang gán cho đơn này
        const { error: tError } = await supabase
            .from('TurnQueue')
            .update({
                status: 'waiting',
                current_order_id: null,
                booking_item_id: null,
                room_id: null,
                bed_id: null,
                start_time: null,
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

        // Cập nhật trạng thái các BookingItems nếu Booking được hoàn thành / huỷ
        if (['COMPLETED', 'DONE', 'CANCELLED'].includes(newStatus)) {
            const { error: itemError } = await supabase
                .from('BookingItems')
                .update({ status: newStatus })
                .eq('bookingId', bookingId)
                .neq('status', 'DONE')
                .neq('status', 'CANCELLED');
                
            if (itemError) console.error('❌ [Server] BookingItems update error:', itemError);
        } else if (newStatus === 'IN_PROGRESS') {
            const now = new Date().toISOString();
            // Cập nhật timeStart cho Bookings nếu chưa có
            await supabase.from('Bookings').update({ timeStart: now }).eq('id', bookingId).is('timeStart', null);

            // Cập nhật tất cả các items đang chờ thành IN_PROGRESS
            const { error: itemError } = await supabase
                .from('BookingItems')
                .update({ status: 'IN_PROGRESS', timeStart: now })
                .eq('bookingId', bookingId)
                .in('status', ['WAITING', 'PREPARING', 'NEW']);
            if (itemError) console.error('❌ [Server] BookingItems start error:', itemError);

            // Cập nhật TurnQueue thành working cho các KTV liên quan
            const { error: tError } = await supabase
                .from('TurnQueue')
                .update({ status: 'working', start_time: new Date().toLocaleTimeString('en-US', { hour12: false }) })
                .eq('current_order_id', bookingId)
                .eq('date', date)
                .in('status', ['waiting', 'working']);
            if (tError) console.error('❌ [Server] TurnQueue start error:', tError);
        }

        // 2. Nếu trạng thái mới là COMPLETED, DONE hoặc CANCELLED, giải phóng KTV trong TurnQueue
        if (newStatus === 'COMPLETED' || newStatus === 'DONE' || newStatus === 'CANCELLED') {
            // Lấy tất cả KTV đang làm đơn hàng này
            const { data: turnsToRelease } = await supabase
                .from('TurnQueue')
                .select('id, turns_completed, status')
                .eq('current_order_id', bookingId)
                .eq('date', date);

            if (turnsToRelease && turnsToRelease.length > 0) {
                for (const turn of turnsToRelease) {
                    // Tua đã được tính tự động từ lúc gán đơn (qua API /api/turns), nên ở đây không cộng thêm nữa.
                    let newTurnsCompleted = turn.turns_completed || 0;

                    const { error: tError } = await supabase
                        .from('TurnQueue')
                        .update({
                            status: 'waiting',
                            current_order_id: null,
                            booking_item_id: null,
                            start_time: null,
                            estimated_end_time: null,
                            turns_completed: newTurnsCompleted
                        })
                        .eq('id', turn.id);

                    if (tError) {
                        console.error('❌ [Server] TurnQueue cleanup error:', tError);
                    }
                }
            }
        }

        const { syncTurnsForDate } = await import('@/lib/turn-sync');
        await syncTurnsForDate(date);

        return { success: true };
    } catch (error: any) {
        console.error('❌ [Server] updateBookingStatus error:', error);
        return { success: false, error: error.message };
    }
}

export async function updateBookingItemStatus(itemIds: string[], newStatus: string, date: string, bookingId: string) {
    try {
        const supabase = getSupabaseAdmin();
        if (!supabase) throw new Error('Supabase admin not initialized');

        // Cập nhật trạng thái các BookingItems
        const { error: itemError } = await supabase
            .from('BookingItems')
            .update({ status: newStatus })
            .in('id', itemIds);
            
        if (itemError) throw itemError;

        if (newStatus === 'IN_PROGRESS') {
            const now = new Date().toISOString();
            
            // Cập nhật timeStart cho Bookings nếu chưa có
            await supabase.from('Bookings').update({ timeStart: now }).eq('id', bookingId).is('timeStart', null);

            // Cập nhật timeStart cho các items
            await supabase
                .from('BookingItems')
                .update({ timeStart: now })
                .in('id', itemIds);

            // Cập nhật TurnQueue thành working
            await supabase
                .from('TurnQueue')
                .update({ status: 'working', start_time: new Date().toLocaleTimeString('en-US', { hour12: false }) })
                .eq('current_order_id', bookingId)
                .in('booking_item_id', itemIds)
                .eq('date', date)
                .in('status', ['waiting', 'working']);
        }

        if (newStatus === 'COMPLETED' || newStatus === 'DONE' || newStatus === 'CANCELLED') {
            // Lấy tất cả KTV đang làm các item này
            const { data: turnsToRelease } = await supabase
                .from('TurnQueue')
                .select('id, turns_completed, status')
                .eq('current_order_id', bookingId)
                .in('booking_item_id', itemIds)
                .eq('date', date);

            if (turnsToRelease && turnsToRelease.length > 0) {
                for (const turn of turnsToRelease) {
                    let newTurnsCompleted = turn.turns_completed || 0;
                    await supabase
                        .from('TurnQueue')
                        .update({
                            status: 'waiting',
                            current_order_id: null,
                            booking_item_id: null,
                            start_time: null,
                            estimated_end_time: null,
                            turns_completed: newTurnsCompleted
                        })
                        .eq('id', turn.id);
                }
            }
        }
        
        // Auto-update Booking status based on remaining items
        const { data: allItems } = await supabase.from('BookingItems').select('status').eq('bookingId', bookingId);
        if (allItems && allItems.length > 0) {
            const statuses = allItems.map(i => i.status);
            let bStatus = 'NEW';
            if (statuses.includes('IN_PROGRESS')) bStatus = 'IN_PROGRESS';
            else if (statuses.includes('PREPARING')) bStatus = 'PREPARING';
            else if (statuses.every(s => ['COMPLETED', 'DONE', 'CANCELLED'].includes(s))) bStatus = 'COMPLETED';
            else if (statuses.includes('WAITING') || statuses.includes('NEW')) bStatus = 'NEW';
            
            await supabase.from('Bookings').update({ status: bStatus }).eq('id', bookingId);
        }

        const { syncTurnsForDate } = await import('@/lib/turn-sync');
        await syncTurnsForDate(date);

        return { success: true };
    } catch (error: any) {
        console.error('❌ [Server] updateBookingItemStatus error:', error);
        return { success: false, error: error.message };
    }
}

export async function createQuickBooking(data: {
    customerName: string;
    customerPhone?: string;
    customerEmail?: string;
    serviceId: string;
    bookingDate: string; // "YYYY-MM-DD"
    customerLang?: string; // Language code: vi, en, kr, jp, cn
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
        const bookingId = crypto.randomUUID();
        const { data: booking, error: bError } = await supabase
            .from('Bookings')
            .insert({
                id: bookingId,
                customerName: data.customerName,
                customerPhone: data.customerPhone || '',
                customerEmail: data.customerEmail || '',
                billCode,
                status: 'NEW',
                customerLang: data.customerLang || 'vi',
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
                id: crypto.randomUUID(),
                bookingId: booking.id,
                serviceId: data.serviceId,
                quantity: 1,
                price: svc.priceVND || 0,
            });

        if (iError) throw iError;

        // 4. Insert Realtime StaffNotification
        const msg = `Khách ${data.customerName} vừa được tạo đơn. Hãy nhanh chóng điều phối!`;
        await supabase.from('StaffNotifications').insert({
            bookingId: bookingId,
            employeeId: null, // Global cho quầy
            type: 'NEW_ORDER',
            message: msg,
            isRead: false
        });

        // 5. Send background push to Receptionists/Admins
        await sendPushNotification({
            title: 'Có Đơn Hàng Mới! 📋',
            message: msg,
            targetRoles: ['ADMIN', 'RECEPTIONIST'],
            url: '/reception/dispatch'
        }).catch(err => console.error('Push error:', err));

        return { success: true, bookingId: booking.id };
    } catch (error: any) {
        console.error('❌ [Server] createQuickBooking error:', error);
        return { success: false, error: error.message };
    }
}

export async function addAddonServices(bookingId: string, items: { serviceId: string; qty: number }[], adminId: string = 'ADMIN') {
    try {
        const supabase = getSupabaseAdmin();
        if (!supabase) throw new Error('Supabase admin not initialized');

        const vnTimeStr = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });

        // 1. Lấy đơn hàng hiện tại
        const { data: booking, error: bookingError } = await supabase
            .from('Bookings')
            .select('*')
            .eq('id', bookingId)
            .single();

        if (bookingError || !booking) throw new Error('Không tìm thấy đơn hàng');

        // 2. Lấy thông tin giá dịch vụ và tính tiền, thời lượng
        const serviceIds = items.map(i => i.serviceId);
        const { data: allServices, error: sError } = await supabase
            .from('Services')
            .select('*')
            .in('id', serviceIds);

        if (sError) throw sError;

        let totalVND = 0;
        let addedDuration = 0;
        const detailedItems = items.map(item => {
            const serviceDef = allServices?.find(s => s.id === item.serviceId);
            const price = serviceDef?.priceVND || 0;
            const duration = serviceDef?.duration || 60;
            const name = (typeof serviceDef?.nameVN === 'object' && serviceDef?.nameVN !== null) ? (serviceDef?.nameVN.vn || serviceDef?.nameVN.en || serviceDef?.nameVN) : (serviceDef?.nameVN || serviceDef?.nameEN || `Dịch vụ ${item.serviceId}`);
            
            totalVND += price * item.qty;
            addedDuration += duration * item.qty;

            return {
                ...item,
                priceOriginal: price,
                duration,
                name
            };
        });

        // 3. Chuẩn bị data cho BookingItems
        const { count: currentItemCount } = await supabase
            .from('BookingItems')
            .select('*', { count: 'exact', head: true })
            .eq('bookingId', bookingId);

        const nextIndex = (currentItemCount || 0) + 1;

        const timestamp = Date.now();
        const itemsToInsert = detailedItems.map((item, index) => {
            return {
                id: `${bookingId}-addon-${timestamp}-${index}`,
                bookingId: bookingId,
                serviceId: item.serviceId,
                quantity: item.qty,
                price: item.priceOriginal,
                status: 'WAITING',
                technicianCodes: [booking.technicianCode].filter(Boolean),
                options: { isAddon: true, isPaid: false }
            };
        });

        // 4. Insert vào BookingItems
        const { error: itemsError } = await supabase
            .from('BookingItems')
            .insert(itemsToInsert);

        if (itemsError) throw itemsError;

        // 5. Update tổng tiền Bookings
        const newTotalAmount = (Number(booking.totalAmount) || 0) + totalVND;
        const { error: updateBookingError } = await supabase
            .from('Bookings')
            .update({ totalAmount: newTotalAmount, updatedAt: vnTimeStr })
            .eq('id', bookingId);
            
        if (updateBookingError) throw updateBookingError;

        // 6. Update TurnQueue (tăng estimated_end_time + nối addon item ID vào booking_item_id)
        // ⚠️ KHÔNG tăng turns_completed — vì add-on chung 1 bill = chung 1 tua
        const newItemIds = itemsToInsert.map(i => i.id);
        
        if (booking.technicianCode) {
            // Lấy tất cả ktv được gán cho đơn hàng này
            const ktvIds = booking.technicianCode.split(',').map((id: string) => id.trim());
            
            for (const ktvId of ktvIds) {
                const { data: turn, error: turnError } = await supabase
                    .from('TurnQueue')
                    .select('*')
                    .eq('current_order_id', bookingId)
                    .eq('employee_id', ktvId)
                    .maybeSingle();

                if (turn) {
                    const updateData: any = {};

                    // 6a. Tăng estimated_end_time
                    if (turn.estimated_end_time) {
                        const [h, m, s] = turn.estimated_end_time.split(':').map(Number);
                        const d = new Date();
                        d.setHours(h, m, s || 0);
                        d.setMinutes(d.getMinutes() + addedDuration);
                        
                        updateData.estimated_end_time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
                    }

                    // 6b. Nối addon item IDs vào booking_item_id (format: "id1,id2,id3")
                    // Để KTV Dashboard tính tiền tua theo TỔNG duration tất cả items (chung 1 tua)
                    const existingItemIds = turn.booking_item_id 
                        ? String(turn.booking_item_id).split(',').map((s: string) => s.trim()).filter(Boolean)
                        : [];
                    const mergedItemIds = [...new Set([...existingItemIds, ...newItemIds])];
                    updateData.booking_item_id = mergedItemIds.join(',');

                    await supabase
                        .from('TurnQueue')
                        .update(updateData)
                        .eq('id', turn.id);
                }
            }
        }

        // 7. Tạo StaffNotification (Ghi nhận log hệ thống)
        const addedServiceNames = detailedItems.map(i => i.name).join(', ');
        await supabase
            .from('StaffNotifications')
            .insert({
                bookingId: bookingId,
                employeeId: null,
                type: 'ADDON_SERVICE',
                message: `Phát sinh chưa thu: Đơn ${booking.billCode || bookingId} vừa được thêm ${addedServiceNames} (${totalVND.toLocaleString()}đ).`,
                isRead: false,
                createdAt: vnTimeStr
            });

        // 8. Gửi Push Notification cho Lễ tân
        try {
            await sendPushNotification({
                title: 'Dịch vụ phát sinh (Chưa thu)',
                message: `Đơn ${booking.billCode || bookingId} vừa thêm: ${addedServiceNames}`,
                targetRoles: ['RECEPTIONIST', 'ADMIN'],
                url: `/reception/dispatch?bookingId=${bookingId}`
            });
        } catch (pushErr) {
            console.error('⚠️ [Add-on] Failed to send push notification:', pushErr);
        }

        return { success: true, newTotalAmount, newItems: itemsToInsert };
    } catch (error: any) {
        console.error("❌ [Server] Lỗi thêm dịch vụ phụ (Add-on):", error.message);
        return { success: false, error: error.message };
    }
}

export async function confirmAddonPayment(bookingId: string) {
    try {
        const supabase = getSupabaseAdmin();
        if (!supabase) throw new Error('Supabase admin not initialized');

        // Lấy tất cả items của booking này
        const { data: items, error: fetchError } = await supabase
            .from('BookingItems')
            .select('*')
            .eq('bookingId', bookingId);
        
        if (fetchError) throw fetchError;
        if (!items || items.length === 0) return { success: true };

        // Lọc các item là addon và chưa thanh toán
        const addonItems = items.filter(item => {
            let options = item.options;
            if (typeof options === 'string') {
                try { options = JSON.parse(options); } catch (e) {}
            }
            return options?.isAddon === true && options?.isPaid === false;
        });

        if (addonItems.length === 0) return { success: true };

        // Cập nhật từng item
        for (const item of addonItems) {
            let options = item.options;
            if (typeof options === 'string') {
                try { options = JSON.parse(options); } catch (e) { options = {}; }
            }
            
            const newOptions = { ...options, isPaid: true };
            
            await supabase
                .from('BookingItems')
                .update({ options: newOptions })
                .eq('id', item.id);
        }

        return { success: true };
    } catch (error: any) {
        console.error("❌ [Server] Lỗi xác nhận thu tiền add-on:", error.message);
        return { success: false, error: error.message };
    }
}

export async function removeBookingItem(bookingId: string, itemId: string) {
    try {
        const supabase = getSupabaseAdmin();
        if (!supabase) throw new Error('Supabase admin not initialized');

        // 1. Fetch item to get price & quantity
        const { data: item, error: iError } = await supabase
            .from('BookingItems')
            .select('*')
            .eq('id', itemId)
            .single();
        
        if (iError || !item) {
            console.error("❌ [Server] Lỗi tìm dịch vụ để xoá:", iError?.message);
            return { success: false, error: 'Không tìm thấy dịch vụ' };
        }
        
        // 2. Fetch booking to get total amount
        const { data: booking, error: bError } = await supabase
            .from('Bookings')
            .select('*')
            .eq('id', bookingId)
            .single();
            
        if (bError) throw bError;
        
        // 3. Delete item (hoặc update status = 'CANCELLED' nếu muốn giữ lịch sử, ở đây xoá hẳn cho sạch UI Dispatch)
        const { error: delError } = await supabase
            .from('BookingItems')
            .delete()
            .eq('id', itemId);
            
        if (delError) throw delError;
        
        // 4. Update total amount
        const itemTotal = (item.price || 0) * (item.quantity || 1);
        const newTotalAmount = Math.max(0, (Number(booking.totalAmount) || 0) - itemTotal);
        
        const vnTimeStr = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
        
        const { error: updError } = await supabase
            .from('Bookings')
            .update({ 
                totalAmount: newTotalAmount,
                updatedAt: vnTimeStr 
            })
            .eq('id', bookingId);
            
        if (updError) throw updError;

        // Xóa KTV khỏi TurnQueue nếu có (Tránh lỗi kẹt tua)
        await supabase
            .from('TurnQueue')
            .update({
                status: 'waiting',
                current_order_id: null,
                booking_item_id: null,
                room_id: null,
                bed_id: null,
                start_time: null,
                estimated_end_time: null
            })
            .eq('current_order_id', bookingId)
            .like('booking_item_id', `%${itemId}%`);
            
        return { success: true, newTotalAmount };
    } catch (error: any) {
        console.error("❌ [Server] Lỗi xoá dịch vụ:", error.message);
        return { success: false, error: error.message };
    }
}

export async function editBookingService(bookingId: string, itemId: string, newServiceId: string) {
    try {
        const supabase = getSupabaseAdmin();
        if (!supabase) throw new Error('Supabase admin not initialized');

        const vnTimeStr = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });

        // 1. Lấy thông tin Booking hiện tại
        const { data: booking, error: bError } = await supabase
            .from('Bookings')
            .select('*')
            .eq('id', bookingId)
            .single();
        if (bError || !booking) throw new Error('Không tìm thấy đơn hàng');

        // 2. Lấy thông tin BookingItem cũ
        const { data: oldItem, error: iError } = await supabase
            .from('BookingItems')
            .select('*')
            .eq('id', itemId)
            .single();
        if (iError || !oldItem) throw new Error('Không tìm thấy dịch vụ cũ');

        // 3. Lấy thông tin Service mới
        const { data: newService, error: sError } = await supabase
            .from('Services')
            .select('*')
            .eq('id', newServiceId)
            .single();
        if (sError || !newService) throw new Error('Không tìm thấy dịch vụ thay thế');

        // 4. Tính toán chênh lệch giá & thời gian
        const oldPrice = oldItem.price || 0;
        const newPrice = newService.priceVND || 0;
        const priceDiff = (newPrice - oldPrice) * (oldItem.quantity || 1);
        
        // Thời lượng cũ có thể lưu trong bảng khác hoặc mặc định
        // Chúng ta tạm dùng duration của newService để thay thế
        const newDuration = newService.duration || 60;
        // Thực tế không có duration trong BookingItems, nó được map khi load UI. 
        // Ta cần tự trừ durationDiff cho TurnQueue nếu nó đang active. Nhưng ta cần biết duration cũ.
        // Tốt nhất là fetch từ Services theo oldItem.serviceId
        const { data: oldService } = await supabase
            .from('Services')
            .select('duration, nameVN')
            .eq('id', oldItem.serviceId)
            .single();
            
        const oldDuration = oldService?.duration || 60;
        const durationDiff = newDuration - oldDuration;

        const oldServiceName = typeof oldService?.nameVN === 'object' ? oldService?.nameVN?.vn || oldService?.nameVN?.en : oldService?.nameVN || 'Dịch vụ cũ';
        const newServiceName = typeof newService.nameVN === 'object' ? newService.nameVN.vn || newService.nameVN.en : newService.nameVN || 'Dịch vụ mới';

        // 5. Cập nhật BookingItem
        const { error: updItemError } = await supabase
            .from('BookingItems')
            .update({
                serviceId: newServiceId,
                price: newPrice
            })
            .eq('id', itemId);
        if (updItemError) throw updItemError;

        // 6. Cập nhật Bookings.totalAmount
        const newTotalAmount = Math.max(0, (Number(booking.totalAmount) || 0) + priceDiff);
        const { error: updBookingError } = await supabase
            .from('Bookings')
            .update({ 
                totalAmount: newTotalAmount,
                updatedAt: vnTimeStr
            })
            .eq('id', bookingId);
        if (updBookingError) throw updBookingError;

        // 7. Cập nhật TurnQueue (nếu đang trong tua)
        if (booking.technicianCode) {
            const ktvIds = booking.technicianCode.split(',').map((id: string) => id.trim());
            for (const ktvId of ktvIds) {
                const { data: turn } = await supabase
                    .from('TurnQueue')
                    .select('*')
                    .eq('current_order_id', bookingId)
                    .eq('employee_id', ktvId)
                    .like('booking_item_id', `%${itemId}%`)
                    .maybeSingle();

                if (turn && turn.estimated_end_time && durationDiff !== 0) {
                    const [h, m, s] = turn.estimated_end_time.split(':').map(Number);
                    const d = new Date();
                    d.setHours(h, m, s || 0);
                    d.setMinutes(d.getMinutes() + durationDiff);
                    
                    const updatedEndTime = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
                    
                    await supabase
                        .from('TurnQueue')
                        .update({ estimated_end_time: updatedEndTime })
                        .eq('id', turn.id);
                }
            }
        }

        // 8. Ghi log Notifications
        let diffText = priceDiff > 0 ? `Thu thêm ${(priceDiff).toLocaleString()}đ` : priceDiff < 0 ? `Thối lại ${Math.abs(priceDiff).toLocaleString()}đ` : 'Không chênh lệch giá';
        const notifMsg = `Đổi dịch vụ đơn ${booking.billCode || bookingId}: từ "${oldServiceName}" thành "${newServiceName}". Tính tiền: ${diffText}.`;

        await supabase
            .from('StaffNotifications')
            .insert({
                bookingId: bookingId,
                type: 'SYSTEM_LOG',
                message: notifMsg,
                isRead: false,
                createdAt: vnTimeStr
            });

        // 9. Gửi Push Notification (Tùy chọn)
        try {
            await sendPushNotification({
                title: 'Thay đổi dịch vụ đơn hàng',
                message: notifMsg,
                targetRoles: ['RECEPTIONIST', 'ADMIN'],
                url: `/reception/dispatch?bookingId=${bookingId}`
            });
        } catch (e) {
            console.error('Push error on edit service:', e);
        }

        return { 
            success: true, 
            newTotalAmount, 
            newPrice, 
            newDuration, 
            newServiceName,
            priceDiff
        };
    } catch (error: any) {
        console.error("❌ [Server] Lỗi sửa dịch vụ:", error.message);
        return { success: false, error: error.message };
    }
}
