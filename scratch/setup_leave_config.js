const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://adzfohfdindovfcpaizb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkemZvaGZkaW5kb3ZmY3BhaXpiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTY3OTgwMCwiZXhwIjoyMDg3MjU1ODAwfQ.wGaNWPGK8fLF5GMzbiGTApVnktdtaegQkquTMOGPyl8';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    try {
        console.log("Checking if is_extension and is_sudden_off columns exist in KTVLeaveRequests...");
        // Hacky way to check/add columns without pure SQL runner via JS (using a query that fails if missing)
        const { error: checkError } = await supabase.from('KTVLeaveRequests').select('is_extension, is_sudden_off').limit(1);
        
        if (checkError && checkError.message.includes('column')) {
            console.log("Columns not found, this script cannot alter tables directly via REST API. Please use a SQL migration file in Supabase dashboard or via CLI.");
            // However, we can create a migration file instead of running this script.
        } else {
            console.log("Columns already exist or other error:", checkError);
        }

        // Add config to SystemConfigs
        const { data: configCheck } = await supabase.from('SystemConfigs').select('*').eq('key', 'max_leave_extensions_per_month').maybeSingle();
        if (!configCheck) {
            console.log("Adding max_leave_extensions_per_month to SystemConfigs...");
            await supabase.from('SystemConfigs').insert({
                key: 'max_leave_extensions_per_month',
                value: 1,
                description: 'Số lần tối đa KTV được gia hạn ngày nghỉ (đăng ký nối tiếp) trong 1 tháng'
            });
            console.log("Done adding config!");
        } else {
            console.log("Config already exists.");
        }

    } catch(e) {
        console.error(e);
    }
}
run();
