import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // Using service role to bypass RLS

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkBooking(bookingId: string) {
    console.log(`🔍 Investigating Booking: ${bookingId}`);

    // 1. Fetch Booking
    const { data: booking, error: bErr } = await supabase
        .from('Bookings')
        .select('*')
        .eq('id', bookingId)
        .single();

    if (bErr) {
        console.error('❌ Error fetching booking:', bErr);
        return;
    }
    console.log('--- Booking Info ---');
    console.log(`Status: ${booking.status}`);
    console.log(`Created At: ${booking.createdAt}`);
    console.log(`Time Start: ${booking.timeStart}`);
    console.log(`Time End: ${booking.timeEnd}`);

    // 2. Fetch BookingItems
    const { data: items, error: iErr } = await supabase
        .from('BookingItems')
        .select('*')
        .eq('bookingId', bookingId);

    if (iErr) {
        console.error('❌ Error fetching items:', iErr);
    } else {
        console.log('\n--- Booking Items ---');
        items.forEach((item, idx) => {
            console.log(`Item ${idx + 1}: ${item.serviceName} | ID: ${item.id}`);
            console.log(`  Status: ${item.status}`);
            console.log(`  KTVs: ${JSON.stringify(item.technicianCodes)}`);
            try {
                const segs = typeof item.segments === 'string' ? JSON.parse(item.segments) : item.segments;
                console.log(`  Segments: ${JSON.stringify(segs)}`);
            } catch (e) {
                console.log(`  Segments (raw): ${item.segments}`);
            }
        });
    }

    // 3. Check TurnQueue
    const { data: turns, error: tErr } = await supabase
        .from('TurnQueue')
        .select('*')
        .eq('current_order_id', bookingId);

    if (tErr) {
        console.error('❌ Error fetching TurnQueue:', tErr);
    } else {
        console.log('\n--- TurnQueue (KTV assignments) ---');
        if (turns.length === 0) {
            console.log('No KTVs currently assigned in TurnQueue for this booking.');
        } else {
            turns.forEach(t => {
                console.log(`KTV: ${t.employee_id} | Status: ${t.status} | Items: ${JSON.stringify(t.booking_item_ids)}`);
            });
        }
    }
}

const bookingId = '934cd136-b04b-40a4-bbd9-4d20be033702';
checkBooking(bookingId);
