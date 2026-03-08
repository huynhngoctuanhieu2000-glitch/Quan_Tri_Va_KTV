const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://adzfohfdindovfcpaizb.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkemZvaGZkaW5kb3ZmY3BhaXpiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTY3OTgwMCwiZXhwIjoyMDg3MjU1ODAwfQ.wGaNWPGK8fLF5GMzbiGTApVnktdtaegQkquTMOGPyl8';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function debugBooking() {
    const billCode = '007-07032026';
    const { data: bookings } = await supabase.from('Bookings').select('*').ilike('billCode', `%${billCode}%`);
    
    if (!bookings || bookings.length === 0) {
        console.log('Booking not found');
        process.exit(0);
    }
    
    const b = bookings[0];
    console.log('Booking:', JSON.stringify(b, null, 2));
    
    const { data: items } = await supabase.from('BookingItems').select('*').eq('bookingId', b.id);
    console.log('Items:', JSON.stringify(items, null, 2));
    
    if (items && items.length > 0) {
        const svcIds = items.map(i => i.serviceId);
        const { data: svcs } = await supabase.from('Services').select('*').in('id', svcIds);
        console.log('Services:', JSON.stringify(svcs, null, 2));
    }
    
    process.exit(0);
}

debugBooking();
