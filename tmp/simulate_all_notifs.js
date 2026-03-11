const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://adzfohfdindovfcpaizb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkemZvaGZkaW5kb3ZmY3BhaXpiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTY3OTgwMCwiZXhwIjoyMDg3MjU1ODAwfQ.wGaNWPGK8fLF5GMzbiGTApVnktdtaegQkquTMOGPyl8';
const supabase = createClient(supabaseUrl, supabaseKey);

async function simulateNotifications() {
    const types = ['EARLY_EXIT', 'WATER', 'BUY_MORE', 'EMERGENCY', 'SUPPORT'];
    const bookingId = '01-01022026';
    
    console.log('Inserting multiple notification types for verification...');
    
    for (const type of types) {
        const { error } = await supabase.from('StaffNotifications').insert({
            bookingId,
            type,
            message: `Test notification for ${type}`,
            isRead: false
        });
        if (error) console.error(`Failed to insert ${type}:`, error);
        else console.log(`Inserted ${type}`);
    }
}

simulateNotifications();
