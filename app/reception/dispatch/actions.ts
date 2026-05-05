'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requirePermission } from '@/lib/auth-server';
import { sendPushNotification } from '@/lib/push-helper';



export async function getDispatchData(date: string) {
    try {
        await requirePermission('dispatch_board');
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
                        const orderA = a.options?.order;
                        const orderB = b.options?.order;
                        
                        // Ưu tiên sắp xếp theo order trong options nếu có
                        if (typeof orderA === 'number' && typeof orderB === 'number') {
                            if (orderA !== orderB) return orderA - orderB;
                        } else if (typeof orderA === 'number') {
                            return -1;
                        } else if (typeof orderB === 'number') {
                            return 1;
                        }

                        // Nếu không có, dùng logic cũ
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

        // 6. Fetch Rooms, Beds, and Reminders
        const { data: rooms } = await supabase.from('Rooms').select('*');
        const { data: beds } = await supabase.from('Beds').select('*');
        const { data: reminders } = await supabase.from('Reminders').select('*').eq('is_active', true).order('order_index', { ascending: true });
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
                reminders: reminders || [],
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
    technicianCode?: string | null;
    bedId?: string | null;
    roomName?: string | null;
    staffAssignments: any[];
    date: string;
    notes?: string;
    itemUpdates?: { 
        id: string, 
        roomName?: string | null, 
        bedId?: string | null, 
        technicianCodes?: string[] | string | null, 
        status?: string,
        segments?: any[],
        options: any 
    }[];
}) {
    try {
        await requirePermission('dispatch_board');
        const supabase = getSupabaseAdmin();
        if (!supabase) throw new Error('Supabase admin not initialized');

        // GỌI RPC MỚI ĐỂ THỰC THI TOÀN BỘ TRANSACTION
        const { data, error } = await supabase.rpc('dispatch_confirm_booking', {
            p_booking_id: bookingId,
            p_date: dispatchData.date,
            p_status: dispatchData.status || 'PREPARING',
            p_technician_code: dispatchData.technicianCode,
            p_bed_id: dispatchData.bedId,
            p_room_name: dispatchData.roomName,
            p_notes: dispatchData.notes,
            p_staff_assignments: dispatchData.staffAssignments || [],
            p_item_updates: dispatchData.itemUpdates || []
        });

        if (error) {
            console.error('❌ [Server] RPC dispatch_confirm_booking error:', error);
            throw error;
        }

        if (data && !data.success) {
            console.error('❌ [Server] RPC failed internally:', data.error);
            throw new Error(data.error || 'Lỗi khi lưu dữ liệu điều phối');
        }

        // 4. Send background push and realtime notification to KTVs
        if (dispatchData.staffAssignments && dispatchData.staffAssignments.length > 0) {
            const staffIds = dispatchData.staffAssignments.map(a => a.ktvId).filter(Boolean);
            // Lọc unique staffIds
            const uniqueStaffIds = Array.from(new Set(staffIds));
            
            for (const staffId of uniqueStaffIds) {
                let svcName = 'dịch vụ mới';
                let svcTime = '';
                
                // Tìm item mà KTV này được phân công để lấy displayName và startTime
                const ktvItem = dispatchData.itemUpdates?.find((i: any) => 
                    i.technicianCodes && (Array.isArray(i.technicianCodes) ? i.technicianCodes.includes(staffId) : i.technicianCodes === staffId)
                );
                
                if (ktvItem) {
                    svcName = ktvItem.options?.displayName || 'dịch vụ mới';
                    const ktvSeg = ktvItem.segments?.find((s: any) => s.ktvId === staffId);
                    if (ktvSeg && ktvSeg.startTime) {
                        svcTime = ` lúc ${ktvSeg.startTime}`;
                    } else if (ktvItem.segments && ktvItem.segments.length > 0 && ktvItem.segments[0].startTime) {
                        svcTime = ` lúc ${ktvItem.segments[0].startTime}`;
                    }
                }

                const message = `Bạn được phân công: ${svcName}${svcTime}. Vui lòng kiểm tra ứng dụng.`;

                // 4a. Insert StaffNotifications for realtime UI updates
                await supabase.from('StaffNotifications').insert({
                    bookingId: bookingId,
                    employeeId: String(staffId),
                    type: 'NEW_ORDER',
                    message: message,
                    isRead: false
                });

                // 4b. Send Push Notification for OS level alerts
                await sendPushNotification({
                    title: 'Bạn có ca làm mới! 💆',
                    message: message,
                    targetStaffIds: [String(staffId)],
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
        technicianCodes?: string[] | string | null, 
        segments?: any[],
        options: any 
    }[];
}) {
    try {
        await requirePermission('dispatch_board');
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
                const technicianCodes = Array.isArray(item.technicianCodes) 
                    ? item.technicianCodes 
                    : (typeof item.technicianCodes === 'string' ? item.technicianCodes.split(',').map(c => c.trim()).filter(Boolean) : []);
                
                await supabase
                    .from('BookingItems')
                    .update({ 
                        roomName: item.roomName,
                        bedId: item.bedId,
                        technicianCodes: technicianCodes,
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
        await requirePermission('dispatch_board');
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

        // 2. Lấy thông tin trạng thái KTV trước khi giải phóng để quyết định có xóa Ledger không
        const { data: currentTurns } = await supabase
            .from('TurnQueue')
            .select('employee_id, status')
            .eq('current_order_id', bookingId)
            .eq('date', date);

        if (currentTurns && currentTurns.length > 0) {
            for (const turn of currentTurns) {
                // ✅ Nếu CHƯA bắt đầu (assigned) mà bị hủy -> Xóa Ledger để giải phóng lượt tua cho KTV
                if (turn.status === 'assigned' || turn.status === 'ready' || turn.status === 'waiting') {
                    console.log(`✅ KTV ${turn.employee_id} được hoàn lượt tua do hủy đơn TRƯỚC KHI bắt đầu.`);
                    await supabase
                        .from('TurnLedger')
                        .delete()
                        .eq('date', date)
                        .eq('booking_id', bookingId)
                        .eq('employee_id', turn.employee_id);
                } else {
                    // ⚠️ Nếu đã đang làm (working) mà bị hủy -> GIỮ Ledger để tính tua/tiền cho KTV
                    console.log(`⚠️ KTV ${turn.employee_id} giữ nguyên lượt tua do hủy đơn KHI ĐANG LÀM.`);
                }
            }
        }

        // 3. Giải phóng KTV trong TurnQueue
        const { error: tError } = await supabase
            .from('TurnQueue')
            .update({
                status: 'waiting',
                current_order_id: null,
                booking_item_id: null,
                booking_item_ids: [],
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
        await requirePermission('dispatch_board');
        const supabase = getSupabaseAdmin();
        if (!supabase) throw new Error('Supabase admin not initialized');

        // Lấy trạng thái hiện tại để check rule
        const { data: bCurrent } = await supabase.from('Bookings').select('status').eq('id', bookingId).single();
        if (bCurrent && bCurrent.status) {
            const { canTransition } = await import('@/lib/dispatch-status');
            if (!canTransition(bCurrent.status, newStatus)) {
                return { success: false, error: `Lỗi: Không thể chuyển trạng thái từ ${bCurrent.status} sang ${newStatus}` };
            }
        }

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
        // 🔧 FIX: KHÔNG ghi đè items đang PREPARING (chưa bắt đầu) → chỉ update items đã IN_PROGRESS trở lên
        if (['DONE', 'CANCELLED', 'CLEANING', 'FEEDBACK'].includes(newStatus)) {
            const { data: itemsToUpdate } = await supabase
                .from('BookingItems')
                .select('id, segments, status')
                .eq('bookingId', bookingId)
                .in('status', ['IN_PROGRESS', 'CLEANING', 'FEEDBACK']);
            
            if (itemsToUpdate && itemsToUpdate.length > 0) {
                const { canTransition: canTransitionItem } = await import('@/lib/dispatch-status');
                for (const item of itemsToUpdate) {
                    let segs = [];
                    try { segs = typeof item.segments === 'string' ? JSON.parse(item.segments) : (item.segments || []); } catch {}
                    
                    let segmentsModified = false;
                    segs.forEach((s: any) => {
                        if (!s.actualEndTime) {
                            s.actualEndTime = new Date().toISOString();
                            segmentsModified = true;
                        }
                    });

                    // Skip items already at higher status
                    const itemStatus = (item as any).status;
                    if (itemStatus && !canTransitionItem(itemStatus, newStatus)) {
                        // Still update segments if modified
                        if (segmentsModified) {
                            await supabase.from('BookingItems').update({ segments: JSON.stringify(segs) }).eq('id', item.id);
                        }
                        continue;
                    }

                    const payload: any = { status: newStatus };
                    if (segmentsModified) payload.segments = JSON.stringify(segs);
                    if (newStatus === 'CLEANING' || newStatus === 'DONE' || newStatus === 'CANCELLED') {
                        payload.timeEnd = new Date().toISOString();
                    }

                    await supabase.from('BookingItems').update(payload).eq('id', item.id);
                }
            }

            // 🔧 SMART BOOKING STATUS: Re-query ALL items để tính status chính xác
            const { data: allItemsAfterPartial } = await supabase
                .from('BookingItems')
                .select('id, status')
                .eq('bookingId', bookingId);
            
            if (allItemsAfterPartial && allItemsAfterPartial.length > 0) {
                const statuses = allItemsAfterPartial.map(i => i.status);
                const { recomputeBookingStatus } = await import('@/lib/dispatch-status');
                let smartStatus = recomputeBookingStatus(statuses);
                
                // Keep the requested status if recomputed is DONE but we want a specific terminal status (e.g. FEEDBACK)
                if (smartStatus === 'DONE' && ['COMPLETED', 'DONE', 'CANCELLED', 'CLEANING', 'FEEDBACK'].includes(newStatus)) {
                    smartStatus = newStatus;
                }
                
                // Override booking status nếu khác
                if (smartStatus !== newStatus) {
                    console.log(`🧠 [Smart Status] Booking ${bookingId}: Requested ${newStatus} but computed ${smartStatus} (some items still waiting)`);
                    await supabase.from('Bookings').update({ status: smartStatus, updatedAt: new Date().toISOString() }).eq('id', bookingId);
                }
            }
        } else if (newStatus === 'IN_PROGRESS') {
            const now = new Date().toISOString();
            // Cập nhật timeStart cho Bookings nếu chưa có
            await supabase.from('Bookings').update({ timeStart: now }).eq('id', bookingId).is('timeStart', null);

            // Cập nhật tất cả các items đang chờ thành IN_PROGRESS (CHỈ items chưa bắt đầu)
            const { error: itemError } = await supabase
                .from('BookingItems')
                .update({ status: 'IN_PROGRESS', timeStart: now })
                .eq('bookingId', bookingId)
                .in('status', ['WAITING', 'PREPARING', 'NEW']);
            if (itemError) console.error('❌ [Server] BookingItems start error:', itemError);

            // 🔥 FIX: Items đã từng IN_PROGRESS (bị kéo nhầm sang COMPLETED rồi kéo lại)
            // → Chỉ update status, KHÔNG ghi đè timeStart
            await supabase
                .from('BookingItems')
                .update({ status: 'IN_PROGRESS' })
                .eq('bookingId', bookingId)
                .in('status', ['COMPLETED', 'CLEANING'])
                .not('timeStart', 'is', null);

            // Cập nhật TurnQueue thành working cho các KTV liên quan
            const { error: tError } = await supabase
                .from('TurnQueue')
                .update({ status: 'working', start_time: new Date().toLocaleTimeString('en-US', { hour12: false }) })
                .eq('current_order_id', bookingId)
                .eq('date', date)
                .in('status', ['waiting', 'assigned', 'working']);
            if (tError) console.error('❌ [Server] TurnQueue start error:', tError);
        }

        // 🔧 CHỈ release KTV khi DONE hoặc CANCELLED. CLEANING/FEEDBACK = KTV vẫn bận!
        if (newStatus === 'DONE' || newStatus === 'CANCELLED') {
            // Re-check: chỉ giải phóng nếu KHÔNG còn items đang PREPARING/IN_PROGRESS
            const { data: remainingItems } = await supabase
                .from('BookingItems')
                .select('status')
                .eq('bookingId', bookingId)
                .in('status', ['PREPARING', 'IN_PROGRESS', 'NEW', 'WAITING']);
            
            const allReallyDone = !remainingItems || remainingItems.length === 0;
            
            if (allReallyDone) {
                // Lấy tất cả KTV đang làm đơn hàng này từ TurnQueue (cách cũ)
                const { data: turnsToRelease } = await supabase
                    .from('TurnQueue')
                    .select('id, employee_id, turns_completed, status')
                    .eq('current_order_id', bookingId)
                    .eq('date', date);

                // 🔥 BỔ SUNG: Lấy thêm danh sách từ KtvAssignments (ACTIVE state) để vét cạn các KTV bị kẹt
                const { data: activeAssignments } = await supabase
                    .from('KtvAssignments')
                    .select('employee_id')
                    .eq('booking_id', bookingId)
                    .eq('status', 'ACTIVE');

                const ktvsToRelease = new Set<string>();
                (turnsToRelease || []).forEach(t => { if (t.employee_id) ktvsToRelease.add(t.employee_id); });
                (activeAssignments || []).forEach(a => { if (a.employee_id) ktvsToRelease.add(a.employee_id); });

                if (ktvsToRelease.size > 0) {
                    for (const employeeId of Array.from(ktvsToRelease)) {
                        const turn = (turnsToRelease || []).find(t => t.employee_id === employeeId);

                        // Nếu hủy đơn khi đã bắt đầu làm (working) -> Xóa bản ghi TurnLedger (mất tua)
                        if (newStatus === 'CANCELLED' && turn && turn.status === 'working') {
                            console.log(`⚠️ KTV ${turn.id} mất tua do hủy đơn (status working).`);
                            await supabase
                                .from('TurnLedger')
                                .delete()
                                .eq('date', date)
                                .eq('booking_id', bookingId)
                                .eq('employee_id', employeeId);
                        }

                        // 1. Cập nhật KtvAssignments thành COMPLETED hoặc CANCELLED
                        const assignStatus = newStatus === 'CANCELLED' ? 'CANCELLED' : 'COMPLETED';
                        await supabase
                            .from('KtvAssignments')
                            .update({ status: assignStatus, updated_at: new Date().toISOString() })
                            .eq('employee_id', employeeId)
                            .eq('booking_id', bookingId)
                            .eq('business_date', date)
                            .eq('status', 'ACTIVE'); // Khóa chặt theo đơn hàng và ngày làm việc

                        // 2. Gọi Auto-Handoff Engine
                        const { data: promoteData, error: promoteErr } = await supabase.rpc('promote_next_assignment', {
                            p_employee_id: employeeId,
                            p_business_date: date
                        });

                        if (promoteErr) console.error(`[Handoff] Error promoting KTV ${employeeId}:`, promoteErr);
                        else console.log(`[Handoff] KTV ${employeeId} auto-handoff result:`, promoteData);
                    }
                }
            } else {
                console.log(`🛡️ [Server] Booking ${bookingId}: Skipping TurnQueue release — ${remainingItems?.length} items still active`);
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

export async function updateBookingItemStatus(itemIds: string[], newStatus: string, date: string, bookingId: string, targetKtvIds?: string[]) {
    try {
        await requirePermission('dispatch_board');
        const supabase = getSupabaseAdmin();
        if (!supabase) throw new Error('Supabase admin not initialized');

        // Lấy trạng thái hiện tại của items để check rule
        const { data: itemsCurrent } = await supabase.from('BookingItems').select('id, status, segments').in('id', itemIds);
        const { canTransition } = await import('@/lib/dispatch-status');
        
        // Filter: chỉ update items CÓ THỂ chuyển trạng thái, skip items đã ở bước cao hơn
        const updatableIds = (itemsCurrent || [])
            .filter(item => !item.status || canTransition(item.status, newStatus))
            .map(item => item.id);
        
        const skippedItems = (itemsCurrent || [])
            .filter(item => item.status && !canTransition(item.status, newStatus));
        
        if (skippedItems.length > 0) {
            console.log(`[updateBookingItemStatus] Skipping ${skippedItems.length} items already at higher status:`, 
                skippedItems.map(i => `${i.id}:${i.status}`).join(', '));
        }
        
        for (const item of itemsCurrent || []) {
            let segs = [];
            try { segs = typeof item.segments === 'string' ? JSON.parse(item.segments) : (item.segments || []); } catch {}
            
            let segmentsModified = false;
            // Luôn đảm bảo có actualEndTime nếu đang chuyển sang trạng thái kết thúc
            if (['DONE', 'CANCELLED', 'CLEANING', 'FEEDBACK', 'COMPLETED'].includes(newStatus)) {
                segs.forEach((s: any) => {
                    if (!s.actualEndTime) {
                        s.actualEndTime = new Date().toISOString();
                        segmentsModified = true;
                    }
                    // 🔥 FIX: Nếu chuyển sang FEEDBACK hoặc DONE, phải có feedbackTime thì Kanban mới chịu nhảy cột
                    if (['FEEDBACK', 'DONE'].includes(newStatus) && !s.feedbackTime) {
                        s.feedbackTime = new Date().toISOString();
                        segmentsModified = true;
                    }
                });
            }
            
            // Chỉ update status nếu được phép chuyển đổi
            const isUpdatable = updatableIds.includes(item.id);
            const payload: any = {};
            
            if (isUpdatable) {
                payload.status = newStatus;
                if (['CLEANING', 'DONE', 'CANCELLED', 'COMPLETED'].includes(newStatus)) {
                    payload.timeEnd = new Date().toISOString();
                }
            }
            
            if (segmentsModified) {
                payload.segments = JSON.stringify(segs);
            }
            
            if (Object.keys(payload).length > 0) {
                const { error: itemError } = await supabase.from('BookingItems').update(payload).eq('id', item.id);
                if (itemError) throw itemError;
            }
        }

        if (newStatus === 'IN_PROGRESS') {
            const now = new Date().toISOString();
            
            // Cập nhật timeStart cho Bookings nếu chưa có
            await supabase.from('Bookings').update({ timeStart: now }).eq('id', bookingId).is('timeStart', null);

            // 🔥 FIX: Chỉ set timeStart cho items CHƯA có timeStart (tránh ghi đè giờ KTV đã bấm)
            // Lấy danh sách items hiện tại để kiểm tra
            const { data: currentItems } = await supabase
                .from('BookingItems')
                .select('id, timeStart, status')
                .in('id', itemIds);

            const itemsNeedTimeStart = (currentItems || []).filter(i => !i.timeStart).map(i => i.id);
            const itemsAlreadyStarted = (currentItems || []).filter(i => i.timeStart).map(i => i.id);

            // Items chưa có timeStart → set cả status + timeStart
            if (itemsNeedTimeStart.length > 0) {
                await supabase
                    .from('BookingItems')
                    .update({ status: 'IN_PROGRESS', timeStart: now })
                    .in('id', itemsNeedTimeStart);
            }

            // Items đã có timeStart → CHỈ update status, bảo toàn timeStart gốc
            if (itemsAlreadyStarted.length > 0) {
                await supabase
                    .from('BookingItems')
                    .update({ status: 'IN_PROGRESS' })
                    .in('id', itemsAlreadyStarted);
            }

            // Cập nhật TurnQueue thành working
            let query = supabase
                .from('TurnQueue')
                .update({ status: 'working', start_time: new Date().toLocaleTimeString('en-US', { hour12: false }) })
                .eq('current_order_id', bookingId)
                .overlaps('booking_item_ids', itemIds)
                .eq('date', date)
                .in('status', ['waiting', 'working']);
                
            if (targetKtvIds && targetKtvIds.length > 0) {
                query = query.in('employee_id', targetKtvIds);
            }
            await query;
        }

        if (newStatus === 'CLEANING' || newStatus === 'COMPLETED' || newStatus === 'DONE' || newStatus === 'CANCELLED' || newStatus === 'FEEDBACK') {
            // Lấy tất cả KTV đang làm các item này
            let queryToRelease = supabase
                .from('TurnQueue')
                .select('id, turns_completed, status, booking_item_ids')
                .eq('current_order_id', bookingId)
                .overlaps('booking_item_ids', itemIds)
                .eq('date', date);
                
            if (targetKtvIds && targetKtvIds.length > 0) {
                queryToRelease = queryToRelease.in('employee_id', targetKtvIds);
            }

            const { data: turnsToRelease } = await queryToRelease;

            if (turnsToRelease && turnsToRelease.length > 0) {
                for (const turn of turnsToRelease) {
                    const currentItemIds = turn.booking_item_ids || [];
                    const remainingItemIds = currentItemIds.filter((id: string) => !itemIds.includes(id));

                    if (remainingItemIds.length > 0) {
                        // KTV vẫn còn item khác đang làm trong bill này
                        await supabase
                            .from('TurnQueue')
                            .update({
                                booking_item_id: remainingItemIds.join(','),
                                booking_item_ids: remainingItemIds
                            })
                            .eq('id', turn.id);
                    } else {
                        // KTV đã xong tất cả item của họ
                        let newTurnsCompleted = turn.turns_completed || 0;
                        await supabase
                            .from('TurnQueue')
                            .update({
                                status: 'waiting',
                                current_order_id: null,
                                booking_item_id: null,
                                booking_item_ids: [], // Set về mảng rỗng thay vì mảng chuỗi '{}'
                                start_time: null,
                                estimated_end_time: null,
                                turns_completed: newTurnsCompleted
                            })
                            .eq('id', turn.id);
                    }
                }
            }
        }
        
        // Auto-update Booking status based on remaining items
        const { data: allItems } = await supabase.from('BookingItems').select('status, Services!BookingItems_serviceId_fkey(nameVN)').eq('bookingId', bookingId);
        if (allItems && allItems.length > 0) {
            const validItems = allItems.filter((i: any) => {
                const name = i.Services?.nameVN || '';
                return !name.toLowerCase().includes('phòng riêng');
            });
            const finalItems = validItems.length > 0 ? validItems : allItems;
            const statuses = finalItems.map(i => i.status);
            const { recomputeBookingStatus } = await import('@/lib/dispatch-status');
            let bStatus = recomputeBookingStatus(statuses);
            
            if (bStatus === 'DONE' && ['CLEANING', 'FEEDBACK', 'DONE', 'CANCELLED'].includes(newStatus)) {
                bStatus = newStatus;
            }
            
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
    serviceIds: string[];
    bookingDate: string; // "YYYY-MM-DD"
    customerLang?: string; // Language code: vi, en, kr, jp, cn
}) {
    try {
        await requirePermission('dispatch_board');
        const supabase = getSupabaseAdmin();
        if (!supabase) throw new Error('Supabase admin not initialized');

        // 1. Tạo billCode ngẫu nhiên (VD: S260307-ABCD)
        const dateStr = data.bookingDate.replace(/-/g, '').substring(2);
        const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
        const billCode = `S${dateStr}-${randomStr}`;

        // 2. Lấy thông tin dịch vụ để lấy giá tiền & thời gian
        const { data: svcs, error: sError } = await supabase
            .from('Services')
            .select('id, priceVND, duration')
            .in('id', data.serviceIds);
        
        if (sError) throw new Error(`Lỗi khi lấy dịch vụ: ${sError.message}`);
        if (!svcs || svcs.length === 0) throw new Error(`Không tìm thấy dịch vụ nào`);

        const totalAmount = svcs.reduce((acc, svc) => acc + (svc.priceVND || 0), 0);

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
                totalAmount: totalAmount,
                paymentMethod: 'Tiền mặt', // Mặc định
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            })
            .select()
            .single();

        if (bError) throw bError;

        // Insert multiple items
        const itemsToInsert = data.serviceIds.map(sid => {
            const svc = svcs.find(s => s.id === sid);
            return {
                id: crypto.randomUUID(),
                bookingId: booking.id,
                serviceId: sid,
                quantity: 1,
                price: svc?.priceVND || 0,
            };
        });

        const { error: iError } = await supabase
            .from('BookingItems')
            .insert(itemsToInsert);

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
        await requirePermission('dispatch_board');
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
        const techIds = booking.technicianCode 
            ? booking.technicianCode.split(',').map((id: string) => id.trim()).filter(Boolean)
            : [];

        const itemsToInsert = detailedItems.map((item, index) => {
            return {
                id: `${bookingId}-addon-${timestamp}-${index}`,
                bookingId: bookingId,
                serviceId: item.serviceId,
                quantity: item.qty,
                price: item.priceOriginal,
                status: 'WAITING',
                technicianCodes: techIds,
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

                    // 6b. Nối addon item IDs vào booking_item_ids
                    // Để KTV Dashboard tính tiền tua theo TỔNG duration tất cả items (chung 1 tua)
                    const existingItemIds = Array.isArray(turn.booking_item_ids) 
                        ? turn.booking_item_ids 
                        : [];
                    const mergedItemIds = [...new Set([...existingItemIds, ...newItemIds])];
                    updateData.booking_item_id = mergedItemIds.join(',');
                    updateData.booking_item_ids = mergedItemIds;

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
        await requirePermission('dispatch_board');
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
        await requirePermission('dispatch_board');
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
        // Thay vì xóa bung toàn bộ, ta chỉ gỡ item bị xóa ra khỏi mảng
        const { data: turnsAffected } = await supabase
            .from('TurnQueue')
            .select('id, booking_item_ids')
            .eq('current_order_id', bookingId)
            .contains('booking_item_ids', [itemId]);

        if (turnsAffected && turnsAffected.length > 0) {
            for (const turn of turnsAffected) {
                const currentItemIds = turn.booking_item_ids || [];
                const remainingItemIds = currentItemIds.filter((id: string) => id !== itemId);

                if (remainingItemIds.length > 0) {
                    await supabase
                        .from('TurnQueue')
                        .update({
                            booking_item_id: remainingItemIds.join(','),
                            booking_item_ids: remainingItemIds
                        })
                        .eq('id', turn.id);
                } else {
                    await supabase
                        .from('TurnQueue')
                        .update({
                            status: 'waiting',
                            current_order_id: null,
                            booking_item_id: null,
                            booking_item_ids: [],
                            room_id: null,
                            bed_id: null,
                            start_time: null,
                            estimated_end_time: null
                        })
                        .eq('id', turn.id);
                }
            }
        }
            
        return { success: true, newTotalAmount };
    } catch (error: any) {
        console.error("❌ [Server] Lỗi xoá dịch vụ:", error.message);
        return { success: false, error: error.message };
    }
}

export async function editBookingService(bookingId: string, itemId: string, newServiceId: string) {
    try {
        await requirePermission('dispatch_board');
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
        let newOptions = oldItem.options || {};
        if (!newOptions.displayName || newOptions.displayName === oldServiceName) {
            newOptions.displayName = newServiceName; // Sync sang tên dịch vụ mới
        }

        // Cập nhật endTime của các segments theo duration mới (tùy chọn)
        let newSegments = oldItem.segments || [];
        try { newSegments = typeof oldItem.segments === 'string' ? JSON.parse(oldItem.segments) : (Array.isArray(oldItem.segments) ? oldItem.segments : []); } catch { newSegments = []; }
        
        if (durationDiff !== 0 && newSegments.length > 0) {
            newSegments = newSegments.map((seg: any) => {
                if (seg.startTime) {
                    const [h, m] = seg.startTime.split(':').map(Number);
                    const d = new Date();
                    d.setHours(h, m, 0);
                    d.setMinutes(d.getMinutes() + newDuration); // set end time based on the entire duration
                    seg.endTime = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                }
                return seg;
            });
        }

        const { error: updItemError } = await supabase
            .from('BookingItems')
            .update({
                serviceId: newServiceId,
                price: newPrice,
                options: newOptions,
                segments: newSegments
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
                    .contains('booking_item_ids', [itemId])
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
            newDisplayName: newOptions.displayName,
            priceDiff
        };
    } catch (error: any) {
        console.error("❌ [Server] Lỗi sửa dịch vụ:", error.message);
        return { success: false, error: error.message };
    }
}

export async function submitCustomerRating(bookingId: string, rating: number, feedbackNote?: string) {
    try {
        const supabase = getSupabaseAdmin();
        if (!supabase) throw new Error('Supabase admin not initialized');

        // Kiểm tra trạng thái hiện tại để quyết định chuyển hay không
        const { data: current } = await supabase
            .from('Bookings')
            .select('status')
            .eq('id', bookingId)
            .single();

        const updatePayload: any = { 
            rating, 
            feedbackNote,
            updatedAt: new Date().toISOString() 
        };

        // Nếu đã dọn xong (FEEDBACK) → cả 2 tag ✅ → DONE
        // Nếu đang dọn (CLEANING) → chỉ lưu rating, giữ nguyên status
        if (current?.status === 'FEEDBACK') {
            updatePayload.status = 'DONE';
        }
        // CLEANING → không đổi status, chờ dọn xong mới DONE

        const { error } = await supabase
            .from('Bookings')
            .update(updatePayload)
            .eq('id', bookingId);

        if (error) throw error;
        return { success: true };
    } catch (error: any) {
        console.error("❌ [Server] submitCustomerRating error:", error);
        return { success: false, error: error.message };
    }
}
