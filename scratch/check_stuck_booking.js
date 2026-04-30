
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://adzfohfdindovfcpaizb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkemZvaGZkaW5kb3ZmY3BhaXpiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTY3OTgwMCwiZXhwIjoyMDg3MjU1ODAwfQ.wGaNWPGK8fLF5GMzbiGTApVnktdtaegQkquTMOGPyl8';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkBooking(id) {
    console.log(`🔍 Checking booking: ${id}`);
    
    const { data: b, error: bErr } = await supabase
        .from('Bookings')
        .select('id, status, billCode')
        .eq('id', id)
        .single();
    
    if (bErr) {
        console.error('Error fetching booking:', bErr);
        return;
    }
    
    console.log(`Status Booking: ${b.status} (Bill: ${b.billCode})`);
    
    const { data: items, error: iErr } = await supabase
        .from('BookingItems')
        .select('id, status, segments, technicianCodes')
        .eq('bookingId', id);
        
    if (iErr) {
        console.error('Error fetching items:', iErr);
        return;
    }
    
    items.forEach((item, idx) => {
        console.log(`Item ${idx+1} [${item.id}]: Status = ${item.status}`);
        console.log(`KTVs: ${JSON.stringify(item.technicianCodes)}`);
        const segs = typeof item.segments === 'string' ? JSON.parse(item.segments) : item.segments;
        segs.forEach(s => {
            console.log(`  - KTV ${s.ktvId}: Started at ${s.actualStartTime || 'N/A'}, Ended at ${s.actualEndTime || 'N/A'}, Feedback at ${s.feedbackTime || 'N/A'}`);
        });
    });

    const { data: turns } = await supabase
        .from('TurnQueue')
        .select('employee_id, status, current_order_id')
        .eq('current_order_id', id);
    
    console.log(`Turns in Queue: ${turns?.length || 0}`);
    turns?.forEach(t => {
        console.log(`  - KTV ${t.employee_id}: Status = ${t.status}`);
    });
}

checkBooking('46ea8ff8-e2f6-4a56-86e7-cedf30839e61');
