const { createClient } = require('@supabase/supabase-client');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkBookingItems() {
    const { data: bookings, error: bError } = await supabase
        .from('Bookings')
        .select('id, billCode, status')
        .order('createdAt', { ascending: false })
        .limit(5);

    if (bError) {
        console.error('Error fetching bookings:', bError);
        return;
    }

    for (const b of bookings) {
        console.log(`\nBooking: ${b.billCode} (ID: ${b.id}, Status: ${b.status})`);
        const { data: items, error: iError } = await supabase
            .from('BookingItems')
            .select('*')
            .eq('bookingId', b.id);
        
        if (iError) {
            console.error(`Error fetching items for ${b.id}:`, iError);
            continue;
        }

        items.forEach(item => {
            console.log(` - Item: ${item.serviceId}, Duration: ${item.duration}, Options: ${JSON.stringify(item.options)}`);
        });
    }
}

checkBookingItems();
