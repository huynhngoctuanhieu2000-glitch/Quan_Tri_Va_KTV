const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
    // Check if customerLang column exists by querying it
    const { data, error } = await sb
        .from('Bookings')
        .select('id, customerLang, status, customerName')
        .eq('id', '11NDK-007-21032026')
        .single();
    
    console.log('=== Booking 11NDK-007-21032026 ===');
    if (error) {
        console.log('ERROR:', error.message);
        if (error.message.includes('customerLang')) {
            console.log('\n>>> Column customerLang does NOT exist! Migration needs to be applied.');
        }
    } else {
        console.log(JSON.stringify(data, null, 2));
    }

    // Also check recent bookings for customerLang
    const { data: recent, error: err2 } = await sb
        .from('Bookings')
        .select('id, customerLang, status')
        .order('createdAt', { ascending: false })
        .limit(5);
    
    console.log('\n=== Last 5 Bookings ===');
    if (err2) console.log('ERROR:', err2.message);
    else console.log(JSON.stringify(recent, null, 2));
}

check();
