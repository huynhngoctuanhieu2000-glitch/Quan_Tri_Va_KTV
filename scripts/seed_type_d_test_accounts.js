const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DEFAULT_FEATURE_FLAGS_TYPE_D = {
    laundry_deduction: true,
    sudden_leave_penalty: false,
    allow_on_call: false,
    enable_employee_tasks: false,
    bonus_wallet: true,
    savings_wallet: false,
    maintenance_fee: true,
    internal_fund_enabled: true,
    withdraw_morning_only: true
};

async function run() {
    const ids = ['NH001', 'NH002', 'NH011', 'NH014', 'NH016', 'NH018', 'NH021', 'NH025', 'NH027', 'NH069', 'NH079'];
    
    const { data: staffList, error: fetchError } = await supabase
        .from('Staff')
        .select('*')
        .in('id', ids);

    if (fetchError) {
        console.error('Error fetching staff:', fetchError.message);
        return;
    }

    const testAccounts = staffList.map(staff => {
        const testId = staff.id.replace('NH', 'T');
        return {
            ...staff,
            id: testId,
            full_name: `${staff.full_name} (Test D)`,
            work_type: 'TYPE_D',
            feature_flags: DEFAULT_FEATURE_FLAGS_TYPE_D,
            work_type_effective_from: '2026-09-01',
            phone: null,
            id_card: null,
            bank_account: null
        };
    });

    const { error: insertError } = await supabase
        .from('Staff')
        .upsert(testAccounts, { onConflict: 'id' });

    if (insertError) {
        console.error('Error inserting test accounts:', insertError.message);
    } else {
        console.log(`Successfully seeded ${testAccounts.length} test accounts.`);
    }
}

run();
