const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://adzfohfdindovfcpaizb.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkemZvaGZkaW5kb3ZmY3BhaXpiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTY3OTgwMCwiZXhwIjoyMDg3MjU1ODAwfQ.wGaNWPGK8fLF5GMzbiGTApVnktdtaegQkquTMOGPyl8';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function debugBooking() {
    const billCode = '007-07032026';
    const { data: bookings } = await supabase.from('Bookings').select('*').ilike('billCode', `%${billCode}%`);
    
    let result = { booking: bookings ? bookings[0] : null, items: [], services: [] };
    
    if (result.booking) {
        const { data: items } = await supabase.from('BookingItems').select('*').eq('bookingId', result.booking.id);
        result.items = items || [];
        
        if (result.items.length > 0) {
            const svcIds = result.items.map(i => i.serviceId);
            const { data: svcs } = await supabase.from('Services').select('*').in('id', svcIds);
            result.services = svcs || [];
        }
    }
    
    fs.writeFileSync('tmp/debug_booking_result.json', JSON.stringify(result, null, 2));
    console.log('Results written to tmp/debug_booking_result.json');
    process.exit(0);
}

debugBooking();
