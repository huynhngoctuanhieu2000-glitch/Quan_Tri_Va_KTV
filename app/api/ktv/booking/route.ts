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
                .select('id, code, nameVN, nameEN, duration, focusConfig, description, procedure, service_description, is_utility')
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
                    is_utility: svc?.is_utility ?? (sId === 'nhs0900'), // ✅ Truyền is_utility xuống KTVDashboard
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

        // 🔄 ON-THE-FLY TIMELINE SHIFT CALCULATION
        // CHỈ tính nối tiếp cho segments CỦA CÙNG 1 KTV (gối đầu).
        // KTV khác nhau → giữ nguyên giờ gốc (song song).
        let finalDispatchStartTime = turnInfo?.start_time;
        
        // Helpers for math
        const formatToHourMinute = (isoString: string | null | undefined): string => {
            if (!isoString) return '--:--';
            if (/^\d{1,2}:\d{2}$/.test(isoString)) return isoString;
            let parseString = isoString;
            if (!isoString.endsWith('Z') && !isoString.includes('+')) parseString = isoString.replace(' ', 'T') + 'Z';
            const d = new Date(parseString);
            if (isNaN(d.getTime())) return isoString;
            const dVn = new Date(d.getTime() + 7 * 60 * 60 * 1000);
            return `${String(dVn.getUTCHours()).padStart(2, '0')}:${String(dVn.getUTCMinutes()).padStart(2, '0')}`;
        };
        const getDynamicEndTime = (startStr?: string | null, durationMins: number = 60) => {
            if (!startStr) return '--:--';
            const formatted = formatToHourMinute(startStr);
            if (formatted === '--:--') return '--:--';
            let [h, m] = formatted.split(':').map(Number);
            m += durationMins;
            h += Math.floor(m / 60);
            m = m % 60;
            h = h % 24;
            return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        };

        // Collect only THIS KTV's segments (not all KTVs)
        const mySegments: { origStart: string; duration: number; actualStartTime?: string; actualEndTime?: string }[] = [];
        itemsWithService.forEach((item: any) => {
            if (item.is_utility === true || item.serviceId === 'NHS0900' || item.service_name?.toLowerCase().includes('phòng riêng') || item.service_name?.toLowerCase().includes('phong rieng')) return;
            let segs: any[] = [];
            try { segs = typeof item.segments === 'string' ? JSON.parse(item.segments) : (item.segments || []); } catch {}
            segs.forEach((s: any) => {
                if (s.ktvId && technicianCode && s.ktvId.trim().toUpperCase() === technicianCode.trim().toUpperCase()) {
                    mySegments.push({
                        origStart: s.startTime || item.timeStart || '',
                        duration: Number(s.duration) || Number(item.duration) || 60,
                        actualStartTime: s.actualStartTime,
                        actualEndTime: s.actualEndTime
                    });
                }
            });
        });

        mySegments.sort((a, b) => a.origStart.localeCompare(b.origStart));

        let myCalculatedStart = '';
        if (mySegments.length > 0) {
            // Chặng đầu: luôn dùng giờ gốc từ lễ tân
            myCalculatedStart = mySegments[0].origStart;

            // Chặng 2+: nối tiếp nếu cùng KTV (gối đầu)
            let prevEndStr = mySegments[0].actualEndTime || getDynamicEndTime(mySegments[0].actualStartTime || mySegments[0].origStart, mySegments[0].duration);
            for (let i = 1; i < mySegments.length; i++) {
                let calcStart = mySegments[i].origStart;
                // Chỉ shift nếu chặng trước kết thúc SAU giờ bắt đầu chặng này
                if (prevEndStr > calcStart) {
                    calcStart = prevEndStr;
                }
                const runtimeAnchor = mySegments[i].actualStartTime || calcStart;
                prevEndStr = mySegments[i].actualEndTime || getDynamicEndTime(runtimeAnchor, mySegments[i].duration);
            }
        }

        if (myCalculatedStart) {
            finalDispatchStartTime = myCalculatedStart;
        }

        let nextBookingId = null;
        let nextServiceName = null;
        let nextStartTime = null;
        if (technicianCode) {
            const today = getBusinessDate();
            const { data: nextAssign } = await supabase
                .from('KtvAssignments')
                .select('booking_id, planned_start_time')
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

                // Format planned_start_time to HH:mm VN
                if (nextAssign.planned_start_time) {
                    const pst = new Date(nextAssign.planned_start_time);
                    const vnPst = new Date(pst.getTime() + 7 * 60 * 60 * 1000);
                    nextStartTime = `${String(vnPst.getUTCHours()).padStart(2, '0')}:${String(vnPst.getUTCMinutes()).padStart(2, '0')}`;
                }

                // Fetch service name from the next booking's items assigned to this KTV
                const { data: nextItems } = await supabase
                    .from('BookingItems')
                    .select('serviceId, options, duration')
                    .eq('bookingId', nextAssign.booking_id)
                    .contains('technicianCodes', [technicianCode]);

                if (nextItems && nextItems.length > 0) {
                    const svcIds = nextItems.map((ni: any) => String(ni.serviceId || '').trim().toLowerCase()).filter(Boolean);
                    if (svcIds.length > 0) {
                        const { data: svcs } = await supabase
                            .from('Services')
                            .select('id, code, nameVN')
                            .limit(500);
                        const svcMap = new Map();
                        if (svcs) svcs.forEach((s: any) => {
                            if (s.id) svcMap.set(String(s.id).trim().toLowerCase(), s);
                            if (s.code) svcMap.set(String(s.code).trim().toLowerCase(), s);
                        });
                        const names = nextItems.map((ni: any) => {
                            const displayName = ni.options?.displayName;
                            if (displayName) return displayName;
                            const svc = svcMap.get(String(ni.serviceId || '').trim().toLowerCase());
                            const nameVN = svc?.nameVN;
                            return typeof nameVN === 'object' ? (nameVN?.vn || nameVN?.en || `DV`) : (nameVN || `DV`);
                        });
                        nextServiceName = names.join(' + ');
                    }
                }
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
                nextBookingId: nextBookingId,
                nextServiceName: nextServiceName,
                nextStartTime: nextStartTime
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
                    let allowedUtc = new Date(Date.UTC(nowVn.getUTCFullYear(), nowVn.getUTCMonth(), nowVn.getUTCDate(), h, m, 0) - vnOffsetMs);
                    
                    // 🌙 FIX CA ĐÊM: Nếu start_time chiều (VD: 17:29) nhưng hiện tại đã qua 0:00
                    // → allowed bị tính vào ngày hôm sau → lùi 1 ngày
                    if (allowedUtc.getTime() - nowUtc.getTime() > 12 * 60 * 60 * 1000) {
                        allowedUtc = new Date(allowedUtc.getTime() - 24 * 60 * 60 * 1000);
                    }
                    
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
                let originalItemsData: Record<string, any[]> = {};
                
                for (const item of currentItems || []) {
                    let segs = typeof item.segments === 'string' ? JSON.parse(item.segments) : (Array.isArray(item.segments) ? item.segments : []);
                    originalItemsData[item.id] = [...segs]; // Backup the entire array
                    segs.forEach((seg: any, idx: number) => {
                        if (seg.ktvId?.toLowerCase() === technicianCode?.toLowerCase()) allGlobalSegs.push({ item, idx, seg });
                    });
                }
                allGlobalSegs.sort((a, b) => (a.seg.startTime || '23:59').localeCompare(b.seg.startTime || '23:59'));

                if (action === 'START_TIMER' || action === 'NEXT_SEGMENT') {
                    const startIdx = action === 'START_TIMER' ? 0 : activeSegmentIndex;
                    if (allGlobalSegs[startIdx]) {
                        const myStartTime = allGlobalSegs[startIdx].seg.startTime;
                        if (action === 'NEXT_SEGMENT' && startIdx > 0) allGlobalSegs[startIdx - 1].seg.actualEndTime = sharedTimeStart;
                        
                        allGlobalSegs[startIdx].seg.actualStartTime = sharedTimeStart;
                        const target = allGlobalSegs[startIdx];
                        originalItemsData[target.item.id][target.idx] = target.seg;
                        
                        if (action === 'NEXT_SEGMENT' && startIdx > 0) {
                            const prevTarget = allGlobalSegs[startIdx - 1];
                            originalItemsData[prevTarget.item.id][prevTarget.idx] = prevTarget.seg;
                        }

                        // 🤝 PARALLEL START SYNC: Co-start co-workers with SAME startTime (song song)

                        if (action === 'START_TIMER' && myStartTime) {
                            const targetItemId = target.item.id;
                            originalItemsData[targetItemId].forEach((seg: any) => {
                                if (seg.ktvId
                                    && seg.ktvId.toLowerCase() !== technicianCode?.toLowerCase()
                                    && seg.startTime === myStartTime
                                    && !seg.actualStartTime) {
                                    seg.actualStartTime = sharedTimeStart;
                                    console.log(`🤝 [Parallel Sync] Co-started ${seg.ktvId}'s segment at ${myStartTime}`);
                                }
                            });
                        }
                    }
                }

                for (const item of currentItems || []) {
                    await supabase.from('BookingItems').update({ segments: JSON.stringify(originalItemsData[item.id]) }).eq('id', item.id);
                }
            }

            // 🔥 CRITICAL: Recalculate TurnQueue.estimated_end_time when KTV actually starts
            if (action === 'START_TIMER' && technicianCode && turnForSync) {
                const nowVN = new Date().toLocaleTimeString('en-US', { hour12: false, timeZone: 'Asia/Ho_Chi_Minh' });
                const turnUpdatePayload: any = { status: 'working', start_time: nowVN };

                if (turnForSync.start_time) {
                    // Calculate original duration from dispatch times
                    const { data: freshTurn } = await supabase
                        .from('TurnQueue')
                        .select('estimated_end_time')
                        .eq('id', turnForSync.id)
                        .single();
                    
                    const estEnd = freshTurn?.estimated_end_time;
                    if (estEnd) {
                        const [sh, sm] = String(turnForSync.start_time).split(':').map(Number);
                        const [eh, em] = String(estEnd).split(':').map(Number);
                        let durationMins = (eh * 60 + em) - (sh * 60 + sm);
                        if (durationMins <= 0) durationMins += 24 * 60; // cross midnight

                        const [nh, nm] = nowVN.split(':').map(Number);
                        let endMins = nh * 60 + nm + durationMins;
                        const endH = Math.floor(endMins / 60) % 24;
                        const endM = endMins % 60;
                        turnUpdatePayload.estimated_end_time = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}:00`;
                        console.log(`🔄 [KTV API] ${technicianCode}: Recalculated end ${estEnd} → ${turnUpdatePayload.estimated_end_time} (actual start: ${nowVN}, dur: ${durationMins}m)`);
                    }
                }

                await supabase.from('TurnQueue').update(turnUpdatePayload).eq('id', turnForSync.id);
            }
        }

        if (status === 'CLEANING' || status === 'DONE' || status === 'FEEDBACK') {
            const isFeedback = status === 'FEEDBACK';
            itemUpdatePayload.timeEnd = new Date().toISOString();
            const nowISO = new Date().toISOString();
            const { data: items } = await supabase.from('BookingItems').select('id, segments, status').in('id', allItemIdsForThisKTV);
            
            // 🌟 1. Gom tất cả segments của KTV này trên toàn bộ BookingItems để tính isMerged
            let allGlobalSegs: any[] = [];
            let originalItemsData: Record<string, any[]> = {};
            for (const item of items || []) {
                let segs = typeof item.segments === 'string' ? JSON.parse(item.segments) : (Array.isArray(item.segments) ? item.segments : []);
                originalItemsData[item.id] = [...segs];
                segs.forEach((seg: any, idx: number) => {
                    if (seg.ktvId?.toLowerCase() === technicianCode?.toLowerCase()) {
                        allGlobalSegs.push({ item, idx, seg, _itemId: item.id });
                    }
                });
            }
            allGlobalSegs.sort((a, b) => (a.seg.startTime || '23:59').localeCompare(b.seg.startTime || '23:59'));
            const uniqueItemIds = new Set(allGlobalSegs.map((s: any) => s._itemId));
            const isMerged = allGlobalSegs.length > 1 && uniqueItemIds.size === allGlobalSegs.length;

            if (isMerged && (status === 'CLEANING' || isFeedback)) {
                // Forwards padding to prevent negative duration if KTV finishes early
                const firstStartTime = allGlobalSegs[0].seg.actualStartTime || nowISO;
                let actualTimeSpentMs = new Date(nowISO).getTime() - new Date(firstStartTime).getTime();
                if (actualTimeSpentMs < 0) actualTimeSpentMs = 0; // Guard against negative time

                let currentStartTimeMs = new Date(firstStartTime).getTime();

                for (let i = 0; i < allGlobalSegs.length; i++) {
                    const target = allGlobalSegs[i];
                    const maxDurationMs = (Number(target.seg.duration) || 60) * 60000;
                    
                    target.seg.actualStartTime = new Date(currentStartTimeMs).toISOString();
                    
                    // Allocate time to this segment
                    const allocatedMs = Math.min(actualTimeSpentMs, maxDurationMs);
                    actualTimeSpentMs -= allocatedMs;
                    currentStartTimeMs += allocatedMs;
                    
                    target.seg.actualEndTime = new Date(currentStartTimeMs).toISOString();
                    if (isFeedback) target.seg.feedbackTime = nowISO;
                    
                    originalItemsData[target.item.id][target.idx] = target.seg;
                }
                
                // Đảm bảo chặng cuối cùng gánh hết thời gian dư (nếu finish trễ)
                const lastTarget = allGlobalSegs[allGlobalSegs.length - 1];
                lastTarget.seg.actualEndTime = nowISO;
                originalItemsData[lastTarget.item.id][lastTarget.idx] = lastTarget.seg;
                
            } else {
                // Logic cũ
                allGlobalSegs.forEach((target) => {
                    if (status === 'CLEANING' || isFeedback) {
                        if (!target.seg.actualEndTime) target.seg.actualEndTime = nowISO;
                        if (isFeedback && !target.seg.feedbackTime) target.seg.feedbackTime = nowISO;
                    }
                    originalItemsData[target.item.id][target.idx] = target.seg;
                });
            }

            for (const item of items || []) {
                let segs = originalItemsData[item.id];
                
                // 1. Mark this KTV's segments as done
                const myDoneStartTimes: string[] = [];
                segs.forEach((seg: any) => {
                    if (seg.ktvId?.toLowerCase() === technicianCode?.toLowerCase() && seg.startTime) {
                        myDoneStartTimes.push(seg.startTime);
                    }
                });

                myDoneStartTimes.forEach(st => {
                    segs.forEach((seg: any) => {
                        if (seg.ktvId
                            && seg.ktvId.toLowerCase() !== technicianCode?.toLowerCase()
                            && seg.startTime === st) {
                            if (!seg.actualEndTime) {
                                seg.actualEndTime = nowISO;
                                console.log(`🤝 [Parallel Sync] Co-finished ${seg.ktvId}'s segment at ${st}`);
                            }
                            if (isFeedback && !seg.feedbackTime) {
                                seg.feedbackTime = nowISO;
                            }
                        }
                    });
                });

                // 3. 🧠 SMART STATUS: Only set CLEANING when ALL segments in item have actualEndTime
                //    Prevents sequential bug (KTV1 done but KTV2 not started yet)
                const allSegsDone = segs.every((s: any) => !!s.actualEndTime);
                const newItemStatus = allSegsDone
                    ? (isFeedback ? 'FEEDBACK' : 'CLEANING')
                    : 'IN_PROGRESS';
                
                await supabase.from('BookingItems').update({ segments: JSON.stringify(segs), status: newItemStatus }).eq('id', item.id);
                console.log(`🧠 [Smart Status] Item ${item.id}: allSegsDone=${allSegsDone} → ${newItemStatus}`);
            }
            
            // 🔄 ĐỒNG BỘ TRẠNG THÁI BOOKING & GIẢI PHÓNG PHÒNG
            const { data: allItems } = await supabase
                .from('BookingItems')
                .select('status, serviceId, Services!BookingItems_serviceId_fkey(nameVN, is_utility)')
                .eq('bookingId', bookingId);
            if (allItems && allItems.length > 0) {
                const validItems = allItems.filter((i: any) => {
                    const name = i.Services?.nameVN || '';
                    return i.Services?.is_utility !== true 
                        && i.serviceId !== 'NHS0900'  // Legacy fallback
                        && !name.toLowerCase().includes('phòng riêng')
                        && !name.toLowerCase().includes('phong rieng');
                });
                const finalItems = validItems.length > 0 ? validItems : allItems;
                const statuses = finalItems.map(i => i.status);
                const { recomputeBookingStatus } = await import('@/lib/dispatch-status');
                const bStatus = recomputeBookingStatus(statuses);
                updatePayload.status = bStatus;
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

        // Removed destructive syncOrderTimelineToDb

        return NextResponse.json({ success: true, data });
    } catch (error: any) {
        console.error('❌ [KTV API] PATCH error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
