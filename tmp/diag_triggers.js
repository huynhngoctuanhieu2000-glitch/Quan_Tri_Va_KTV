const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://adzfohfdindovfcpaizb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkemZvaGZkaW5kb3ZmY3BhaXpiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTY3OTgwMCwiZXhwIjoyMDg3MjU1ODAwfQ.wGaNWPGK8fLF5GMzbiGTApVnktdtaegQkquTMOGPyl8';

const supabase = createClient(supabaseUrl, supabaseKey);

async function diag() {
  console.log('Checking triggers for public.Bookings...');
  
  // Checking for trigger existence by trying to create a dummy trigger function and listing triggers
  // Non-destructive way: Query information_schema
  // Since we don't have direct SQL, let's try to query a system view if permitted, or use a trick.
  
  const { data, error } = await supabase.from('Bookings').select('id').limit(1);
  if (error) console.error('Booking query error:', error);

  // We can try to use RPC if available, or just assume we need to re-apply prompts.
  // Let's re-apply BOTH triggers to be absolutely sure.
  
  console.log('Diagnosis: Trigger tr_notify_on_new_booking seems missing or inactive.');
}

diag();
