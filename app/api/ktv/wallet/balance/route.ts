import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// --- Utilities (Copied from history/route.ts for 100% logic sync) ---
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

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const techCode = searchParams.get('techCode');

        if (!techCode) {
            return NextResponse.json({ success: false, error: 'Thiếu mã KTV (techCode)' }, { status: 400 });
        }

        // 1. Fetch Configs
        const [{ data: milestoneConf }, { data: rateConf }] = await Promise.all([
            supabase.from('SystemConfigs').select('value').eq('key', 'ktv_commission_milestones').single(),
            supabase.from('SystemConfigs').select('value').eq('key', 'ktv_commission_per_60min').single()
        ]);

        let milestones = { "1": 2000, "30": 50000, "45": 75000, "60": 100000, "70": 115000, "90": 150000, "100": 165000, "120": 200000, "180": 300000, "300": 500000 };
        let ratePer60 = 100000;

        if (milestoneConf?.value) {
            try { milestones = typeof milestoneConf.value === 'string' ? JSON.parse(milestoneConf.value) : milestoneConf.value; } catch { }
        }
        if (rateConf?.value) {
            const rawRate = String(rateConf.value).replace(/[^0-9]/g, '');
            if (rawRate) ratePer60 = Number(rawRate);
        }

        const START_DATE = '2026-05-04T00:00:00.000Z';

        // 2. Fetch Bookings, Items, Services
        const { data: bookings } = await supabase
            .from('Bookings')
            .select(`
                id, timeStart, timeEnd, status, source, technicianCode,
                BookingItems ( id, serviceId, duration, technicianCodes, segments, status, tip )
            `)
            .gte('timeStart', START_DATE);

        const { data: services } = await supabase.from('Services').select('id, duration');
        const svcDurationMap: Record<string, number> = {};
        (services || []).forEach(s => { svcDurationMap[String(s.id)] = s.duration || 60; });

        // 3. Compute Commission & Tips (Exact copy of history logic)
        let total_commission = 0;
        let total_tip = 0;

        const validBookings = (bookings || []).filter(b => b.BookingItems && b.BookingItems.length > 0);

        for (const b of validBookings) {
            const relevantItems = (b.BookingItems || []).filter((i: any) =>
                i.technicianCodes &&
                Array.isArray(i.technicianCodes) &&
                i.technicianCodes.some((tc: string) => tc.toLowerCase().includes(techCode.toLowerCase()))
            );

            if (relevantItems.length === 0) continue;

            let totalDuration = 0;
            for (const item of relevantItems) {
                let segs: any[] = [];
                try {
                    segs = typeof item.segments === 'string' ? JSON.parse(item.segments) : (item.segments || []);
                } catch { segs = []; }

                const mySegs = segs.filter((seg: any) =>
                    seg.ktvId && seg.ktvId.toLowerCase().includes(techCode.toLowerCase())
                );

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

            const commission = calcCommission(totalDuration || 60, milestones, ratePer60);
            total_commission += commission;

            // Tips
            const ktvTip = relevantItems.reduce((sum: number, i: any) => sum + (Number(i.tip) || 0), 0);
            total_tip += ktvTip;
        }

        // 4. Fetch Adjustments and Withdrawals
        const { data: adjustments } = await supabase
            .from('WalletAdjustments')
            .select('amount')
            .eq('staff_id', techCode)
            .gte('created_at', START_DATE);

        const { data: withdrawals } = await supabase
            .from('KTVWithdrawals')
            .select('amount, status')
            .eq('staff_id', techCode)
            .gte('request_date', START_DATE);

        const total_adjustment = (adjustments || []).reduce((sum, a) => sum + Number(a.amount), 0);
        const total_withdrawn = (withdrawals || []).filter(w => w.status === 'APPROVED').reduce((sum, w) => sum + Number(w.amount), 0);
        const total_pending = (withdrawals || []).filter(w => w.status === 'PENDING').reduce((sum, w) => sum + Number(w.amount), 0);

        // 5. Build Result
        const gross_income = total_commission + total_adjustment;
        const min_deposit = 500000;
        const available_balance = gross_income - total_withdrawn - total_pending;
        const effective_balance = Math.max(0, available_balance);

        const balanceData = {
            total_commission,
            total_tip,
            total_adjustment,
            total_withdrawn,
            total_pending,
            gross_income,
            min_deposit,
            available_balance,
            effective_balance
        };

        return NextResponse.json({
            success: true,
            data: balanceData
        });

    } catch (err: any) {
        console.error('Exception in /api/ktv/wallet/balance:', err);
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}
