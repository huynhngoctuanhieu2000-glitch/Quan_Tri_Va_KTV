const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://adzfohfdindovfcpaizb.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkemZvaGZkaW5kb3ZmY3BhaXpiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTY3OTgwMCwiZXhwIjoyMDg3MjU1ODAwfQ.wGaNWPGK8fLF5GMzbiGTApVnktdtaegQkquTMOGPyl8';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function simulateDispatch() {
    const bookingId = '11NDK-011-07032026';
    console.log(`--- Simulating Dispatch for ${bookingId} ---`);
    
    // 1. Update Booking Notes (Dispatcher Note)
    const { error: bErr } = await supabase
        .from('Bookings')
        .update({ notes: 'ĐIỀU PHỐI: Khách rất kỹ tính, cần KTV tay nghề cao và nhẹ nhàng.' })
        .eq('id', bookingId);
        
    if (bErr) console.error('Booking Error:', bErr);

    // 2. Update BookingItem Options (Note for KTV)
    const { data: item } = await supabase.from('BookingItems').select('*').eq('bookingId', bookingId).single();
    if (item) {
        const newOptions = {
            ...item.options,
            noteForKtv: 'KTV LƯU Ý: Khách bị đau vai trái, nhấn mạnh vùng này nhé.'
        };
        const { error: iErr } = await supabase
            .from('BookingItems')
            .update({ options: newOptions })
            .eq('id', item.id);
        if (iErr) console.error('Item Error:', iErr);
    }

    console.log('Simulated dispatch successful');
    process.exit(0);
}

simulateDispatch();
