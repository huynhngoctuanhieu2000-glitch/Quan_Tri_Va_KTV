import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanupBed(roomId: string, bedId: string) {
    console.log(`🧹 Cleaning up stuck bookings for Room: ${roomId}, Bed: ${bedId}`);

    // 1. Find all FEEDBACK bookings on this bed
    const { data: stuckBookings, error } = await supabase
        .from('Bookings')
        .select('id, billCode, status')
        .eq('roomName', roomId)
        .eq('bedId', bedId)
        .eq('status', 'FEEDBACK');

    if (error) {
        console.error('Error fetching bookings:', error);
        return;
    }

    if (!stuckBookings || stuckBookings.length === 0) {
        console.log('No stuck FEEDBACK bookings found on this bed.');
    } else {
        console.log(`Found ${stuckBookings.length} stuck bookings. Moving to DONE...`);
        
        for (const b of stuckBookings) {
            console.log(`- Processing Bill: ${b.billCode} (ID: ${b.id})`);
            
            // Update BookingItems first
            const { data: items } = await supabase
                .from('BookingItems')
                .select('id, segments, status')
                .eq('bookingId', b.id);
            
            for (const item of items || []) {
                let segs = [];
                try { 
                    segs = typeof item.segments === 'string' ? JSON.parse(item.segments) : (Array.isArray(item.segments) ? item.segments : []); 
                } catch { segs = []; }

                let modified = false;
                segs.forEach((s: any) => {
                    if (!s.actualEndTime) {
                        s.actualEndTime = new Date().toISOString();
                        modified = true;
                    }
                    if (!s.feedbackTime) {
                        s.feedbackTime = new Date().toISOString();
                        modified = true;
                    }
                });

                const itemPayload: any = { status: 'DONE' };
                if (modified) itemPayload.segments = JSON.stringify(segs);

                await supabase.from('BookingItems').update(itemPayload).eq('id', item.id);
            }

            // Update Booking
            await supabase.from('Bookings').update({ 
                status: 'DONE', 
                updatedAt: new Date().toISOString() 
            }).eq('id', b.id);
            
            console.log(`  Done: ${b.billCode}`);
        }
    }

    console.log('\nCleanup complete.');
}

cleanupBed('V2', 'V2-1');
