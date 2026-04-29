const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) env[match[1]] = match[2];
});

const supabaseUrl = env['NEXT_PUBLIC_SUPABASE_URL'];
const supabaseKey = env['SUPABASE_SERVICE_ROLE_KEY'] || env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
    console.log("Checking constraint by trying to insert a INVALID shift...");
    const { data, error } = await supabase
        .from('KTVShifts')
        .insert({
            employeeId: 'TEST_001',
            employeeName: 'Test',
            shiftType: 'THIS_SHOULD_FAIL',
            status: 'ACTIVE',
            effectiveFrom: new Date().toISOString().split('T')[0]
        })
        .select();

    if (error) {
        console.error("ERROR:", error.message);
    } else {
        console.log("SUCCESS:", data);
        await supabase.from('KTVShifts').delete().eq('employeeId', 'TEST_001');
    }
}
test();
