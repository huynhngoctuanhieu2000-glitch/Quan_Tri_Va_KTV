
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkNotifications() {
    const { data, error } = await supabase
        .from('StaffNotifications')
        .select('*')
        .order('createdAt', { ascending: false })
        .limit(10);

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log('Recent Notifications:');
    data.forEach(n => {
        console.log(`- ID: ${n.id}`);
        console.log(`  Type: [${n.type}] (length: ${n.type.length})`);
        console.log(`  Message: ${n.message}`);
        console.log('-------------------');
    });
}

checkNotifications();
