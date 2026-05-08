const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkConfigs() {
    const { data, error } = await supabase
        .from('SystemConfigs')
        .select('key, value')
        .ilike('key', '%penalty%');
    
    if (error) {
        console.error('Error:', error);
        return;
    }
    console.log('Penalty Configs:', data);
}

checkConfigs();
