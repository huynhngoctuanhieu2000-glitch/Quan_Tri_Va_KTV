const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://adzfohfdindovfcpaizb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkemZvaGZkaW5kb3ZmY3BhaXpiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTY3OTgwMCwiZXhwIjoyMDg3MjU1ODAwfQ.wGaNWPGK8fLF5GMzbiGTApVnktdtaegQkquTMOGPyl8';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkNotifs() {
  const { data, error } = await supabase
    .from('StaffNotifications')
    .select('*')
    .order('createdAt', { ascending: false })
    .limit(10);
    
  if (error) {
    console.error(error);
    return;
  }
  
  console.log('Recent Notifications:');
  data.forEach(n => {
    console.log(`[${n.createdAt}] Type: ${n.type}, Emp: ${n.employeeId}, Msg: ${n.message}`);
  });
}

checkNotifs();
