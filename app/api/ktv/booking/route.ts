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

    if (!technicianCode) {
        return NextResponse.json({ success: false, error: 'Technician code is required' }, { status: 400 });
    }

    try {
        const supabase = getSupabaseAdmin();
        if (!supabase) throw new Error('Supabase admin not initialized');

        // 1. Lấy đơn hàng active
        // Chỉ lấy COMPLETED nếu mới cập nhật trong 10 phút gần nhất để tránh kẹt màn hình KTV
        const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        
        const { data: booking, error: bError } = await supabase
            .from('Bookings')
            .select('*')
            .eq('technicianCode', technicianCode)
            .or(`status.in.(PREPARING,IN_PROGRESS,DONE),and(status.eq.COMPLETED,updatedAt.gte.${tenMinsAgo})`)
            .order('createdAt', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (bError) throw bError;
        if (!booking) return NextResponse.json({ success: true, data: null });

        // 2. Lấy BookingItems
        const { data: items, error: iError } = await supabase
            .from('BookingItems')
            .select('*')
            .eq('bookingId', booking.id);

        if (iError) console.error('Error fetching booking items:', iError);

        // 3. Lấy chi tiết dịch vụ
        let itemsWithService = items || [];
        if (items && items.length > 0) {
            // Lấy tất cả dịch vụ để map (hiệu quả hơn query phức tạp với 100+ bản ghi)
            const { data: svcs, error: svcError } = await supabase
                .from('Services')
                .select('id, code, nameVN, nameEN, duration, focusConfig, description')
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
                    service_description: getI18nStr(svc?.description, ''),
                    focusConfig: svc?.focusConfig || null,
                    duration: i.duration || svc?.duration || (sId.includes('nhs0000') ? 1 : 60),
                    customerNote: customerNote,
                    noteForKtv: noteForKtv,
                    focus: focusAreas,
                    avoid: avoidAreas,
                    strength: strength,
                    therapistGender: therapistGender
                };
                
                if (!svc) {
                    console.warn(`⚠️ [KTV API] Service NOT FOUND for i.serviceId: "${i.serviceId}". rawSId: "${rawSId}"`);
                }
                
                return item;
            });
        }

        return NextResponse.json({
            success: true,
            data: {
                ...booking,
                dispatcherNote: booking.notes || '',
                BookingItems: itemsWithService
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
        const body = await request.json();
        const { bookingId, status, action } = body;

        if (!bookingId || !status) {
            return NextResponse.json({ success: false, error: 'bookingId and status are required' }, { status: 400 });
        }

        const supabase = getSupabaseAdmin();
        if (!supabase) throw new Error('Supabase admin not initialized');

        const updatePayload: any = { status, updatedAt: new Date().toISOString() };
        
        if (status === 'IN_PROGRESS') {
            updatePayload.timeStart = new Date().toISOString();
        } else if (status === 'DONE' || status === 'COMPLETED') {
            updatePayload.timeEnd = new Date().toISOString();
        }

        if (action === 'EARLY_EXIT') {
            updatePayload.notes = 'Khách về sớm';
        }

        const { data, error } = await supabase
            .from('Bookings')
            .update(updatePayload)
            .eq('id', bookingId)
            .select()
            .single();

        if (error) throw error;

        // Logic giải phóng KTV chỉ khi THỰC SỰ XONG (COMPLETED)
        if (status === 'COMPLETED') {
            const { data: queueItems } = await supabase
                .from('TurnQueue')
                .select('*')
                .eq('current_order_id', bookingId);

            if (queueItems && queueItems.length > 0) {
                const today = new Date().toISOString().split('T')[0];
                const { data: allActiveTurns } = await supabase.from('TurnQueue').select('queue_position').eq('date', today);
                let maxPos = 0;
                allActiveTurns?.forEach(t => { if (t.queue_position > maxPos) maxPos = t.queue_position; });

                for (const item of queueItems) {
                    const newTurns = (item.turns_completed || 0) + 1;
                    const newPos = ++maxPos;
                    await supabase.from('TurnQueue').update({
                        status: 'waiting',
                        current_order_id: null,
                        turns_completed: newTurns,
                        queue_position: newPos
                    }).eq('id', item.id);
                }
            }
        }

        return NextResponse.json({ success: true, data });
    } catch (error: any) {
        console.error('API Error (PATCH /api/ktv/booking):', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
