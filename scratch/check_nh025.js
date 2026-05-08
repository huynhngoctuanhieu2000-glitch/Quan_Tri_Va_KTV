const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const env = fs.readFileSync('.env.local', 'utf8');
const urlMatch = env.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]+)/);
const keyMatch = env.match(/SUPABASE_SERVICE_ROLE_KEY=([^\r\n]+)/);

const supabaseUrl = urlMatch ? urlMatch[1] : '';
const supabaseServiceKey = keyMatch ? keyMatch[1] : '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function check() {
    const today = new Date().toISOString().split('T')[0];
    const { data: shifts } = await supabase
        .from('KTVShifts')
        .select('*')
        .eq('ktvId', 'NH025')
        .order('date', { ascending: false })
        .limit(5);
    console.log('Recent shifts for NH025:', shifts);

    const { data: configs } = await supabase.from('SystemConfigs').select('*');
    console.log('Configs:', configs);
}

check();
