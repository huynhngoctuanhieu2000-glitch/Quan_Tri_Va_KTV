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
                const noteForKtv = opts.noteForKtv || '';
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

        return NextResponse.json({
            success: true,
            data: {
                ...booking,
                dispatcherNote: booking.notes || '',
                BookingItems: itemsWithService,
                assignedItemId: assignedItemId,
                // Thông tin ràng buộc thời gian & Vị trí làm việc cụ thể
                last_served_at: turnInfo?.last_served_at,
                dispatchStartTime: turnInfo?.start_time,
                assignedRoomId: turnInfo?.room_id,
                assignedBedId: turnInfo?.bed_id
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
        // Chỉ cập nhật status của Booking tổng nếu nó thuộc danh sách hợp lệ (Enum BookingStatus)
        const validBookingStatuses = ['NEW', 'PREPARING', 'IN_PROGRESS', 'COMPLETED', 'FEEDBACK', 'DONE', 'CANCELLED'];
        if (validBookingStatuses.includes(status)) {
            updatePayload.status = status;
        }

        const itemUpdatePayload: any = { status, updatedAt: new Date().toISOString() };
        
        // 📝 XỬ LÝ APPEND_NOTES (Ghi đè hoặc nối thêm ghi chú từ KTV)
        if (action === 'APPEND_NOTES' && body.notes) {
            const { data: currentB } = await supabase.from('Bookings').select('notes').eq('id', bookingId).single();
            const oldNotes = currentB?.notes || '';
            // Nối thêm nếu chưa có nội dung tương tự (tránh lặp lại khi refresh)
            if (!oldNotes.includes(body.notes)) {
                updatePayload.notes = oldNotes ? `${oldNotes} | ${body.notes}` : body.notes;
            } else {
                updatePayload.notes = oldNotes;
            }
        }
        
        if (status === 'IN_PROGRESS') {
            // 🔒 Server-side validation: Kiểm tra ràng buộc thời gian
            if (turnForSync) {
                let allowed: Date | null = null;
                if (turnForSync.start_time) {
                    const [h, m] = String(turnForSync.start_time).split(':').map(Number);
                    const d = new Date();
                    d.setHours(h, m, 0, 0);
                    allowed = d;
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
                    return NextResponse.json({ 
                        success: false, 
                        error: `Chưa đến giờ được phép bắt đầu! Vui lòng đợi đến ${allowed.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}` 
                    }, { status: 403 });
                }
            }
            updatePayload.timeStart = new Date().toISOString();
            itemUpdatePayload.timeStart = new Date().toISOString();
        } else if (status === 'READY') {
            // Trạng thái sẵn sàng (đã chuẩn bị xong), dùng để đồng bộ nhóm
            itemUpdatePayload.status = 'READY';
        } else if (status === 'CLEANING') {
            // Trạng thái bắt đầu dọn phòng (sau khi đánh giá khách)
            itemUpdatePayload.status = 'CLEANING';
        } else if (status === 'DONE' || status === 'COMPLETED') {
            updatePayload.timeEnd = new Date().toISOString();
            itemUpdatePayload.timeEnd = new Date().toISOString();
        }

        if (action === 'EARLY_EXIT') {
            updatePayload.notes = 'Khách về sớm';
        }

        // Cập nhật BookingItem nếu có gán ID dịch vụ HOẶC lấy dịch vụ đầu tiên làm fallback cho Co-working
        let targetBookingItemId = turnForSync?.booking_item_id;
        
        if (!targetBookingItemId) {
            // Fallback lấy dịch vụ đầu tiên của đơn hàng này
            const { data: firstItem } = await supabase
                .from('BookingItems')
                .select('id')
                .eq('bookingId', bookingId)
                .order('id', { ascending: true })
                .limit(1)
                .maybeSingle();
                
            if (firstItem) {
                targetBookingItemId = firstItem.id;
            }
        }

        if (targetBookingItemId) {
            const { error: itemErr } = await supabase
                .from('BookingItems')
                .update(itemUpdatePayload)
                .eq('id', targetBookingItemId);
            
            if (itemErr) console.error('⚠️ [KTV API] BookingItem update error (non-fatal):', itemErr);
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
