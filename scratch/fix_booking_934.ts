import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixBooking(bookingId: string) {
    console.log(`🔧 Fixing Booking Data: ${bookingId}`);

    const { data: items, error: iErr } = await supabase
        .from('BookingItems')
        .select('*')
        .eq('bookingId', bookingId);

    if (iErr) {
        console.error('❌ Error fetching items:', iErr);
        return;
    }

    for (const item of items) {
        let segs = [];
        try {
            segs = typeof item.segments === 'string' ? JSON.parse(item.segments) : (item.segments || []);
        } catch { segs = []; }

        let modified = false;
        segs.forEach((s: any) => {
            if (!s.actualEndTime) {
                console.log(`  Fixing actualEndTime for item ${item.id}, segment ${s.id}`);
                s.actualEndTime = new Date().toISOString();
                modified = true;
            }
        });

        if (modified) {
            const { error: uErr } = await supabase
                .from('BookingItems')
                .update({ segments: JSON.stringify(segs), updatedAt: new Date().toISOString() })
                .eq('id', item.id);
            
            if (uErr) console.error(`  ❌ Error updating item ${item.id}:`, uErr);
            else console.log(`  ✅ Item ${item.id} fixed.`);
        } else {
            console.log(`  ℹ️ Item ${item.id} already has actualEndTime.`);
        }
    }
    
    console.log('Done.');
}

const bookingId = '934cd136-b04b-40a4-bbd9-4d20be033702';
fixBooking(bookingId);
