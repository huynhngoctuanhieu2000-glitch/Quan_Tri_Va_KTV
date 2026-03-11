const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://adzfohfdindovfcpaizb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkemZvaGZkaW5kb3ZmY3BhaXpiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTY3OTgwMCwiZXhwIjoyMDg3MjU1ODAwfQ.wGaNWPGK8fLF5GMzbiGTApVnktdtaegQkquTMOGPyl8';
const supabase = createClient(supabaseUrl, supabaseKey);

async function simulateComplaint() {
    const bookingId = '01-01022026';
    
    console.log('Inserting COMPLAINT notification for verification...');
    
    const { error } = await supabase.from('StaffNotifications').insert({
        bookingId,
        type: 'COMPLAINT',
        message: '🚨 TEST: Khách hàng đánh giá 1 sao (Màu đỏ)',
        isRead: false
    });
    
    if (error) console.error(`Failed to insert COMPLAINT:`, error);
    else console.log(`Inserted COMPLAINT successfully`);
}

simulateComplaint();
