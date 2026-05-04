import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanupBedV2_1_Hard() {
    console.log(`🚀 Hard cleaning Bed V2-1...`);

    const billCodesToClean = ['015-27042026', '007-04052026'];

    for (const code of billCodesToClean) {
        console.log(`- Cleaning Bill: ${code}`);
        
        const { data: booking } = await supabase.from('Bookings').select('id').eq('billCode', code).single();
        if (!booking) {
            console.log(`  Could not find booking with code ${code}`);
            continue;
        }

        // Update items to DONE
        const { data: items } = await supabase.from('BookingItems').select('id, segments').eq('bookingId', booking.id);
        for (const item of items || []) {
            let segs = [];
            try { segs = typeof item.segments === 'string' ? JSON.parse(item.segments) : item.segments; } catch {}
            segs?.forEach((s: any) => {
                if (!s.actualEndTime) s.actualEndTime = new Date().toISOString();
            });

            await supabase.from('BookingItems').update({
                status: 'DONE',
                segments: JSON.stringify(segs)
            }).eq('id', item.id);
        }

        // Update booking to DONE
        await supabase.from('Bookings').update({ status: 'DONE' }).eq('id', booking.id);
        console.log(`  -> Done: ${code}`);
    }

    console.log('\nHard cleanup complete.');
}

cleanupBedV2_1_Hard();
