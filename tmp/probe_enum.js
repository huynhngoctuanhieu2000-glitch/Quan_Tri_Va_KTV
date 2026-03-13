const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://adzfohfdindovfcpaizb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkemZvaGZkaW5kb3ZmY3BhaXpiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTY3OTgwMCwiZXhwIjoyMDg3MjU1ODAwfQ.wGaNWPGK8fLF5GMzbiGTApVnktdtaegQkquTMOGPyl8';

const supabase = createClient(supabaseUrl, supabaseKey);

async function probe() {
  const statuses = [
    'new', 'preparing', 'confirmed', 'in_progress', 'completed', 'done', 'cancelled', 'feedback',
    'NEW', 'PREPARING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'DONE', 'CANCELLED', 'FEEDBACK'
  ];
  
  console.log('Testing statuses...');
  const results = [];
  
  for (const s of statuses) {
    try {
      const { error } = await supabase
        .from('Bookings')
        .update({ status: s })
        .eq('id', 'non-existent-uuid-to-avoid-actual-update');
        
      if (error && error.message.includes('invalid input value for enum')) {
        // console.log(`❌ ${s}`);
      } else {
        console.log(`✅ Valid: ${s}`);
        results.push(s);
      }
    } catch (e) {
      // ignore
    }
  }
  
  console.log('\nAll Valid Statuses:', results);
}

probe();
