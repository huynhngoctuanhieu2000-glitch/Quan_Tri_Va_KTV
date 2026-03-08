const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://adzfohfdindovfcpaizb.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkemZvaGZkaW5kb3ZmY3BhaXpiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTY3OTgwMCwiZXhwIjoyMDg3MjU1ODAwfQ.wGaNWPGK8fLF5GMzbiGTApVnktdtaegQkquTMOGPyl8';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkActualData() {
    // Tìm đơn hàng mới nhất đang PREPARING hoặc IN_PROGRESS
    const { data: bookings, error } = await supabase
        .from('Bookings')
        .select('*')
        .in('status', ['PREPARING', 'IN_PROGRESS'])
        .order('updatedAt', { ascending: false })
        .limit(1);

    if (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }

    if (bookings && bookings.length > 0) {
        const b = bookings[0];
        console.log('--- Booking Data ---');
        console.log('ID:', b.id);
        console.log('Notes:', b.notes);
        console.log('FocusAreaNote:', b.focusAreaNote);
        
        // Lấy serviceId từ BookingItems
        const { data: items } = await supabase
            .from('BookingItems')
            .select('*')
            .eq('bookingId', b.id);
            
        if (items && items.length > 0) {
            console.log('\n--- Service Data ---');
            const { data: svc } = await supabase
                .from('Services')
                .select('id, nameVN, focusConfig')
                .eq('id', items[0].serviceId)
                .single();
            
            console.log('Service Name:', svc?.nameVN);
            console.log('focusConfig:', svc?.focusConfig);
        }
    } else {
        console.log('No active bookings found for testing.');
    }
    
    process.exit(0);
}

checkActualData();
