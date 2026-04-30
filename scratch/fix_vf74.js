const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://adzfohfdindovfcpaizb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkemZvaGZkaW5kb3ZmY3BhaXpiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTY3OTgwMCwiZXhwIjoyMDg3MjU1ODAwfQ.wGaNWPGK8fLF5GMzbiGTApVnktdtaegQkquTMOGPyl8';

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixStuckBooking() {
    const bookingId = '46ea8ff8-e2f6-4a56-86e7-cedf30839e61';
    
    // 1. Fetch current items
    const { data: items } = await supabase
        .from('BookingItems')
        .select('id, segments')
        .eq('bookingId', bookingId);
        
    for (const item of items) {
        let segs = typeof item.segments === 'string' ? JSON.parse(item.segments) : item.segments;
        let changed = false;
        
        segs.forEach(s => {
            if (!s.actualEndTime) {
                s.actualEndTime = new Date().toISOString();
                changed = true;
            }
            if (!s.feedbackTime) {
                s.feedbackTime = new Date().toISOString();
                changed = true;
            }
        });
        
        if (changed) {
            await supabase.from('BookingItems')
                .update({ segments: JSON.stringify(segs), status: 'FEEDBACK' })
                .eq('id', item.id);
            console.log(`Updated item ${item.id}`);
        }
    }
    
    // 2. Update booking
    await supabase.from('Bookings')
        .update({ status: 'DONE', timeEnd: new Date().toISOString() })
        .eq('id', bookingId);
        
    console.log(`Booking ${bookingId} fixed!`);
}

fixStuckBooking();
