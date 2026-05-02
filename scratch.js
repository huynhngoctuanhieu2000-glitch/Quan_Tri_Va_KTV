const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
    const [key, ...val] = line.split('=');
    if (key && val) acc[key.trim()] = val.join('=').trim().replace(/['"]/g, '');
    return acc;
}, {});

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const { data: items } = await supabase.from('BookingItems').select('id, "technicianCodes", segments').eq('bookingId', 'cfbf4107-adad-49bc-955f-2806db1cef0c');
    for (const item of items) {
        console.log('ID:', item.id);
        console.log('technicianCodes:', item.technicianCodes);
        console.log('isArray?', Array.isArray(item.technicianCodes));
        console.log('typeof:', typeof item.technicianCodes);
    }
}
run();
