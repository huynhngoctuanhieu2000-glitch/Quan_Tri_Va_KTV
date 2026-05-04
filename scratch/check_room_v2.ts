import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkRoom(roomId: string, bedId: string) {
    console.log(`🔍 Checking Room: ${roomId}, Bed: ${bedId}`);

    const today = new Date(new Date().getTime() + 7 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Check Bookings
    const { data: bookings, error } = await supabase
        .from('Bookings')
        .select('id, billCode, status, roomName, bedId, technicianCode')
        .eq('roomName', roomId)
        .in('status', ['PREPARING', 'IN_PROGRESS', 'CLEANING', 'FEEDBACK']);

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log(`Found ${bookings.length} active bookings in room ${roomId}`);
    bookings.forEach(b => {
        console.log(`- Bill: ${b.billCode} | Status: ${b.status} | Bed: ${b.bedId} | KTV: ${b.technicianCode}`);
    });

    // Check BookingItems specifically for that bed
    const { data: items } = await supabase
        .from('BookingItems')
        .select('id, bookingId, status, segments, technicianCodes')
        .in('status', ['PREPARING', 'IN_PROGRESS', 'CLEANING', 'FEEDBACK']);
    
    const relevantItems = items?.filter(item => {
        let segs = [];
        try { segs = typeof item.segments === 'string' ? JSON.parse(item.segments) : item.segments; } catch {}
        return segs?.some((s: any) => s.roomId === roomId && (s.bedId === bedId || s.bedId === `${roomId}-${bedId.split('G').pop()}`));
    });

    if (relevantItems && relevantItems.length > 0) {
        console.log(`\nRelevant BookingItems for Bed ${bedId}:`);
        relevantItems.forEach(i => {
            console.log(`- ItemID: ${i.id} | BookingID: ${i.bookingId} | Status: ${i.status} | KTVs: ${i.technicianCodes}`);
        });
    } else {
        console.log(`No specific BookingItems found for Bed ${bedId}`);
    }
}

// "V2 G1" -> Room V2, Bed 1. Bed ID might be V2-1
checkRoom('V2', 'V2-1');
