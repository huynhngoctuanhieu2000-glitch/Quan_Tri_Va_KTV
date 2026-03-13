const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://adzfohfdindovfcpaizb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkemZvaGZkaW5kb3ZmY3BhaXpiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTY3OTgwMCwiZXhwIjoyMDg3MjU1ODAwfQ.wGaNWPGK8fLF5GMzbiGTApVnktdtaegQkquTMOGPyl8';

const supabase = createClient(supabaseUrl, supabaseKey);

async function probe() {
  const realId = '01-02012026';
  const originalStatus = 'NEW';
  
  const statuses = [
    'NEW', 'PREPARING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'DONE', 'CANCELLED', 'FEEDBACK'
  ];
  
  console.log(`Testing statuses on real ID: ${realId}...`);
  
  for (const s of statuses) {
    const { error } = await supabase
      .from('Bookings')
      .update({ status: s })
      .eq('id', realId);
      
    if (error) {
      console.log(`❌ ${s}: ${error.message}`);
    } else {
      console.log(`✅ ${s} is VALID`);
      // Revert immediately
      await supabase.from('Bookings').update({ status: originalStatus }).eq('id', realId);
    }
  }
}

probe();
