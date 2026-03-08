const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://adzfohfdindovfcpaizb.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkemZvaGZkaW5kb3ZmY3BhaXpiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTY3OTgwMCwiZXhwIjoyMDg3MjU1ODAwfQ.wGaNWPGK8fLF5GMzbiGTApVnktdtaegQkquTMOGPyl8';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function inspectBooking() {
    const billCode = '011-07032026';
    console.log(`--- Inspecting Booking: ${billCode} ---`);
    const { data: b } = await supabase.from('Bookings').select('*').eq('billCode', billCode).single();
    
    if (b) {
        console.log('Booking Data:', JSON.stringify(b, null, 2));
        
        const { data: items } = await supabase.from('BookingItems').select('*').eq('bookingId', b.id);
        console.log('BookingItems:', JSON.stringify(items, null, 2));
    } else {
        console.log('Booking not found');
    }
    process.exit(0);
}

inspectBooking();
