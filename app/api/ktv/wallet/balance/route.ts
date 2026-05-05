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

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const techCode = searchParams.get('techCode');

        if (!techCode) {
            return NextResponse.json({ success: false, error: 'Thiếu mã KTV' }, { status: 400 });
        }

        const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
        const nowVn = new Date(Date.now() + VN_OFFSET_MS);
        const todayStr = nowVn.toISOString().split('T')[0];
        const todayStartStr = `${todayStr}T00:00:00+07:00`;

        // 1. Fetch configs
        const [{ data: milestoneConf }, { data: rateConf }] = await Promise.all([
            supabase.from('SystemConfigs').select('value').eq('key', 'ktv_commission_milestones').single(),
            supabase.from('SystemConfigs').select('value').eq('key', 'ktv_commission_per_60min').single()
        ]);
        let milestones = { "1": 2000, "30": 50000, "45": 75000, "60": 100000, "70": 115000, "90": 150000, "100": 165000, "120": 200000, "180": 300000, "300": 500000 };
        let ratePer60 = 100000;
        if (milestoneConf?.value) { try { milestones = typeof milestoneConf.value === 'string' ? JSON.parse(milestoneConf.value) : milestoneConf.value; } catch { } }
        if (rateConf?.value) {
            const rawRate = String(rateConf.value).replace(/[^0-9]/g, '');
            if (rawRate) ratePer60 = Number(rawRate);
        }

        // 2. Fetch Historical Ledger Totals (Snapshot)
        // Using raw postgrest select to get sum
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

        const { data: services } = await supabase.from('Services').select('id, duration');
        const svcDurationMap: Record<string, number> = {};
        (services || []).forEach(s => { svcDurationMap[String(s.id)] = s.duration || 60; });

        let today_commission = 0;
        let today_tip = 0;
        const validBookings = (bookings || []).filter(b => b.BookingItems && b.BookingItems.length > 0);

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

            today_commission += calcCommission(totalDuration || 60, milestones, ratePer60);
            today_tip += relevantItems.reduce((sum: number, i: any) => sum + (Number(i.tip) || 0), 0);
        }

        // Today's adjustments and withdrawals (Approved)
        const { data: todayAdjustments } = await supabase
            .from('WalletAdjustments')
            .select('amount')
            .eq('staff_id', techCode)
            .gte('created_at', todayStartStr);
        const today_adjustment = (todayAdjustments || []).reduce((sum, a) => sum + Number(a.amount), 0);

        const { data: todayWithdrawals } = await supabase
            .from('KTVWithdrawals')
            .select('amount, status')
            .eq('staff_id', techCode)
            .eq('status', 'APPROVED')
            .gte('request_date', todayStartStr);
        const today_withdrawn = (todayWithdrawals || []).reduce((sum, w) => sum + Number(w.amount), 0);

        // Fetch All-time PENDING Withdrawals
        const { data: pendingWithdrawals } = await supabase
            .from('KTVWithdrawals')
            .select('amount')
            .eq('staff_id', techCode)
            .eq('status', 'PENDING');
        const total_pending = (pendingWithdrawals || []).reduce((sum, w) => sum + Number(w.amount), 0);

        // 4. Combine Ledger + Today
        const total_commission = sum_commission + today_commission;
        const total_tip = sum_tip + today_tip;
        const total_adjustment = sum_adjustment + today_adjustment;
        const total_withdrawn = sum_withdrawn + today_withdrawn;

        const gross_income = total_commission + total_adjustment;
        const min_deposit = 500000;
        const net_balance = gross_income - total_withdrawn - total_pending;
        const available_balance = Math.max(0, net_balance - min_deposit);
        const effective_balance = Math.max(0, net_balance);

        return NextResponse.json({
            success: true,
            data: {
                total_commission,
                total_tip,
                total_adjustment,
                total_withdrawn,
                total_pending,
                gross_income,
                min_deposit,
                net_balance,
                available_balance,
                effective_balance
            }
        });

    } catch (err: any) {
        console.error('Exception in /api/ktv/wallet/balance:', err);
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}
