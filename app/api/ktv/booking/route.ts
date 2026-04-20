import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

/**
 * API Lấy đơn hàng đang thực hiện của KTV
 * GET /api/ktv/booking?techCode=NH001
 */
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const technicianCode = searchParams.get('techCode');
    const bookingIdParam = searchParams.get('bookingId'); // Thêm parameter này

    try {
        const supabase = getSupabaseAdmin();
        if (!supabase) throw new Error('Supabase admin not initialized');

        let bookingId = bookingIdParam;
        let assignedItemId = null;

        // Nếu không có bookingId cụ thể, tìm theo KTV trong TurnQueue
        if (!bookingId) {
            if (!technicianCode) {
                return NextResponse.json({ success: false, error: 'Technician code or bookingId is required' }, { status: 400 });
            }
            
            const today = new Date().toISOString().split('T')[0];
            const { data: turn, error: tError } = await supabase
                .from('TurnQueue')
                .select('current_order_id, booking_item_id')
                .eq('employee_id', technicianCode)
                .eq('date', today)
                .maybeSingle();

            if (tError) throw tError;
            
            if (!turn || !turn.current_order_id) {
                return NextResponse.json({ success: true, data: null });
            }
            bookingId = turn.current_order_id;
            assignedItemId = turn.booking_item_id;
        }

        // 1.5 Lấy thông tin từ TurnQueue để có mốc thời gian điều phối (last_served_at)
        let turnInfo = null;
        if (technicianCode) {
            const today = new Date().toISOString().split('T')[0];
            const { data: turn } = await supabase
                .from('TurnQueue')
                .select('last_served_at, start_time, booking_item_id, room_id, bed_id')
                .eq('employee_id', technicianCode)
                .eq('date', today)
                .eq('current_order_id', bookingId)
                .maybeSingle();
            turnInfo = turn;
            if (turn?.booking_item_id) assignedItemId = turn.booking_item_id;
        }

        // 2. Lấy đơn hàng tương ứng
        const { data: booking, error: bError } = await supabase
            .from('Bookings')
            .select('*')
            .eq('id', bookingId)
            .maybeSingle();

        if (bError) throw bError;
        if (!booking) {
            // Trường hợp hy hữu: TurnQueue có ID nhưng Booking không tồn tại
            return NextResponse.json({ success: true, data: null });
        }

        // 3. Lấy BookingItems
        const { data: items, error: iError } = await supabase
            .from('BookingItems')
            .select('*')
            .eq('bookingId', booking.id);

        if (iError) console.error('Error fetching booking items:', iError);

        // 4. Lấy chi tiết dịch vụ
        let itemsWithService = items || [];
        if (items && items.length > 0) {
            // Lấy tất cả dịch vụ để map
            const { data: svcs, error: svcError } = await supabase
                .from('Services')
                .select('id, code, nameVN, nameEN, duration, focusConfig, description, procedure, service_description')
                .limit(1000);

            if (svcError) {
                console.error('❌ [KTV API] Services fetch error:', svcError.message);
            }

            const svcMap = new Map();
            if (svcs) {
                svcs.forEach((s: any) => {
                    if (s.id) svcMap.set(String(s.id).trim().toLowerCase(), s);
                    if (s.code) svcMap.set(String(s.code).trim().toLowerCase(), s);
                });
            }

            itemsWithService = items.map((i: any) => {
                const rawSId = String(i.serviceId || '').trim();
                const sId = rawSId.toLowerCase();
                const svc = svcMap.get(sId);
                
                const opts = i.options || {};
                const customerNote = opts.note || i.customerNote || '';
                // Per-KTV notes: ưu tiên lấy note riêng từ notesForKtvs[techCode], fallback về noteForKtv chung
                const notesForKtvs = opts.notesForKtvs || {};
                const noteForKtv = (technicianCode && notesForKtvs[technicianCode]) 
                    ? notesForKtvs[technicianCode] 
                    : (opts.noteForKtv || '');
                const focusAreas = Array.isArray(opts.focus) ? opts.focus.join(', ') : (i.focus || opts.focusArea || '');
                const avoidAreas = Array.isArray(opts.avoid) ? opts.avoid.join(', ') : (opts.avoid || '');
                const strength = opts.strength || '';
                const therapistGender = opts.therapist || ''; 

                const getI18nStr = (val: any, fallback: string = '') => {
                    if (typeof val === 'object' && val !== null) return val.vn || val.en || String(val);
                    return val || fallback;
                };

                const item = {
                    ...i,
                    service_name: getI18nStr(svc?.nameVN || svc?.nameEN || svc?.name, `Dịch vụ ${rawSId}`),
                    service_description: svc?.service_description || getI18nStr(svc?.description, ''),
                    procedure: svc?.procedure || null,
                    focusConfig: svc?.focusConfig || null,
                    duration: i.duration || svc?.duration || (sId.includes('nhs0000') ? 1 : 60),
                    customerNote: customerNote,
                    noteForKtv: noteForKtv,
                    focus: focusAreas,
                    avoid: avoidAreas,
                    strength: strength,
                    therapistGender: therapistGender
                };
                
                return item;
            });
        }

        // Parse multi-item IDs (1 KTV + 2 DV → booking_item_id = "id1,id2")
        const assignedItemIds = assignedItemId 
            ? String(assignedItemId).split(',').map(s => s.trim()).filter(Boolean)
            : [];
        const primaryItemId = assignedItemIds[0] || assignedItemId;

        // 5. Fetch room-specific procedures (prep & clean checklists)
        let roomProcedures: { prep_procedure: string[] | null, clean_procedure: string[] | null } = { prep_procedure: null, clean_procedure: null };
        const roomId = turnInfo?.room_id || booking.roomName;
        if (roomId) {
            const { data: roomData } = await supabase
                .from('Rooms')
                .select('prep_procedure, clean_procedure')
                .eq('id', roomId)
                .maybeSingle();
            if (roomData) {
                roomProcedures = {
                    prep_procedure: roomData.prep_procedure || null,
                    clean_procedure: roomData.clean_procedure || null
                };
            }
        }

        return NextResponse.json({
            success: true,
            data: {
                ...booking,
                dispatcherNote: booking.notes || '',
                BookingItems: itemsWithService,
                assignedItemId: primaryItemId,
                assignedItemIds: assignedItemIds,
                // Thông tin ràng buộc thời gian & Vị trí làm việc cụ thể
                last_served_at: turnInfo?.last_served_at,
                dispatchStartTime: turnInfo?.start_time,
                assignedRoomId: turnInfo?.room_id,
                assignedBedId: turnInfo?.bed_id,
                // Room-specific procedures
                roomPrepProcedure: roomProcedures.prep_procedure,
                roomCleanProcedure: roomProcedures.clean_procedure
            }
        });
    } catch (error: any) {
        console.error('API Error (GET /api/ktv/booking):', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

/**
 * API Cập nhật trạng thái đơn hàng
 * PATCH /api/ktv/booking
 * Body: { bookingId: string, status: string, action?: string }
 */
export async function PATCH(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const techCodeFromQuery = searchParams.get('techCode'); // Lấy techCode từ query nếu có
        const body = await request.json();
        const { bookingId, status, action, techCode: techCodeFromBody } = body;
        
        const technicianCode = techCodeFromQuery || techCodeFromBody;

        if (!bookingId || !status) {
            return NextResponse.json({ success: false, error: 'bookingId and status are required' }, { status: 400 });
        }

        const supabase = getSupabaseAdmin();
        if (!supabase) throw new Error('Supabase admin not initialized');

        // --- Logic mới: Cập nhật song song BookingItem ---
        const today = new Date().toISOString().split('T')[0];
        const { data: turnForSync } = await supabase
            .from('TurnQueue')
            .select('id, booking_item_id, last_served_at, start_time, turns_completed')
            .eq('employee_id', technicianCode)
            .eq('date', today)
            .eq('current_order_id', bookingId)
            .maybeSingle();

        const updatePayload: any = { updatedAt: new Date().toISOString() };
        // 🚀 SMART BOOKING STATUS: Không set trực tiếp, tính toán dựa trên trạng thái tất cả items
        const validBookingStatuses = ['NEW', 'PREPARING', 'IN_PROGRESS', 'COMPLETED', 'FEEDBACK', 'DONE', 'CANCELLED'];

        const itemUpdatePayload: any = { status }; // BookingItems không có column updatedAt
        
        // 📝 XỬ LÝ APPEND_NOTES (Ghi đè hoặc nối thêm ghi chú từ KTV)
        if (action === 'APPEND_NOTES' && body.notes) {
            const { data: currentB } = await supabase.from('Bookings').select('notes, billCode').eq('id', bookingId).single();
            const oldNotes = currentB?.notes || '';
            // Nối thêm nếu chưa có nội dung tương tự (tránh lặp lại khi refresh)
            if (!oldNotes.includes(body.notes)) {
                updatePayload.notes = oldNotes ? `${oldNotes} | ${body.notes}` : body.notes;
                
                // Báo về cho quầy Lễ Tân / Admin
                await supabase.from('StaffNotifications').insert({
                    type: 'SYSTEM',
                    message: `📢 KTV ${technicianCode || 'N/A'} vừa đánh giá khách hàng đơn ${currentB?.billCode || bookingId}: ${body.notes}`
                });
            } else {
                updatePayload.notes = oldNotes;
            }
        }
        
        // 🔧 Xác định targetBookingItemId(s) — hỗ trợ 1 KTV nhiều DV
        let targetBookingItemId = turnForSync?.booking_item_id;
        let allItemIdsForThisKTV: string[] = [];

        // Tìm TẤT CẢ items được gán cho KTV này trong đơn
        if (technicianCode) {
            const { data: ktvItems } = await supabase
                .from('BookingItems')
                .select('id, "technicianCodes"')
                .eq('bookingId', bookingId);

            allItemIdsForThisKTV = (ktvItems || [])
                .filter((item: any) => {
                    const codes = item.technicianCodes;
                    return Array.isArray(codes) && codes.includes(technicianCode);
                })
                .map((item: any) => item.id);
        }

        // Fallback: nếu không tìm được qua technicianCodes → dùng TurnQueue hoặc item đầu tiên
        if (allItemIdsForThisKTV.length === 0) {
            if (targetBookingItemId) {
                allItemIdsForThisKTV = [targetBookingItemId];
            } else {
                const { data: firstItem } = await supabase
                    .from('BookingItems')
                    .select('id')
                    .eq('bookingId', bookingId)
                    .order('id', { ascending: true })
                    .limit(1)
                    .maybeSingle();
                if (firstItem) {
                    allItemIdsForThisKTV = [firstItem.id];
                    targetBookingItemId = firstItem.id;
                }
            }
        }

        // Nếu TurnQueue chỉ link 1 item, dùng item đó cho backward compat
        if (!targetBookingItemId && allItemIdsForThisKTV.length > 0) {
            targetBookingItemId = allItemIdsForThisKTV[0];
        }
        
        if (status === 'IN_PROGRESS' || action === 'NEXT_SEGMENT_PREPARE') {
            // 🔒 Server-side validation: Kiểm tra ràng buộc thời gian (chỉ khi thực sự IN_PROGRESS)
            if (turnForSync && action !== 'NEXT_SEGMENT_PREPARE') {
                let allowed: Date | null = null;

                if (turnForSync.start_time) {
                    const [h, m] = String(turnForSync.start_time).split(':').map(Number);
                    const nowUtc = new Date();
                    const vnOffsetMs = 7 * 60 * 60 * 1000;
                    const nowVnMs = nowUtc.getTime() + vnOffsetMs;
                    const nowVn = new Date(nowVnMs);
                    const [ynVn, mnVn, dnVn] = [nowVn.getUTCFullYear(), nowVn.getUTCMonth(), nowVn.getUTCDate()];
                    const allowedUtc = new Date(Date.UTC(ynVn, mnVn, dnVn, h, m, 0) - vnOffsetMs);
                    allowed = allowedUtc;
                } else if (turnForSync.last_served_at) {
                    const { data: config } = await supabase
                        .from('SystemConfigs')
                        .select('value')
                        .eq('key', 'ktv_setup_duration_minutes')
                        .maybeSingle();
                    
                    const setupMin = Number(config?.value || 10);
                    allowed = new Date(new Date(turnForSync.last_served_at).getTime() + (setupMin * 60 * 1000));
                }

                if (allowed && new Date().getTime() < (allowed.getTime() - 5000)) {
                    const vnOffsetMs = 7 * 60 * 60 * 1000;
                    const allowedVn = new Date(allowed.getTime() + vnOffsetMs);
                    const hh = String(allowedVn.getUTCHours()).padStart(2, '0');
                    const mm = String(allowedVn.getUTCMinutes()).padStart(2, '0');
                    return NextResponse.json({ 
                        success: false, 
                        error: `Chưa đến giờ được phép bắt đầu! Vui lòng đợi đến ${hh}:${mm}` 
                    }, { status: 403 });
                }
            }

            // 🔧 FIX: Dùng 1 timestamp duy nhất cho cả Booking + BookingItem
            const sharedTimeStart = new Date().toISOString();
            
            // KHÔNG GHI ĐÈ timeStart của Bookings NẾU là Resume/Next Segment
            if (action !== 'RESUME_TIMER' && action !== 'NEXT_SEGMENT' && action !== 'NEXT_SEGMENT_PREPARE') {
                updatePayload.timeStart = sharedTimeStart;
                itemUpdatePayload.timeStart = sharedTimeStart;
            }

            // 🚀 CẬP NHẬT SEGMENTS (thời gian chặng)
            if (allItemIdsForThisKTV.length > 0) {
                const { data: currentItems } = await supabase
                    .from('BookingItems')
                    .select('id, segments')
                    .in('id', allItemIdsForThisKTV);

                // 1. Phân tách và gộp thành mảng Global Segments giống UI
                let allGlobalSegs: { item: any, localIdx: number, seg: any }[] = [];
                const itemSegmentsMap = new Map<string, any[]>();

                for (const item of currentItems || []) {
                    let segs: any[] = [];
                    try {
                        segs = typeof item.segments === 'string' ? JSON.parse(item.segments) : (Array.isArray(item.segments) ? item.segments : []);
                    } catch { segs = []; }
                    itemSegmentsMap.set(item.id, segs);

                    segs.forEach((seg, idx) => {
                        if (seg.ktvId && technicianCode && seg.ktvId.toLowerCase().includes(technicianCode.toLowerCase())) {
                            allGlobalSegs.push({ item, localIdx: idx, seg });
                        }
                    });
                }

                // 2. Cập nhật thời gian vào Global Segments
                const activeSegmentIndex = body.activeSegmentIndex || 0;

                if (action === 'START_TIMER') {
                    if (allGlobalSegs.length > 0) {
                        allGlobalSegs[0].seg.actualStartTime = sharedTimeStart;
                    }
                } else if (action === 'NEXT_SEGMENT') {
                    if (activeSegmentIndex > 0 && allGlobalSegs.length > activeSegmentIndex) {
                        if (allGlobalSegs[activeSegmentIndex - 1]) allGlobalSegs[activeSegmentIndex - 1].seg.actualEndTime = sharedTimeStart;
                        allGlobalSegs[activeSegmentIndex].seg.actualStartTime = sharedTimeStart;
                    }
                } else if (action === 'NEXT_SEGMENT_PREPARE') {
                    if (activeSegmentIndex > 0 && allGlobalSegs[activeSegmentIndex - 1]) {
                        allGlobalSegs[activeSegmentIndex - 1].seg.actualEndTime = sharedTimeStart;
                    }
                } else if (action === 'RESUME_TIMER') {
                    if (allGlobalSegs.length > activeSegmentIndex) {
                        allGlobalSegs[activeSegmentIndex].seg.actualStartTime = sharedTimeStart;
                    }
                }

                // 3. Đẩy lại các cập nhật vào DB
                for (const [itemId, segs] of Array.from(itemSegmentsMap.entries())) {
                    await supabase
                        .from('BookingItems')
                        .update({ segments: JSON.stringify(segs) })
                        .eq('id', itemId);
                }
            }

            // 🚀 IN_PROGRESS (hoặc PREPARING nếu là NEXT_SEGMENT_PREPARE): Update TẤT CẢ items của KTV này
            if (allItemIdsForThisKTV.length > 0) {
                await supabase
                    .from('BookingItems')
                    .update(itemUpdatePayload)
                    .in('id', allItemIdsForThisKTV);
                targetBookingItemId = null;
            }

            updatePayload.status = action === 'NEXT_SEGMENT_PREPARE' ? 'PREPARING' : 'IN_PROGRESS';
        } else if (status === 'READY') {
            itemUpdatePayload.status = 'READY';
        } else if (status === 'CLEANING') {
            itemUpdatePayload.status = 'CLEANING';
        } else if (status === 'DONE' || status === 'COMPLETED') {
            // ✅ NEW FLOW: KTV hoàn thành → chỉ update BookingItem.status = COMPLETED
            // Booking-level status sẽ được update sau khi tất cả items được RATED bởi khách
            updatePayload.timeEnd = new Date().toISOString();
            itemUpdatePayload.timeEnd = new Date().toISOString();
            // itemUpdatePayload.status đã = 'COMPLETED' từ dòng khởi tạo ở trên

            // 🔑 FIX RACE CONDITION: Update TẤT CẢ items của KTV này
            if (allItemIdsForThisKTV.length > 0) {
                await supabase
                    .from('BookingItems')
                    .update(itemUpdatePayload)
                    .in('id', allItemIdsForThisKTV);
                // Đánh dấu đã update batch → skip single update ở dưới
                targetBookingItemId = null;
            } else if (targetBookingItemId) {
                await supabase
                    .from('BookingItems')
                    .update(itemUpdatePayload)
                    .eq('id', targetBookingItemId);
                targetBookingItemId = null;
            }

            // Re-query SAU khi đã update để check trạng thái thực tế
            const { data: allItemsAfterUpdate } = await supabase
                .from('BookingItems')
                .select('id, status')
                .eq('bookingId', bookingId);

            const allItemsCompleted = (allItemsAfterUpdate || []).length > 0 
                && (allItemsAfterUpdate || []).every(i =>
                    ['COMPLETED', 'DONE', 'CLEANING'].includes(i.status)
                );

            if (allItemsCompleted) {
                // Tất cả KTV đã xong → Booking giữ IN_PROGRESS (chờ khách rate)
                // Không cần set booking.status ở đây — chờ tất cả itemRating được lưu
                console.log(`[KTV API] All items completed for booking ${bookingId}. Waiting for customer ratings.`);
            }
        } else if (validBookingStatuses.includes(status)) {
            updatePayload.status = status;
        }

        if (action === 'EARLY_EXIT') {
            updatePayload.notes = 'Khách về sớm';
        }

        let _itemResult: any = { attempted: false };
        if (targetBookingItemId) {
            const { error: itemErr, data: itemData } = await supabase
                .from('BookingItems')
                .update(itemUpdatePayload)
                .eq('id', targetBookingItemId)
                .select();
            
            _itemResult = { attempted: true, error: itemErr?.message, updatedStatus: itemData?.[0]?.status };
            if (itemErr) console.error('⚠️ [KTV API] BookingItem update error:', itemErr);
        }

        const { data, error } = await supabase
            .from('Bookings')
            .update(updatePayload)
            .eq('id', bookingId)
            .select()
            .maybeSingle();

        if (error) throw error;
        if (!data) throw new Error('Không tìm thấy đơn hàng để cập nhật');

        // 🔥 XỬ LÝ RELEASE_KTV (Giải phóng KTV độc lập với Booking status)
        if (action === 'RELEASE_KTV') {
            if (technicianCode && turnForSync) {
                const { data: allActiveTurns } = await supabase.from('TurnQueue').select('queue_position').eq('date', today);
                let maxPos = 0;
                allActiveTurns?.forEach(t => { if (t.queue_position > maxPos) maxPos = t.queue_position; });

                const newTurns = (turnForSync.turns_completed || 0) + 1;
                const newPos = maxPos + 1;
                
                await supabase.from('TurnQueue').update({
                    status: 'waiting',
                    current_order_id: null,
                    booking_item_id: null, // GIẢI PHÓNG ITEM
                    room_id: null,
                    bed_id: null,
                    start_time: null,
                    estimated_end_time: null,
                    turns_completed: newTurns,
                    queue_position: newPos
                }).eq('id', turnForSync.id);
            }
        }

        return NextResponse.json({ success: true, data });
    } catch (error: any) {
        console.error('❌ [KTV API] PATCH error:', error);
        return NextResponse.json({ 
            success: false, 
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined 
        }, { status: 500 });
    }
}
