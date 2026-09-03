import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { syncTurnsForDate } from '@/lib/turn-sync';
import { z } from 'zod';

const finishEarlySchema = z.object({
    bookingId: z.string().min(1, 'Thiếu bookingId'),
    itemIds: z.array(z.string()).min(1, 'Thiếu itemIds')
});

export async function POST(req: Request) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    try {
        const body = await req.json();
        const parsedData = finishEarlySchema.safeParse(body);
        if (!parsedData.success) {
            return NextResponse.json({ 
                success: false, 
                error: parsedData.error.issues?.[0]?.message || parsedData.error.message || 'Dữ liệu không hợp lệ' 
            }, { status: 400 });
        }

        const { bookingId, itemIds } = parsedData.data;

        // Lấy thông tin các items
        const { data: items, error: itemsError } = await supabase
            .from('BookingItems')
            .select('*')
            .in('id', itemIds)
            .eq('bookingId', bookingId);

        if (itemsError || !items || items.length === 0) {
            return NextResponse.json({ success: false, error: 'Không tìm thấy BookingItems' }, { status: 404 });
        }

        const businessDateObj = new Date();
        const businessDate = `${businessDateObj.getFullYear()}-${String(businessDateObj.getMonth() + 1).padStart(2, '0')}-${String(businessDateObj.getDate()).padStart(2, '0')}`;

        for (const item of items) {
            let parsedSegments = item.segments;
            let isSegString = typeof parsedSegments === 'string';
            if (isSegString) {
                try {
                    parsedSegments = JSON.parse(parsedSegments);
                } catch {
                    parsedSegments = [];
                }
            }
            let segments = Array.isArray(parsedSegments) ? [...parsedSegments] : [];

            // Duyệt segments, với mỗi segment có actualStartTime và chưa có actualEndTime: chốt
            const pauseTime = item.pauseStart || new Date().toISOString();

            for (const seg of segments) {
                if (seg.actualStartTime && !seg.actualEndTime) {
                    seg.endTime = pauseTime;
                    seg.actualEndTime = pauseTime;
                    const pauseTimeMs = new Date(pauseTime).getTime();
                    const oldStartMs = new Date(seg.actualStartTime).getTime();
                    const oldWorkedMins = Math.max(0, Math.round((pauseTimeMs - oldStartMs) / 60000));
                    
                    seg.customCommissionDuration = oldWorkedMins;
                    seg.note = 'FINISHED_EARLY_ON_PAUSE';
                }
            }

            const { error: errUpdate } = await supabase
                .from('BookingItems')
                .update({
                    status: 'CLEANING',
                    segments: isSegString ? JSON.stringify(segments) as any : segments
                })
                .eq('id', item.id);
                
            if (errUpdate) {
                console.error('Error updating item on finish-early-paused:', errUpdate);
            }
        }

        // Cập nhật trạng thái của KTV trong TurnQueue xuống status waiting nếu cần?
        // Let's release the KTVs from working state to waiting.
        const allKtvIds = new Set<string>();
        for (const item of items) {
            if (Array.isArray(item.technicianCodes)) {
                item.technicianCodes.forEach((k: string) => allKtvIds.add(k));
            }
        }
        
        if (allKtvIds.size > 0) {
            await supabase
                .from('TurnQueue')
                .update({ status: 'waiting', current_order_id: null, booking_item_id: null, booking_item_ids: [] })
                .in('employee_id', Array.from(allKtvIds))
                .eq('date', businessDate);
        }

        await syncTurnsForDate(businessDate);

        return NextResponse.json({ success: true });
    } catch (err: any) {
        console.error('Error in finish-early-paused API:', err);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
