const { loadEnvConfig } = require('@next/env');
loadEnvConfig(process.cwd());
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
    const techCode = 'NH007'; // Let's guess it's NH007 based on the data

    const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
    const nowVn = new Date(Date.now() + VN_OFFSET_MS);
    const todayStr = nowVn.toISOString().split('T')[0];
    const todayStartStr = `${todayStr}T00:00:00+07:00`;

    // 2. Fetch Historical Ledger Totals (Snapshot)
    const { data: ledgerData } = await supabase
        .from('KTVDailyLedger')
        .select('total_commission, total_tip, total_adjustment, total_withdrawn')
        .eq('staff_id', techCode);

    let sum_commission = 0;
    let sum_tip = 0;
    let sum_adjustment = 0;
    let sum_withdrawn = 0;

    (ledgerData || []).forEach(row => {
        sum_commission += Number(row.total_commission || 0);
        sum_tip += Number(row.total_tip || 0);
        sum_adjustment += Number(row.total_adjustment || 0);
        sum_withdrawn += Number(row.total_withdrawn || 0);
    });

    // 3. Fetch TODAY's Real-time Data
    const { data: bookings } = await supabase
        .from('Bookings')
        .select(`
            id, timeStart, timeEnd, status, technicianCode,
            BookingItems:BookingItems!fk_bookingitems_booking ( id, serviceId, technicianCodes, segments, status, tip )
        `)
        .gte('timeStart', todayStartStr)
        .in('status', ['IN_PROGRESS', 'DONE', 'FEEDBACK', 'CLEANING']);

    console.log('Bookings today:', bookings);
    
    let today_commission = 0;

    // Today's adjustments and withdrawals (Approved)
    const { data: todayAdjustments } = await supabase
        .from('WalletAdjustments')
        .select('amount')
        .eq('staff_id', techCode)
        .gte('created_at', todayStartStr);
    const today_adjustment = (todayAdjustments || []).reduce((sum, a) => sum + Number(a.amount), 0);

    const total_commission = sum_commission + today_commission;
    const total_adjustment = sum_adjustment + today_adjustment;

    const gross_income = total_commission + total_adjustment;
    
    console.log('Balance/route.ts Gross Income:', gross_income);
    console.log('sum_commission:', sum_commission);
    console.log('sum_adjustment:', sum_adjustment);
    console.log('today_commission:', today_commission);
    console.log('today_adjustment:', today_adjustment);
    
    const { data: tlAdj } = await supabase.from('WalletAdjustments').select('*').eq('staff_id', techCode);
    console.log('All Adjustments for NH007:', tlAdj);
})();
