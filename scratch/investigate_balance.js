const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const supabaseUrl = env['NEXT_PUBLIC_SUPABASE_URL'];
const supabaseKey = env['SUPABASE_SERVICE_ROLE_KEY'];
const supabase = createClient(supabaseUrl, supabaseKey);

async function investigate() {
    const techCodes = ['NH002', 'NH018'];
    const START_DATE = '2026-05-04';

    for (const code of techCodes) {
        console.log(`--- Investigating ${code} ---`);
        
        // Ledger
        const { data: ledgers } = await supabase.from('KTVDailyLedger').select('*').eq('staff_id', code);
        console.log(`Ledgers count: ${ledgers?.length || 0}`);
        const totalLedgerComm = ledgers?.reduce((sum, l) => sum + Number(l.total_commission), 0) || 0;
        console.log(`Total Ledger Commission (All time): ${totalLedgerComm}`);
        
        const oldLedgers = ledgers?.filter(l => l.date < START_DATE) || [];
        console.log(`Ledgers BEFORE ${START_DATE}: ${oldLedgers.length}`);
        const oldLedgerComm = oldLedgers.reduce((sum, l) => sum + Number(l.total_commission), 0);
        console.log(`Commission from old ledgers: ${oldLedgerComm}`);

        // Adjustments
        const { data: adjs } = await supabase.from('WalletAdjustments').select('*').eq('staff_id', code);
        const totalAdj = adjs?.reduce((sum, a) => sum + Number(a.amount), 0) || 0;
        const oldAdj = adjs?.filter(a => a.created_at < START_DATE + 'T00:00:00Z').reduce((sum, a) => sum + Number(a.amount), 0) || 0;
        console.log(`Total Adjustments: ${totalAdj} (Before ${START_DATE}: ${oldAdj})`);

        // Withdrawals
        const { data: withs } = await supabase.from('KTVWithdrawals').select('*').eq('staff_id', code).eq('status', 'APPROVED');
        const totalWith = withs?.reduce((sum, w) => sum + Number(w.amount), 0) || 0;
        const oldWith = withs?.filter(w => w.request_date < START_DATE + 'T00:00:00Z').reduce((sum, w) => sum + Number(w.amount), 0) || 0;
        console.log(`Total Approved Withdrawals: ${totalWith} (Before ${START_DATE}: ${oldWith})`);
    }
}

investigate();
