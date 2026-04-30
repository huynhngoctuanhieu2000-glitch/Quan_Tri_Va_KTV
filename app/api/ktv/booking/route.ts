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
            
            const vnMs = new Date().getTime() + (7 * 60 * 60 * 1000);
            const today = new Date(vnMs).toISOString().split('T')[0];
            const { data: turn, error: tError } = await supabase
                .from('TurnQueue')
                .select('current_order_id, booking_item_id, booking_item_ids, status')
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
            const vnMs = new Date().getTime() + (7 * 60 * 60 * 1000);
            const today = new Date(vnMs).toISOString().split('T')[0];
            const { data: turn } = await supabase
                .from('TurnQueue')
                .select('last_served_at, start_time, booking_item_id, booking_item_ids, room_id, bed_id, status')
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

        // Parse multi-item IDs ưu tiên dùng mảng postgres (booking_item_ids), fallback về csv cũ
        const assignedItemIds = (turnInfo?.booking_item_ids && turnInfo.booking_item_ids.length > 0) 
            ? turnInfo.booking_item_ids 
            : (assignedItemId 
                ? String(assignedItemId).split(',').map(s => s.trim()).filter(Boolean)
                : []);
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
        const vnMs = new Date().getTime() + (7 * 60 * 60 * 1000);
        const today = new Date(vnMs).toISOString().split('T')[0];
        const { data: turnForSync } = await supabase
            .from('TurnQueue')
            .select('id, booking_item_id, booking_item_ids, last_served_at, start_time, turns_completed, status')
            .eq('employee_id', technicianCode)
            .eq('date', today)
            .eq('current_order_id', bookingId)
            .maybeSingle();

        const updatePayload: any = { updatedAt: new Date().toISOString() };
        // 🚀 SMART BOOKING STATUS: Không set trực tiếp, tính toán dựa trên trạng thái tất cả items
        const validBookingStatuses = ['NEW', 'PREPARING', 'IN_PROGRESS', 'COMPLETED', 'CLEANING', 'FEEDBACK', 'DONE', 'CANCELLED'];

        const itemUpdatePayload: any = { status }; // BookingItems không có column updatedAt
        
        // 📝 XỬ LÝ APPEND_NOTES (Ghi đè hoặc nối thêm ghi chú từ KTV)
        if (action === 'APPEND_NOTES' && body.notes) {
            const { data: currentB } = await supabase.from('Bookings').select('timeStart, notes, billCode').eq('id', bookingId).single();
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
        let targetBookingItemIds = turnForSync?.booking_item_ids || [];
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
            if (targetBookingItemIds.length > 0) {
                allItemIdsForThisKTV = targetBookingItemIds;
            } else if (targetBookingItemId) {
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
            
            // KHÔNG GHI ĐÈ timeStart của Bookings NẾU đã có người bấm Bắt đầu trước đó
            const { data: currentBookingForTime } = await supabase.from('Bookings').select('timeStart').eq('id', bookingId).single();
            
            let shouldUpdateItemTimeStart = false;
            if (action !== 'RESUME_TIMER' && action !== 'NEXT_SEGMENT' && action !== 'NEXT_SEGMENT_PREPARE') {
                if (!currentBookingForTime?.timeStart) {
                    updatePayload.timeStart = sharedTimeStart; // Chỉ gán mốc bắt đầu chung nếu chưa có ai gán
                }
                shouldUpdateItemTimeStart = true;
            }

            // 🚀 CẬP NHẬT SEGMENTS (thời gian chặng)
            let allGlobalSegs: { item: any, localIdx: number, seg: any }[] = [];
            const activeSegmentIndex = body.activeSegmentIndex || 0;
            let currentItems: any[] = [];

            if (allItemIdsForThisKTV.length > 0) {
                const { data } = await supabase
                    .from('BookingItems')
                    .select('id, segments, timeStart, timeEnd')
                    .in('id', allItemIdsForThisKTV);
                currentItems = data || [];

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

                // Sắp xếp Global Segments theo startTime (chronological order)
                allGlobalSegs.sort((a, b) => {
                    const timeA = a.seg.startTime || '23:59';
                    const timeB = b.seg.startTime || '23:59';
                    return timeA.localeCompare(timeB);
                });

                // 2. Cập nhật thời gian vào Global Segments

                if (action === 'START_TIMER' || action === 'NEXT_SEGMENT' || action === 'RESUME_TIMER') {
                    const startIdx = action === 'START_TIMER' ? 0 : activeSegmentIndex;
                    if (allGlobalSegs.length > startIdx && allGlobalSegs[startIdx]) {
                        if (action === 'NEXT_SEGMENT' && startIdx > 0 && allGlobalSegs[startIdx - 1]) {
                            allGlobalSegs[startIdx - 1].seg.actualEndTime = sharedTimeStart;
                        }

                        allGlobalSegs[startIdx].seg.actualStartTime = sharedTimeStart;

                        // 🚀 Dịch chuyển thời gian thực tế vào startTime/endTime của chặng để Lễ Tân giám sát chính xác
                        let currentStartMs = new Date(sharedTimeStart).getTime();
                        for (let i = startIdx; i < allGlobalSegs.length; i++) {
                            const seg = allGlobalSegs[i].seg;
                            const durMs = Number(seg.duration || 0) * 60000;
                            
                            const stVn = new Date(currentStartMs + (7 * 60 * 60 * 1000));
                            seg.startTime = `${String(stVn.getUTCHours()).padStart(2, '0')}:${String(stVn.getUTCMinutes()).padStart(2, '0')}`;
                            
                            const endMs = currentStartMs + durMs;
                            const etVn = new Date(endMs + (7 * 60 * 60 * 1000));
                            seg.endTime = `${String(etVn.getUTCHours()).padStart(2, '0')}:${String(etVn.getUTCMinutes()).padStart(2, '0')}`;
                            
                            currentStartMs = endMs;
                        }
                    }
                } else if (action === 'NEXT_SEGMENT_PREPARE') {
                    if (activeSegmentIndex > 0 && allGlobalSegs[activeSegmentIndex - 1]) {
                        allGlobalSegs[activeSegmentIndex - 1].seg.actualEndTime = sharedTimeStart;
                    }
                }

                let maxTimeEndStr: string | null = null;
                let maxTimeEndMs = 0;

                // 🔧 FIX CASE E: Xác định active item (item chứa segment đầu tiên)
                const activeItemId = allGlobalSegs.length > 0 ? allGlobalSegs[0].item.id : null;

                // 3. Đẩy lại các cập nhật vào DB
                for (const [itemId, segs] of Array.from(itemSegmentsMap.entries())) {
                    const payload: any = { segments: JSON.stringify(segs) };
                    const currentItem = currentItems?.find((i: any) => i.id === itemId);
                    
                    // 🔧 FIX CASE E: Chỉ set timeStart/timeEnd cho ACTIVE item
                    // Queued items (DV2, DV3...) giữ nguyên, chờ NEXT_SEGMENT
                    const isActiveItem = (itemId === activeItemId) || allItemIdsForThisKTV.length === 1;
                    if (shouldUpdateItemTimeStart && isActiveItem) {
                        if (!currentItem?.timeStart) {
                            payload.timeStart = sharedTimeStart;
                        }
                        
                        let maxSegEndTimeMs = 0;
                        segs.forEach((seg: any) => { 
                            let segEndMs = 0;
                            if (seg.actualEndTime) {
                                segEndMs = new Date(seg.actualEndTime).getTime();
                            } else {
                                if (seg.actualStartTime) {
                                    segEndMs = new Date(seg.actualStartTime).getTime() + Number(seg.duration || 0) * 60000;
                                } else if (seg.startTime) {
                                    const baseDate = new Date(sharedTimeStart);
                                    const baseVnTime = new Date(baseDate.getTime() + 7 * 60 * 60 * 1000);
                                    const [h, m] = seg.startTime.split(':').map(Number);
                                    baseVnTime.setUTCHours(h, m, 0, 0);
                                    const startToUseMs = baseVnTime.getTime() - 7 * 60 * 60 * 1000;
                                    segEndMs = startToUseMs + Number(seg.duration || 0) * 60000;
                                } else {
                                    const startToUse = currentItem?.timeStart || sharedTimeStart;
                                    segEndMs = new Date(startToUse).getTime() + Number(seg.duration || 0) * 60000;
                                }
                            }
                            if (segEndMs > maxSegEndTimeMs) maxSegEndTimeMs = segEndMs;
                        });
                        
                        // Cập nhật timeEnd dựa trên segment kết thúc muộn nhất
                        if (maxSegEndTimeMs > 0) {
                            payload.timeEnd = new Date(maxSegEndTimeMs).toISOString();
                            if (maxSegEndTimeMs > maxTimeEndMs) {
                                maxTimeEndMs = maxSegEndTimeMs;
                                maxTimeEndStr = payload.timeEnd;
                            }
                        }
                    }

                    await supabase
                        .from('BookingItems')
                        .update(payload)
                        .eq('id', itemId);
                }

                if (action === 'START_TIMER' && maxTimeEndStr) {
                    updatePayload.timeEnd = maxTimeEndStr;
                }

                // 4. Đồng bộ thời gian kết thúc (thực tế) sang TurnQueue để màn Lễ Tân Real-time
                if (maxTimeEndStr && turnForSync && action === 'START_TIMER') {
                    const d = new Date(maxTimeEndStr);
                    const vnOffsetMs = 7 * 60 * 60 * 1000;
                    const dVn = new Date(d.getTime() + vnOffsetMs);
                    const estEndTime = `${String(dVn.getUTCHours()).padStart(2, '0')}:${String(dVn.getUTCMinutes()).padStart(2, '0')}:00`;
                    
                    await supabase
                        .from('TurnQueue')
                        .update({ estimated_end_time: estEndTime, status: 'working' })
                        .eq('id', turnForSync.id);
                }
            }

            // 🔧 FIX CASE E: Phân biệt active item vs queued items
            if (allItemIdsForThisKTV.length > 0) {
                if (allItemIdsForThisKTV.length === 1 || action === 'NEXT_SEGMENT_PREPARE') {
                    // Case A/B (1 item) hoặc NEXT_SEGMENT_PREPARE: Update tất cả như cũ
                    await supabase
                        .from('BookingItems')
                        .update(itemUpdatePayload)
                        .in('id', allItemIdsForThisKTV);
                } else {
                    // Case E: Multi-item → Chỉ active item = IN_PROGRESS, queued items = PREPARING
                    const activeItemId = allGlobalSegs.length > 0 ? allGlobalSegs[0].item.id : allItemIdsForThisKTV[0];
                    const queuedItemIds = allItemIdsForThisKTV.filter(id => id !== activeItemId);

                    // Active item → IN_PROGRESS
                    await supabase
                        .from('BookingItems')
                        .update(itemUpdatePayload)
                        .eq('id', activeItemId);

                    // Queued items → PREPARING (chờ đến lượt)
                    if (queuedItemIds.length > 0 && action === 'START_TIMER') {
                        await supabase
                            .from('BookingItems')
                            .update({ status: 'PREPARING' })
                            .in('id', queuedItemIds);
                    }

                    // NEXT_SEGMENT: Active item tiếp theo cũng cần set timeStart/IN_PROGRESS
                    if (action === 'NEXT_SEGMENT' && activeSegmentIndex > 0 && allGlobalSegs[activeSegmentIndex]) {
                        const nextActiveItemId = allGlobalSegs[activeSegmentIndex].item.id;
                        if (nextActiveItemId !== activeItemId) {
                            // Chuyển sang item mới → set timeStart/timeEnd/IN_PROGRESS
                            const nextItemObj = currentItems?.find((i: any) => i.id === nextActiveItemId);
                            const nextPayload: any = { status: 'IN_PROGRESS' };
                            if (!nextItemObj?.timeStart) {
                                nextPayload.timeStart = sharedTimeStart;
                            }
                            
                            const nextSegs = allGlobalSegs.filter((s: any) => s.item.id === nextActiveItemId);
                            let maxNextEndMs = 0;
                            nextSegs.forEach((s: any) => { 
                                let startToUseMs = 0;
                                if (s.seg.actualStartTime) {
                                    startToUseMs = new Date(s.seg.actualStartTime).getTime();
                                } else if (s.seg.startTime) {
                                    const baseDate = new Date(sharedTimeStart);
                                    const baseVnTime = new Date(baseDate.getTime() + 7 * 60 * 60 * 1000);
                                    const [h, m] = s.seg.startTime.split(':').map(Number);
                                    baseVnTime.setUTCHours(h, m, 0, 0);
                                    startToUseMs = baseVnTime.getTime() - 7 * 60 * 60 * 1000;
                                } else {
                                    startToUseMs = new Date(nextItemObj?.timeStart || sharedTimeStart).getTime();
                                }
                                const segEndMs = startToUseMs + Number(s.seg.duration || 0) * 60000;
                                if (segEndMs > maxNextEndMs) maxNextEndMs = segEndMs;
                            });
                            
                            if (maxNextEndMs > 0) {
                                nextPayload.timeEnd = new Date(maxNextEndMs).toISOString();
                            }
                            
                            await supabase
                                .from('BookingItems')
                                .update(nextPayload)
                                .eq('id', nextActiveItemId);
                        }
                    }
                }
                targetBookingItemId = null;
            }

            // 🔧 SMART STATUS: Tính toán booking-level status dựa trên TẤT CẢ items, không gán cứng
            if (action === 'NEXT_SEGMENT_PREPARE') {
                updatePayload.status = 'PREPARING';
            } else {
                // Re-query ALL items để xác định booking status chính xác
                const { data: allItemsForStatus } = await supabase
                    .from('BookingItems')
                    .select('id, status')
                    .eq('bookingId', bookingId);
                
                const itemStatuses = (allItemsForStatus || []).map(i => i.status);
                if (itemStatuses.some(s => s === 'IN_PROGRESS')) {
                    updatePayload.status = 'IN_PROGRESS';
                } else if (itemStatuses.every(s => ['COMPLETED', 'DONE', 'CANCELLED', 'FEEDBACK', 'CLEANING'].includes(s))) {
                    // 🔥 KTV kết thúc phục vụ -> Đơn chuyển sang giai đoạn DỌN PHÒNG
                    updatePayload.status = 'CLEANING';
                } else if (itemStatuses.every(s => ['PREPARING', 'READY', 'NEW', 'WAITING'].includes(s))) {
                    updatePayload.status = 'PREPARING';
                } else {
                    updatePayload.status = 'IN_PROGRESS';
                }
            }
        } else if (status === 'READY') {
            itemUpdatePayload.status = 'READY';
        } else if (status === 'CLEANING') {
            itemUpdatePayload.status = 'CLEANING';
        } else if (status === 'DONE' || status === 'COMPLETED' || status === 'FEEDBACK') {
            const isFeedback = status === 'FEEDBACK';
            itemUpdatePayload.timeEnd = new Date().toISOString();
            
            const idsToCheck = allItemIdsForThisKTV.length > 0 ? allItemIdsForThisKTV : (targetBookingItemId ? [targetBookingItemId] : []);
            
            if (idsToCheck.length > 0) {
                const { data: currentItems } = await supabase
                    .from('BookingItems')
                    .select('id, segments, status')
                    .in('id', idsToCheck);

                for (const item of currentItems || []) {
                    let segs: any[] = [];
                    try { segs = typeof item.segments === 'string' ? JSON.parse(item.segments) : (Array.isArray(item.segments) ? item.segments : []); } 
                    catch { segs = []; }

                    let allDone = true;
                    let allFeedback = true;

                    // 1. Đánh dấu segment của KTV này (và đồng nghiệp làm cùng phòng/giờ) là đã hoàn thành
                    segs.forEach(seg => {
                        // Xác định xem segment này có thuộc về KTV hiện tại hoặc làm cùng phòng/giờ không
                        const isMySeg = technicianCode && seg.ktvId && seg.ktvId.toLowerCase() === technicianCode.toLowerCase();
                        
                        // 🔥 TEAM SYNC: Nếu làm cùng phòng, cùng thời gian bắt đầu/kết thúc kế hoạch 
                        // -> Cập nhật luôn cho đồng nghiệp để tránh kẹt đơn
                        const isTeamSeg = seg.roomId === turnForSync?.room_id && 
                                        seg.startTime === turnForSync?.start_time;

                        if (isMySeg || isTeamSeg) {
                            if (!isFeedback && !seg.actualEndTime) seg.actualEndTime = new Date().toISOString();
                            if (isFeedback && !seg.feedbackTime) seg.feedbackTime = new Date().toISOString();
                            // Đảm bảo có actualStartTime nếu chưa có
                            if (!seg.actualStartTime) seg.actualStartTime = seg.startTime || new Date().toISOString();
                        }
                    });

                    // 2. Kiểm tra xem TẤT CẢ segments đã thực sự hoàn thành chưa
                    segs.forEach(seg => {
                        if (!seg.actualEndTime) allDone = false;
                        if (!seg.feedbackTime) allFeedback = false;
                    });

                    const payload: any = { segments: JSON.stringify(segs) };
                    
                    if (isFeedback) {
                        if (allFeedback) payload.status = 'FEEDBACK';
                    } else {
                        // COMPLETED
                        if (allDone && item.status !== 'FEEDBACK' && item.status !== 'DONE') {
                            payload.status = 'COMPLETED';
                            payload.timeEnd = itemUpdatePayload.timeEnd;
                        }
                    }

                    await supabase.from('BookingItems').update(payload).eq('id', item.id);
                }
                
                targetBookingItemId = null; // Đã update xong, bỏ qua block update bên dưới
            }

            // Kiểm tra lại toàn bộ items trong đơn để tính toán trạng thái Booking tổng
            const { data: allItemsAfterUpdate } = await supabase
                .from('BookingItems')
                .select('id, status')
                .eq('bookingId', bookingId);

            const allItemsCompleted = (allItemsAfterUpdate || []).length > 0 && (allItemsAfterUpdate || []).every(i => ['COMPLETED', 'DONE', 'CLEANING', 'FEEDBACK', 'CANCELLED'].includes(i.status));
            const allItemsFeedback = (allItemsAfterUpdate || []).length > 0 && (allItemsAfterUpdate || []).every(i => ['FEEDBACK', 'DONE', 'CANCELLED'].includes(i.status));

            if (isFeedback) {
                if (allItemsFeedback) {
                    const { data: currentBooking } = await supabase.from('Bookings').select('rating').eq('id', bookingId).single();
                    updatePayload.status = currentBooking?.rating ? 'DONE' : 'FEEDBACK';
                    if (!currentBooking?.rating) updatePayload.timeEnd = new Date().toISOString();
                } else {
                    console.log(`[KTV API] KTV ${technicianCode} feedback, but other items still working.`);
                }
            } else {
                if (allItemsCompleted) {
                    updatePayload.timeEnd = new Date().toISOString();
                    updatePayload.status = 'CLEANING'; // 🔥 Tự động chuyển sang dọn phòng
                    console.log(`[KTV API] All items completed for booking ${bookingId}. Moving to CLEANING.`);
                } else {
                    console.log(`[KTV API] KTV ${technicianCode} completed, but other items still working. Keep IN_PROGRESS.`);
                }
            }
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

        let data: any = null;
        if (Object.keys(updatePayload).length > 0) {
            const result = await supabase
                .from('Bookings')
                .update(updatePayload)
                .eq('id', bookingId)
                .select()
                .maybeSingle();

            if (result.error) throw result.error;
            if (!result.data) throw new Error('Không tìm thấy đơn hàng để cập nhật');
            data = result.data;
        } else {
            const result = await supabase
                .from('Bookings')
                .select()
                .eq('id', bookingId)
                .maybeSingle();
            
            if (result.error) throw result.error;
            if (!result.data) throw new Error('Không tìm thấy đơn hàng');
            data = result.data;
        }

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
                    booking_item_ids: '{}', // CLEAR ARRAY
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
