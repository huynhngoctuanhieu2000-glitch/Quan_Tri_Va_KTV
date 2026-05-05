const fs = require('fs');
const envStr = fs.readFileSync('.env.local', 'utf8');
const env = {};
envStr.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) env[match[1]] = match[2].replace(/['"]/g, '').trim();
});

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

function recomputeBookingStatus(itemStatuses) {
    if (!itemStatuses || itemStatuses.length === 0) return 'NEW';
    const hasWaitingItems = itemStatuses.some(s => ['PREPARING', 'WAITING', 'NEW'].includes(s));
    const hasProgressedItems = itemStatuses.some(s => ['IN_PROGRESS', 'COMPLETED', 'DONE', 'CANCELLED', 'FEEDBACK', 'CLEANING'].includes(s));
    
    if (itemStatuses.includes('IN_PROGRESS')) return 'IN_PROGRESS';
    if (hasWaitingItems && hasProgressedItems) return 'IN_PROGRESS';
    if (itemStatuses.some(s => ['CLEANING', 'COMPLETED'].includes(s))) return 'CLEANING';
    if (itemStatuses.includes('FEEDBACK')) return 'FEEDBACK';
    if (itemStatuses.every(s => ['DONE', 'CANCELLED'].includes(s))) return 'DONE';
    if (itemStatuses.includes('PREPARING')) return 'PREPARING';
    if (itemStatuses.includes('WAITING') || itemStatuses.includes('NEW')) return 'NEW';
    return 'NEW';
}

async function fixStuckBookings() {
    console.log('Starting sync...');
    const { data: bookings, error: err } = await supabase.from('Bookings').select('id, status, billCode').in('status', ['DONE', 'IN_PROGRESS', 'PREPARING']);
    if (err) {
        console.error('Error fetching bookings:', err);
        return;
    }
    console.log('Found', bookings?.length || 0, 'bookings to check');
    let fixed = 0;
    for (const b of bookings || []) {
        const { data: items } = await supabase.from('BookingItems').select('status, Services!BookingItems_serviceId_fkey(nameVN)').eq('bookingId', b.id);
        if (!items) continue;
        
        const validItems = items.filter(i => {
            const name = i.Services?.nameVN || '';
            return !name.toLowerCase().includes('phòng riêng');
        });
        const finalItems = validItems.length > 0 ? validItems : items;
        
        const newStatus = recomputeBookingStatus(finalItems.map(i => i.status));
        if (newStatus !== b.status) {
            console.log('Fixing', b.billCode, 'from', b.status, 'to', newStatus);
            await supabase.from('Bookings').update({ status: newStatus }).eq('id', b.id);
            fixed++;
        }
    }
    console.log('Fixed', fixed, 'bookings. Done!');
}
fixStuckBookings();
