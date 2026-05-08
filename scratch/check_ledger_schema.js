const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkSchema() {
    // We can't query schema directly easily without RPC or psql
    // But we can try to select 1 row and see the columns
    const { data, error } = await supabase
        .from('KTVDailyLedger')
        .select('*')
        .limit(1);
    
    if (error) {
        console.error('Error:', error);
        return;
    }
    if (data.length > 0) {
        console.log('KTVDailyLedger Columns:', Object.keys(data[0]));
    } else {
        console.log('KTVDailyLedger is empty, trying to get columns via RPC if possible...');
        // Alternatively, just try to insert a dummy and see what fails? No.
    }
}

checkSchema();
