const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://adzfohfdindovfcpaizb.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkemZvaGZkaW5kb3ZmY3BhaXpiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTY3OTgwMCwiZXhwIjoyMDg3MjU1ODAwfQ.wGaNWPGK8fLF5GMzbiGTApVnktdtaegQkquTMOGPyl8';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkSchema() {
    const { data: bData } = await supabase.from('Bookings').select('*').limit(1);
    
    if (bData && bData[0]) {
        const columns = Object.keys(bData[0]);
        fs.writeFileSync('tmp/bookings_columns.json', JSON.stringify(columns, null, 2));
        console.log('Columns written to tmp/bookings_columns.json');
    }
    
    process.exit(0);
}

checkSchema();
