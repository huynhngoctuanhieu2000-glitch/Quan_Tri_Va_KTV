const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://adzfohfdindovfcpaizb.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkemZvaGZkaW5kb3ZmY3BhaXpiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTY3OTgwMCwiZXhwIjoyMDg3MjU1ODAwfQ.wGaNWPGK8fLF5GMzbiGTApVnktdtaegQkquTMOGPyl8';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkService() {
    const { data: svcs, error } = await supabase
        .from('Services')
        .select('*')
        .or(`id.eq.NHS0000,code.eq.NHS0000`);

    if (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }

    console.log('--- Service NHS0000 Info ---');
    console.log(JSON.stringify(svcs, null, 2));
    
    process.exit(0);
}

checkService();
