const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
    // Check Ledger
    const { data: ledger } = await supabase.from('KTVDailyLedger').select('*');
    console.log('KTVDailyLedger:', ledger);
    
    // Check Adjustments
    const { data: adj } = await supabase.from('WalletAdjustments').select('*');
    console.log('WalletAdjustments:', adj);
})();
