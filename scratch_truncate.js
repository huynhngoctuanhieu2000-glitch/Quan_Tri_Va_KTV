const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    const [key, ...vals] = line.split('=');
    if (key && vals.length > 0) env[key.trim()] = vals.join('=').trim().replace(/"/g, '');
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const { error } = await supabase.from('KTVDailyLedger').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) console.error(error);
    else console.log('Successfully truncated KTVDailyLedger');
}
run();
run();
