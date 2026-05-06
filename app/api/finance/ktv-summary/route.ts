import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const calcCommission = (durationMins: number, milestones: any, ratePer60: number) => {
    const sMins = String(durationMins);
    if (milestones && milestones[sMins] !== undefined) {
        return Number(milestones[sMins]);
    }
    const h = durationMins / 60;
    const comm = Math.round(h * ratePer60);
    return Math.round(comm / 1000) * 1000;
};

const getMinsFromTimes = (start: string, end: string) => {
    if (!start || !end) return 0;
    const [h1, m1] = start.split(':').map(Number);
    const [h2, m2] = end.split(':').map(Number);
    if (isNaN(h1) || isNaN(m1) || isNaN(h2) || isNaN(m2)) return 0;
    let mins1 = h1 * 60 + m1;
    let mins2 = h2 * 60 + m2;
    if (mins2 < mins1) mins2 += 24 * 60;
    return mins2 - mins1;
};

export async function GET() {
    try {
        const GLOBAL_START_DATE = '2026-05-04T00:00:00+07:00';

        // 1. Get configs
        const [{ data: milestoneConf }, { data: rateConf }, { data: depositConf }] = await Promise.all([
            supabase.from('SystemConfigs').select('value').eq('key', 'ktv_commission_milestones').single(),
            supabase.from('SystemConfigs').select('value').eq('key', 'ktv_commission_per_60min').single(),
            supabase.from('SystemConfigs').select('value').eq('key', 'ktv_min_deposit').single()
        ]);
        
        let milestones = { "1": 2000, "30": 50000, "45": 75000, "60": 100000, "70": 115000, "90": 150000, "100": 165000, "120": 200000, "180": 300000, "300": 500000 };
        let ratePer60 = 100000;
        let global_min_deposit = 500000;
        
        if (milestoneConf?.value) { try { milestones = typeof milestoneConf.value === 'string' ? JSON.parse(milestoneConf.value) : milestoneConf.value; } catch { } }
        if (rateConf?.value) {
            const rawRate = String(rateConf.value).replace(/[^0-9]/g, '');
            if (rawRate) ratePer60 = Number(rawRate);
        }
        if (depositConf?.value) {
            const rawDeposit = String(depositConf.value).replace(/[^0-9]/g, '');
            if (rawDeposit) global_min_deposit = Number(rawDeposit);
        }

        // 2. Fetch KTVs
        const { data: ktvs } = await supabase
            .from('Staff')
            .select('id, full_name, position')
            .eq('status', 'ĐANG LÀM')
            .ilike('id', 'NH%')
            .order('id');
            
        if (!ktvs || ktvs.length === 0) return NextResponse.json({ success: true, data: [] });

        // 3. 🌉 DYNAMIC BRIDGE: Fetch Ledger & Calculate realtimeStartStr
        const { data: ledgers } = await supabase
            .from('KTVDailyLedger')
            .select('date, staff_id, total_commission, total_tip, total_adjustment, total_withdrawn');

        let realtimeStartStr = GLOBAL_START_DATE;
        const ledgerMap: Record<string, any> = {};
        ktvs.forEach(k => {
            ledgerMap[k.id] = { comm: 0, tip: 0, adj: 0, withdrawn: 0 };
        });

        if (ledgers && ledgers.length > 0) {
            // Find max date
            let maxDateStr = ledgers[0].date;
            ledgers.forEach(l => {
                if (l.date > maxDateStr) maxDateStr = l.date;
                if (ledgerMap[l.staff_id]) {
                    ledgerMap[l.staff_id].comm += Number(l.total_commission);
                    ledgerMap[l.staff_id].tip += Number(l.total_tip);
                    // We intentionally ignore ledger.adj and ledger.withdrawn to prevent double counting
                    // because we fetch their FULL history dynamically in the next step.
                }
            });

            // realtimeStartStr = maxDate + 1 day at 00:00:00+07:00
            const lastDate = new Date(`${maxDateStr}T00:00:00+07:00`);
            lastDate.setDate(lastDate.getDate() + 1);
            realtimeStartStr = `${lastDate.toISOString().split('T')[0]}T00:00:00+07:00`;
        }

        // 4. Fetch Realtime Bookings from realtimeStartStr
        const { data: bookings } = await supabase
            .from('Bookings')
            .select(`
                id, timeStart, timeEnd, status, technicianCode,
                BookingItems:BookingItems!fk_bookingitems_booking ( id, serviceId, technicianCodes, segments, status, tip )
            `)
            .gte('timeStart', realtimeStartStr)
            .in('status', ['IN_PROGRESS', 'DONE', 'FEEDBACK', 'CLEANING']);

        const { data: services } = await supabase.from('Services').select('id, duration');
        const svcDurationMap: Record<string, number> = {};
        (services || []).forEach(s => { svcDurationMap[String(s.id)] = s.duration || 60; });

        const validBookings = (bookings || []).filter(b => b.BookingItems && b.BookingItems.length > 0);

        // 4. Fetch Realtime Adjustments and Withdrawals (Fetch ALL history to not miss past withdrawals/starting balances)
        const { data: realtimeAdjustments } = await supabase.from('WalletAdjustments').select('staff_id, amount');
        const { data: realtimeWithdrawals } = await supabase.from('KTVWithdrawals').select('staff_id, amount, status');
        const { data: pendingWithdrawals } = await supabase.from('KTVWithdrawals').select('staff_id, amount').eq('status', 'PENDING');

        // 5. Calculate per KTV
        const summaries = ktvs.map(ktv => {
            const techCode = ktv.id;
            let rt_commission = 0;
            let rt_tip = 0;

            for (const b of validBookings) {
                const relevantItems = (b.BookingItems || []).filter((i: any) =>
                    i.technicianCodes && Array.isArray(i.technicianCodes) &&
                    i.technicianCodes.some((tc: string) => tc.toLowerCase().includes(techCode.toLowerCase()))
                );

                if (relevantItems.length === 0) continue;

                let totalDuration = 0;
                for (const item of relevantItems) {
                    let segs: any[] = [];
                    try { segs = typeof item.segments === 'string' ? JSON.parse(item.segments) : (item.segments || []); } catch { }

                    const mySegs = segs.filter((seg: any) => seg.ktvId && seg.ktvId.toLowerCase().includes(techCode.toLowerCase()));

                    if (mySegs.length > 0) {
                        totalDuration += mySegs.reduce((sum: number, seg: any) => {
                            const realMins = getMinsFromTimes(seg.startTime, seg.endTime);
                            if (realMins > 0) return sum + realMins;
                            return sum + (Number(seg.duration) || 0);
                        }, 0);
                    } else {
                        totalDuration += svcDurationMap[String(item.serviceId)] || 60;
                    }
                }

                rt_commission += calcCommission(totalDuration || 60, milestones, ratePer60);
                rt_tip += relevantItems.reduce((sum: number, i: any) => sum + (Number(i.tip) || 0), 0);
            }

            const rt_adjustment = (realtimeAdjustments || []).filter(a => a.staff_id === techCode).reduce((sum, a) => sum + Number(a.amount), 0);
            const rt_withdrawn = (realtimeWithdrawals || []).filter(w => w.staff_id === techCode && w.status === 'APPROVED').reduce((sum, w) => sum + Number(w.amount), 0);
            const total_pending = (pendingWithdrawals || []).filter(w => w.staff_id === techCode).reduce((sum, w) => sum + Number(w.amount), 0);

            const ledger = ledgerMap[techCode];
            const total_commission = ledger.comm + rt_commission;
            const total_tip = ledger.tip + rt_tip;

            // rt_adjustment and rt_withdrawn already contain ALL history, so we don't add ledger.adj or ledger.withdrawn
            const gross_income = total_commission + rt_adjustment;
            const min_deposit = global_min_deposit;
            const net_balance = gross_income - rt_withdrawn - total_pending;
            const available_balance = Math.max(0, net_balance - min_deposit);
            const effective_balance = Math.max(0, net_balance);

            return {
                id: ktv.id,
                name: ktv.full_name,
                position: ktv.position,
                total_commission,
                total_tip,
                total_adjustment: rt_adjustment,
                total_withdrawn: rt_withdrawn,
                total_pending,
                gross_income,
                min_deposit,
                net_balance,
                available_balance,
                effective_balance
            };
        });

        return NextResponse.json({ success: true, data: summaries });
    } catch (err: any) {
        console.error('Exception in /api/finance/ktv-summary:', err);
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}
