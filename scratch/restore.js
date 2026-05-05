const fs = require('fs');
const envStr = fs.readFileSync('.env.local', 'utf8');
const env = {};
envStr.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) env[match[1]] = match[2].replace(/['"]/g, '').trim();
});

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function restoreStuckBookings() {
    console.log('Starting restore...');
    const { data: bookings, error: err } = await supabase.from('Bookings')
        .select('id, status, billCode, createdAt')
        .eq('status', 'NEW')
        .lt('createdAt', '2026-05-01');
        
    if (err) {
        console.error('Error fetching bookings:', err);
        return;
    }
    console.log('Found', bookings?.length || 0, 'bookings to restore');
    let fixed = 0;
    for (const b of bookings || []) {
        console.log('Restoring', b.billCode, 'from', b.status, 'to DONE');
        await supabase.from('Bookings').update({ status: 'DONE' }).eq('id', b.id);
        fixed++;
    }
    console.log('Fixed', fixed, 'bookings. Done!');
}
restoreStuckBookings();
