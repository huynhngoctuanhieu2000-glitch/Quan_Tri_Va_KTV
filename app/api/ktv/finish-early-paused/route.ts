import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { syncTurnsForDate } from '@/lib/turn-sync';
import { recomputeBookingStatus } from '@/lib/dispatch-status';

export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => ({}));
        const bookingId = body.bookingId;
        const itemIds = body.itemIds || [];
        
        if (!bookingId || !Array.isArray(itemIds) || itemIds.length === 0) {
            return NextResponse.json({ success: false, error: 'Thiếu thông tin đơn hàng (bookingId hoặc itemIds)' }, { status: 400 });
        }

        // 1. Get the items to process
        const { data: itemsToProcess } = await supabase
            .from('BookingItems')
            .select('*')
            .in('id', itemIds);

        if (!itemsToProcess || itemsToProcess.length === 0) {
            return NextResponse.json({ success: false, error: 'Không tìm thấy dịch vụ' }, { status: 404 });
        }

        let updatedAny = false;

        for (const it of itemsToProcess) {
            if (it.status !== 'PAUSED') {
                continue; // Skip items that are not paused
            }

            const effectivePauseStart = it.pauseStart || new Date().toISOString();

            let segs = it.segments;
            if (typeof segs === 'string') {
                try { segs = JSON.parse(segs); } catch { segs = []; }
            }
            if (Array.isArray(segs)) {
                let segmentsUpdated = false;
                for (let seg of segs) {
                    if (seg.actualStartTime && !seg.actualEndTime) {
                        seg.actualEndTime = effectivePauseStart;
                        // Calculate duration in mins
                        const startMs = new Date(seg.actualStartTime).getTime();
                        const endMs = new Date(effectivePauseStart).getTime();
                        let customDuration = Math.round((endMs - startMs) / 60000);
                        if (customDuration < 0) customDuration = 0;
                        seg.customCommissionDuration = customDuration;
                        seg.note = 'FINISHED_EARLY_ON_PAUSE';
                        segmentsUpdated = true;
                    }
                }
                
                await supabase.from('BookingItems').update({ 
                    segments: JSON.stringify(segs),
                    status: 'CLEANING',
                    timeEnd: new Date().toISOString()
                }).eq('id', it.id);
                updatedAny = true;
            } else {
                await supabase.from('BookingItems').update({ 
                    status: 'CLEANING',
                    timeEnd: new Date().toISOString()
                }).eq('id', it.id);
                updatedAny = true;
            }
        }

        if (updatedAny) {
            // Recompute booking status for both parent and children
            const { data: booking } = await supabase.from('Bookings').select('date, parentBookingId').eq('id', bookingId).single();
            const parentId = booking?.parentBookingId || bookingId;
            
            const { data: childBookings } = await supabase.from('Bookings').select('id').eq('parentBookingId', parentId);
            const allBookingIds = [parentId, ...(childBookings?.map(b => b.id) || [])];

            const { data: allBookingItems } = await supabase.from('BookingItems').select('status').in('bookingId', allBookingIds);
            
            if (allBookingItems) {
                const statuses = allBookingItems.map(i => i.status);
                let bStatus = recomputeBookingStatus(statuses);
                if (bStatus === 'DONE') {
                    bStatus = 'CLEANING'; // because we just set items to CLEANING
                }
                await supabase.from('Bookings').update({ status: bStatus }).in('id', allBookingIds);
            }

            if (booking && booking.date) {
                await syncTurnsForDate(booking.date);
            }
        }

        return NextResponse.json({ success: true, data: { itemIdsFinished: itemIds } });
    } catch (e: any) {
        console.error('finish-early-paused error:', e);
        return NextResponse.json({ success: false, error: e.message || 'Server error' }, { status: 500 });
    }
}
