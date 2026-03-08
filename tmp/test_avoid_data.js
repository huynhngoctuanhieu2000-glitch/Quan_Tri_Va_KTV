const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://adzfohfdindovfcpaizb.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkemZvaGZkaW5kb3ZmY3BhaXpiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTY3OTgwMCwiZXhwIjoyMDg3MjU1ODAwfQ.wGaNWPGK8fLF5GMzbiGTApVnktdtaegQkquTMOGPyl8';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function updateTestData() {
    const bookingId = '11NDK-011-07032026';
    console.log(`--- Updating Avoid Data for ${bookingId} ---`);
    
    const { data: item } = await supabase.from('BookingItems').select('*').eq('bookingId', bookingId).single();
    if (item) {
        const newOptions = {
            ...item.options,
            therapist: 'Nữ',
            strength: 'Mạnh',
            focus: ['Cổ', 'Tay', 'Đùi', 'Bàn chân'],
            avoid: ['Đầu', 'Vai', 'Lưng', 'Bắp chân']
        };
        const { error: iErr } = await supabase
            .from('BookingItems')
            .update({ options: newOptions })
            .eq('id', item.id);
        if (iErr) console.error('Item Error:', iErr);
        else console.log('Successfully updated avoid areas in DB');
    }

    process.exit(0);
}

updateTestData();
