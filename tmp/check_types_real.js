const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://adzfohfdindovfcpaizb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkemZvaGZkaW5kb3ZmY3BhaXpiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTY3OTgwMCwiZXhwIjoyMDg3MjU1ODAwfQ.wGaNWPGK8fLF5GMzbiGTApVnktdtaegQkquTMOGPyl8';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkColumnTypes() {
    console.log('--- TurnQueue COLUMN TYPES ---');
    try {
        // We can't easily get column types via simple select, 
        // but we can try to insert a wrong type and see the error, 
        // or just check if it's a string.
        const { data } = await supabase.from('TurnQueue').select('estimated_end_time').not('estimated_end_time', 'is', null).limit(1);
        if (data && data.length > 0) {
            console.log('Value:', data[0].estimated_end_time, 'Type:', typeof data[0].estimated_end_time);
        } else {
            console.log('No data with estimated_end_time found');
        }
    } catch (err) {
        console.error(err);
    }
}

checkColumnTypes();
