const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://adzfohfdindovfcpaizb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkemZvaGZkaW5kb3ZmY3BhaXpiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTY3OTgwMCwiZXhwIjoyMDg3MjU1ODAwfQ.wGaNWPGK8fLF5GMzbiGTApVnktdtaegQkquTMOGPyl8';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkServiceDurations() {
    console.log('--- SERVICE DURATIONS ---');
    try {
        const { data, error } = await supabase.from('Services').select('id, code, nameVN, duration');
        if (error) throw error;
        
        data.forEach(s => {
            if (s.duration === 1 || s.duration === 0 || s.duration === null) {
                console.log(`⚠️ Low/Null Duration: [${s.code || s.id}] ${s.nameVN} - Duration: ${s.duration}`);
            } else {
                console.log(`OK: [${s.code || s.id}] ${s.nameVN} - Duration: ${s.duration}`);
            }
        });
    } catch (err) {
        console.error(err);
    }
}

checkServiceDurations();
