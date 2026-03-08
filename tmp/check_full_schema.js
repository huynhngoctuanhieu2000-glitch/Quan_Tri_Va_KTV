const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://adzfohfdindovfcpaizb.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkemZvaGZkaW5kb3ZmY3BhaXpiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTY3OTgwMCwiZXhwIjoyMDg3MjU1ODAwfQ.wGaNWPGK8fLF5GMzbiGTApVnktdtaegQkquTMOGPyl8';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkSchema() {
    const { data: bData } = await supabase.from('Bookings').select('*').limit(1);
    const { data: sData } = await supabase.from('Services').select('*').limit(1);

    console.log('--- Bookings Columns ---');
    if (bData && bData[0]) console.log(Object.keys(bData[0]).join(', '));
    
    console.log('\n--- Services Columns ---');
    if (sData && sData[0]) console.log(Object.keys(sData[0]).join(', '));
    
    process.exit(0);
}

checkSchema();
