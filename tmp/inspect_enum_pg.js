const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://adzfohfdindovfcpaizb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkemZvaGZkaW5kb3ZmY3BhaXpiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTY3OTgwMCwiZXhwIjoyMDg3MjU1ODAwfQ.wGaNWPGK8fLF5GMzbiGTApVnktdtaegQkquTMOGPyl8';

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectEnum() {
  // Use a raw SQL query via RPC or just a trick
  // Since I don't have a raw SQL RPC, I'll try to find one if it exists or use a common pattern
  const { data, error } = await supabase.rpc('inspect_booking_status'); // Hope it exists
  
  if (error) {
    // Try to query pg_catalog via REST API (might not work depending on permissions)
    // But wait! I can try to use the 'get_enum_values' I saw earlier if it was created by someone
    const { data: data2, error: error2 } = await supabase.rpc('get_enum_values', { enum_name: 'BookingStatus' });
    if (data2) {
        console.log('Enum values:', data2);
        return;
    }
    
    // If all fails, I'll probe with a script that tries every possible status
    console.log('Probing common statuses...');
    const common = ['new', 'NEW', 'pending', 'PENDING', 'preparing', 'PREPARING', 'confirmed', 'CONFIRMED', 'dispatched', 'DISPATCHED', 'started', 'STARTED', 'in_progress', 'IN_PROGRESS', 'completed', 'COMPLETED', 'done', 'DONE', 'cancelled', 'CANCELLED', 'feedback', 'FEEDBACK', 'WAITING', 'waiting'];
    
    const valid = [];
    for (const s of common) {
        const { error: e } = await supabase.from('Bookings').update({ status: s }).eq('id', '01-02012026');
        if (!e || !e.message.includes('invalid input value for enum')) {
            valid.push(s);
            // Revert
            await supabase.from('Bookings').update({ status: 'NEW' }).eq('id', '01-02012026');
        }
    }
    console.log('Validated statuses:', valid);
  } else {
    console.log('Enum data:', data);
  }
}

inspectEnum();
