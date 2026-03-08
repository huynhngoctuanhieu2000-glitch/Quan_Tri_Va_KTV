const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://adzfohfdindovfcpaizb.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkemZvaGZkaW5kb3ZmY3BhaXpiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTY3OTgwMCwiZXhwIjoyMDg3MjU1ODAwfQ.wGaNWPGK8fLF5GMzbiGTApVnktdtaegQkquTMOGPyl8';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function debugData() {
    console.log('--- 1. Checking ALL Recent Bookings ---');
    const { data: bookings } = await supabase.from('Bookings').select('*').order('createdAt', { ascending: false }).limit(5);
    console.log(JSON.stringify(bookings, null, 2));

    if (bookings && bookings.length > 0) {
        const bId = bookings[0].id;
        console.log(`\n--- 2. Checking Items for Booking ID: ${bId} ---`);
        const { data: items } = await supabase.from('BookingItems').select('*').eq('bookingId', bId);
        console.log(JSON.stringify(items, null, 2));

        if (items && items.length > 0) {
            const sId = items[0].serviceId;
            console.log(`\n--- 3. Searching for Service with ID or Code: ${sId} ---`);
            const { data: svc } = await supabase.from('Services').select('*').or(`id.eq.${sId},code.eq.${sId}`);
            console.log(JSON.stringify(svc, null, 2));
        }
    }
    process.exit(0);
}

debugData();
