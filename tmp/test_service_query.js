const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
    const serviceId = "NHS0002"; // From user's reported booking item
    const idIn = `"${serviceId}"`;
    
    console.log(`Searching for: ${idIn}`);
    
    const { data: svcs, error } = await supabase
        .from('Services')
        .select('id, code, nameVN, duration')
        .or(`id.in.(${idIn}),code.in.(${idIn})`);

    if (error) {
        console.error("Query Error:", error);
    } else {
        console.log("Found Services:", JSON.stringify(svcs, null, 2));
    }
}

test();
