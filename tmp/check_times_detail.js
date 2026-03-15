const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://adzfohfdindovfcpaizb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkemZvaGZkaW5kb3ZmY3BhaXpiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTY3OTgwMCwiZXhwIjoyMDg3MjU1ODAwfQ.wGaNWPGK8fLF5GMzbiGTApVnktdtaegQkquTMOGPyl8';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkBookingsTimesDetail() {
    console.log('--- BOOKINGS TIME DETAIL ---');
    try {
        const { data, error } = await supabase
            .from('Bookings')
            .select('id, billCode, bookingDate, timeBooking, timeStart, timeEnd, createdAt, status')
            .order('createdAt', { ascending: false })
            .limit(10);
        if (error) throw error;
        
        data.forEach(b => {
            console.log(`Bill: ${b.billCode}, bookingDate: ${b.bookingDate}, timeBooking: ${b.timeBooking}, Start: ${b.timeStart}, End: ${b.timeEnd}`);
        });
    } catch (err) {
        console.error(err);
    }
}

checkBookingsTimesDetail();
