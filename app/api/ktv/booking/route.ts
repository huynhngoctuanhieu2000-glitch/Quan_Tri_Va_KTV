import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

function getBusinessDate() {
    const nowUtc = new Date();
    const vnOffsetMs = 7 * 60 * 60 * 1000;
    const vnTime = new Date(nowUtc.getTime() + vnOffsetMs);
    
    if (vnTime.getUTCHours() < 6) {
        vnTime.setUTCDate(vnTime.getUTCDate() - 1);
    }
    return vnTime.toISOString().split('T')[0];
}

/**
 * API Lấy đơn hàng đang thực hiện của KTV
 * GET /api/ktv/booking?techCode=NH001
 */
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const technicianCode = searchParams.get('techCode');
    const bookingIdParam = searchParams.get('bookingId');

    try {
        const supabase = getSupabaseAdmin();
        if (!supabase) throw new Error('Supabase admin not initialized');

        let bookingId = bookingIdParam;

        // 1. Xác định bookingId nếu chưa được truyền vào
        if (!bookingId) {
            if (!technicianCode) {
                return NextResponse.json({ success: false, error: 'Technician code or bookingId is required' }, { status: 400 });
            }

            // 1.a Lấy tất cả item active của KTV
            const { data: activeItems } = await supabase
                .from('BookingItems')
                .select('bookingId, status, id, segments')
                .contains('technicianCodes', [technicianCode])
                .in('status', ['IN_PROGRESS'])
                .order('timeStart', { ascending: false, nullsFirst: false });

            let validActiveItem = null;
            if (activeItems && activeItems.length > 0) {
                for (const item of activeItems) {
                    let segs: any[] = [];
                    try {
                        segs = typeof item.segments === 'string' ? JSON.parse(item.segments) : (Array.isArray(item.segments) ? item.segments : []);
                    } catch { segs = []; }
                    
                    const mySegs = segs.filter((s: any) => s.ktvId && s.ktvId.toLowerCase() === technicianCode.toLowerCase());
                    const isStillWorking = mySegs.length === 0 || mySegs.some((s: any) => !s.actualEndTime);
                    
                    if (isStillWorking) {
                        validActiveItem = item;
                        break;
                    }
                }
            }

            if (validActiveItem) {
                bookingId = validActiveItem.bookingId;
            } else {
                // 1.b Nếu không có item IN_PROGRESS, lấy từ TurnQueue (đơn mới gán)
                const today = getBusinessDate();
                const { data: turn, error: tError } = await supabase
                    .from('TurnQueue')
                    .select('current_order_id, booking_item_id, booking_item_ids, status')
                    .eq('employee_id', technicianCode)
                    .eq('date', today)
                    .maybeSingle();

                if (tError) throw tError;
                if (!turn || !turn.current_order_id) {
                    const { data: nextAssign } = await supabase.from('KtvAssignments').select('booking_id').eq('employee_id', technicianCode).eq('business_date', today).in('status', ['QUEUED', 'READY']).order('priority', { ascending: true }).order('planned_start_time', { ascending: true, nullsFirst: false }).limit(1).maybeSingle();
                    if (nextAssign) return NextResponse.json({ success: true, data: { nextBookingId: nextAssign.booking_id } });
                    return NextResponse.json({ success: true, data: null });
                }
                bookingId = turn.current_order_id;
            }
        }

        // 🔧 SYNC CHECK: Nếu KTV đang xem đơn (có bookingId) mà TurnQueue vẫn null/khác 
        if (bookingId && technicianCode) {
            const today = getBusinessDate();
            const { data: assign } = await supabase
                .from('KtvAssignments')
                .select('status')
                .eq('employee_id', technicianCode)
                .eq('booking_id', bookingId)
                .eq('business_date', today)
                .maybeSingle();
            
            if (assign && (assign.status === 'QUEUED' || assign.status === 'READY')) {
                await supabase
                    .from('KtvAssignments')
                    .update({ status: 'ACTIVE', updated_at: new Date().toISOString() })
                    .eq('employee_id', technicianCode)
                    .eq('booking_id', bookingId)
                    .eq('business_date', today);
                
                console.log(`[KTV API] Auto-activated assignment for KTV ${technicianCode} on booking ${bookingId}`);
            }
        }

        // 2. Lấy đơn hàng tương ứng
        const { data: booking, error: bError } = await supabase
            .from('Bookings')
            .select('*')
            .eq('id', bookingId)
            .maybeSingle();

        if (bError) throw bError;
        if (!booking) {
            if (technicianCode) {
                const today = getBusinessDate();
                const { data: nextAssign } = await supabase.from('KtvAssignments').select('booking_id').eq('employee_id', technicianCode).eq('business_date', today).in('status', ['QUEUED', 'READY']).order('priority', { ascending: true }).order('planned_start_time', { ascending: true, nullsFirst: false }).limit(1).maybeSingle();
                if (nextAssign) return NextResponse.json({ success: true, data: { nextBookingId: nextAssign.booking_id } });
            }
            return NextResponse.json({ success: true, data: null });
        }

        // 3. Lấy thông tin TurnQueue của booking này
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
            const { data: svcs, error: svcError } = await supabase
                .from('Services')
                .select('id, code, nameVN, nameEN, duration, focusConfig, description, procedure, service_description')
                .limit(1000);

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

                return {
                    ...i,
                    service_name: opts.displayName || getI18nStr(svc?.nameVN || svc?.nameEN || svc?.name, `Dịch vụ ${rawSId}`),
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
            });
        }

        // 5. Xác định item và segment đang active thực sự
        const assignedItemIds = (turnInfo?.booking_item_ids && turnInfo.booking_item_ids.length > 0) 
            ? turnInfo.booking_item_ids 
            : (turnInfo?.booking_item_id ? [turnInfo.booking_item_id] : []);
            
        let activeItemId = null;
        let activeSegmentIndex = 0;
        let statusSource = 'none';

        const ktvItems = itemsWithService.filter((i: any) => 
            i.technicianCodes && 
            Array.isArray(i.technicianCodes) && 
            technicianCode && 
            i.technicianCodes.some((c: string) => c.trim().toUpperCase() === technicianCode.trim().toUpperCase())
        );

        if (ktvItems.length > 0) {
            for (const item of ktvItems) {
                let segs: any[] = [];
                try { segs = typeof item.segments === 'string' ? JSON.parse(item.segments) : (Array.isArray(item.segments) ? item.segments : []); } catch { segs = []; }
                const mySegs = segs.filter((s: any) => s.ktvId && s.ktvId.trim().toUpperCase() === technicianCode?.trim().toUpperCase());
                const runningIdx = mySegs.findIndex((s: any) => s.actualStartTime && !s.actualEndTime);
                if (runningIdx !== -1) {
                    activeItemId = item.id;
                    activeSegmentIndex = runningIdx;
                    statusSource = 'segment_runtime';
                    break;
                }
            }

            if (!activeItemId) {
                const inProgressItem = ktvItems.find((i: any) => i.status === 'IN_PROGRESS');
                if (inProgressItem) {
                    activeItemId = inProgressItem.id;
                    statusSource = 'item_status';
                    let segs: any[] = [];
                    try { segs = typeof inProgressItem.segments === 'string' ? JSON.parse(inProgressItem.segments) : (Array.isArray(inProgressItem.segments) ? inProgressItem.segments : []); } catch { segs = []; }
                    const mySegs = segs.filter((s: any) => s.ktvId && s.ktvId.trim().toUpperCase() === technicianCode?.trim().toUpperCase());
                    const nextIdx = mySegs.findIndex((s: any) => !s.actualEndTime);
                    activeSegmentIndex = nextIdx !== -1 ? nextIdx : 0;
                }
            }
            
            if (!activeItemId && turnInfo?.booking_item_id) {
                const turnItem = ktvItems.find((i: any) => i.id === turnInfo.booking_item_id);
                if (turnItem) {
                    activeItemId = turnItem.id;
                    statusSource = 'turnqueue_legacy';
                }
            }
            
            if (!activeItemId && assignedItemIds.length > 0) {
                activeItemId = assignedItemIds[0];
                statusSource = 'turnqueue_array';
            }
            
            if (!activeItemId) {
                activeItemId = ktvItems[0].id;
                statusSource = 'first_found';
            }
        }

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

        let finalDispatchStartTime = turnInfo?.start_time;
        if (activeItemId) {
            const activeItem = ktvItems.find((i: any) => i.id === activeItemId);
            if (activeItem) {
                let segs: any[] = [];
                try { segs = typeof activeItem.segments === 'string' ? JSON.parse(activeItem.segments) : (Array.isArray(activeItem.segments) ? activeItem.segments : []); } catch { segs = []; }
                const mySegs = segs.filter((s: any) => s.ktvId && technicianCode && s.ktvId.trim().toUpperCase() === technicianCode.trim().toUpperCase());
                if (mySegs[activeSegmentIndex] && mySegs[activeSegmentIndex].startTime) {
                    finalDispatchStartTime = mySegs[activeSegmentIndex].startTime;
                } else if (mySegs.length > 0 && mySegs[0].startTime) {
                    finalDispatchStartTime = mySegs[0].startTime;
                }
            }
        }

        let nextBookingId = null;
        if (technicianCode) {
            const today = getBusinessDate();
            const { data: nextAssign } = await supabase
                .from('KtvAssignments')
                .select('booking_id')
                .eq('employee_id', technicianCode)
                .eq('business_date', today)
                .in('status', ['QUEUED', 'READY'])
                .neq('booking_id', booking.id)
                .order('priority', { ascending: true })
                .order('planned_start_time', { ascending: true, nullsFirst: false })
                .order('sequence_no', { ascending: true })
                .order('created_at', { ascending: true })
                .limit(1)
                .maybeSingle();
            
            if (nextAssign) {
                nextBookingId = nextAssign.booking_id;
            }
        }

        return NextResponse.json({
            success: true,
            data: {
                ...booking,
                dispatcherNote: booking.notes || '',
                BookingItems: itemsWithService,
                assignedItemId: activeItemId,
                assignedItemIds: ktvItems.map((i: any) => i.id),
                activeSegmentIndex: activeSegmentIndex,
                statusSource: statusSource,
                last_served_at: turnInfo?.last_served_at,
                dispatchStartTime: finalDispatchStartTime,
                assignedRoomId: turnInfo?.room_id,
                assignedBedId: turnInfo?.bed_id,
                roomPrepProcedure: roomProcedures.prep_procedure,
                roomCleanProcedure: roomProcedures.clean_procedure,
                nextBookingId: nextBookingId
            },
            serverTime: new Date().toISOString()
        });
    } catch (error: any) {
        console.error('API Error (GET /api/ktv/booking):', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

/**
 * API Cập nhật trạng thái đơn hàng
 * PATCH /api/ktv/booking
 */
export async function PATCH(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const techCodeFromQuery = searchParams.get('techCode');
        const body = await request.json();
        const { bookingId, status: rawStatus, action, techCode: techCodeFromBody } = body;
        
        let status = rawStatus;
        const technicianCode = techCodeFromQuery || techCodeFromBody;

        if (!bookingId || !status) {
            return NextResponse.json({ success: false, error: 'bookingId and status are required' }, { status: 400 });
        }

        if (status === 'COMPLETED') status = 'CLEANING';

        const supabase = getSupabaseAdmin();
        if (!supabase) throw new Error('Supabase admin not initialized');

        const today = getBusinessDate();
        const { data: turnForSync } = await supabase
            .from('TurnQueue')
            .select('id, booking_item_id, booking_item_ids, last_served_at, start_time, turns_completed, status, room_id')
            .eq('employee_id', technicianCode)
            .eq('date', today)
            .eq('current_order_id', bookingId)
            .maybeSingle();

        const updatePayload: any = { updatedAt: new Date().toISOString() };
        const itemUpdatePayload: any = { status };
        
        let targetBookingItemId = turnForSync?.booking_item_id;
        let allItemIdsForThisKTV: string[] = [];

        if (technicianCode) {
            const { data: ktvItems } = await supabase.from('BookingItems').select('id, "technicianCodes"').eq('bookingId', bookingId);
            allItemIdsForThisKTV = (ktvItems || []).filter((item: any) => Array.isArray(item.technicianCodes) && item.technicianCodes.includes(technicianCode)).map((item: any) => item.id);
        }

        if (allItemIdsForThisKTV.length === 0 && targetBookingItemId) allItemIdsForThisKTV = [targetBookingItemId];
        
        if (status === 'IN_PROGRESS' || action === 'NEXT_SEGMENT_PREPARE') {
            if (turnForSync && action !== 'NEXT_SEGMENT_PREPARE') {
                let allowed: Date | null = null;
                if (turnForSync.start_time) {
                    const [h, m] = String(turnForSync.start_time).split(':').map(Number);
                    const nowUtc = new Date();
                    const vnOffsetMs = 7 * 60 * 60 * 1000;
                    const nowVn = new Date(nowUtc.getTime() + vnOffsetMs);
                    const allowedUtc = new Date(Date.UTC(nowVn.getUTCFullYear(), nowVn.getUTCMonth(), nowVn.getUTCDate(), h, m, 0) - vnOffsetMs);
                    allowed = allowedUtc;
                }
                if (allowed && new Date().getTime() < (allowed.getTime() - 5000)) {
                    const vnOffsetMs = 7 * 60 * 60 * 1000;
                    const allowedVn = new Date(allowed.getTime() + vnOffsetMs);
                    return NextResponse.json({ success: false, error: `Chưa đến giờ được phép bắt đầu! Vui lòng đợi đến ${String(allowedVn.getUTCHours()).padStart(2, '0')}:${String(allowedVn.getUTCMinutes()).padStart(2, '0')}` }, { status: 403 });
                }
            }

            const sharedTimeStart = new Date().toISOString();
            const { data: currentBookingForTime } = await supabase.from('Bookings').select('timeStart').eq('id', bookingId).single();
            
            if (!currentBookingForTime?.timeStart && action !== 'RESUME_TIMER' && action !== 'NEXT_SEGMENT') {
                updatePayload.timeStart = sharedTimeStart;
            }

            if (allItemIdsForThisKTV.length > 0) {
                const { data: currentItems } = await supabase.from('BookingItems').select('id, segments, timeStart').in('id', allItemIdsForThisKTV);
                const activeSegmentIndex = body.activeSegmentIndex || 0;
                let allGlobalSegs: any[] = [];
                
                for (const item of currentItems || []) {
                    let segs = typeof item.segments === 'string' ? JSON.parse(item.segments) : (Array.isArray(item.segments) ? item.segments : []);
                    segs.forEach((seg: any, idx: number) => {
                        if (seg.ktvId?.toLowerCase() === technicianCode?.toLowerCase()) allGlobalSegs.push({ item, idx, seg });
                    });
                }
                allGlobalSegs.sort((a, b) => (a.seg.startTime || '23:59').localeCompare(b.seg.startTime || '23:59'));

                if (action === 'START_TIMER' || action === 'NEXT_SEGMENT') {
                    const startIdx = action === 'START_TIMER' ? 0 : activeSegmentIndex;
                    if (allGlobalSegs[startIdx]) {
                        if (action === 'NEXT_SEGMENT' && startIdx > 0) allGlobalSegs[startIdx - 1].seg.actualEndTime = sharedTimeStart;
                        allGlobalSegs[startIdx].seg.actualStartTime = sharedTimeStart;
                    }
                }

                for (const item of currentItems || []) {
                    const itemSegs = allGlobalSegs.filter(s => s.item.id === item.id).map(s => s.seg);
                    await supabase.from('BookingItems').update({ segments: JSON.stringify(itemSegs) }).eq('id', item.id);
                }
            }
        }

        if (status === 'CLEANING' || status === 'DONE' || status === 'FEEDBACK') {
            const isFeedback = status === 'FEEDBACK';
            itemUpdatePayload.timeEnd = new Date().toISOString();
            const { data: items } = await supabase.from('BookingItems').select('id, segments, status').in('id', allItemIdsForThisKTV);
            for (const item of items || []) {
                let segs = typeof item.segments === 'string' ? JSON.parse(item.segments) : (Array.isArray(item.segments) ? item.segments : []);
                segs.forEach((seg: any) => {
                    if (seg.ktvId?.toLowerCase() === technicianCode?.toLowerCase()) {
                        if (!seg.actualEndTime) seg.actualEndTime = new Date().toISOString();
                        if (isFeedback && !seg.feedbackTime) seg.feedbackTime = new Date().toISOString();
                    }
                });
                await supabase.from('BookingItems').update({ segments: JSON.stringify(segs), status: isFeedback ? 'FEEDBACK' : 'CLEANING' }).eq('id', item.id);
            }
        }

        let data = null;
        if (Object.keys(updatePayload).length > 0) {
            const res = await supabase.from('Bookings').update(updatePayload).eq('id', bookingId).select().maybeSingle();
            data = res.data;
        } else {
            const res = await supabase.from('Bookings').select().eq('id', bookingId).maybeSingle();
            data = res.data;
        }

        if (action === 'RELEASE_KTV' && technicianCode) {
            await supabase.from('KtvAssignments').update({ status: 'COMPLETED', updated_at: new Date().toISOString() }).eq('employee_id', technicianCode).eq('business_date', today).eq('booking_id', bookingId).in('status', ['ACTIVE', 'QUEUED', 'READY']);
            await supabase.rpc('promote_next_assignment', { p_employee_id: technicianCode, p_business_date: today });
        }

        return NextResponse.json({ success: true, data });
    } catch (error: any) {
        console.error('❌ [KTV API] PATCH error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
