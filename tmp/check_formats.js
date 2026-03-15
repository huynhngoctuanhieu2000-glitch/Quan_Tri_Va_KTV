const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://adzfohfdindovfcpaizb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkemZvaGZkaW5kb3ZmY3BhaXpiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTY3OTgwMCwiZXhwIjoyMDg3MjU1ODAwfQ.wGaNWPGK8fLF5GMzbiGTApVnktdtaegQkquTMOGPyl8';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTimeBookingFormats() {
    console.log('--- timeBooking FORMATS ---');
    try {
        const { data, error } = await supabase
            .from('Bookings')
            .select('id, billCode, timeBooking')
            .not('timeBooking', 'is', null);
        if (error) throw error;
        
        data.forEach(b => {
            console.log(`Bill: ${b.billCode}, timeBooking: "${b.timeBooking}"`);
        });
    } catch (err) {
        console.error(err);
    }
}

checkTimeBookingFormats();
