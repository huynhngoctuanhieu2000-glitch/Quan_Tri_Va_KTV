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

// API: POST /api/cron/sync-daily-ledger
// Body: { targetDate: 'YYYY-MM-DD' } (Optional, defaults to yesterday)
export async function POST(request: Request) {
    try {
        let targetDateStr = '';
        try {
            const body = await request.json();
            targetDateStr = body.targetDate;
        } catch { }

        // Determine target date in VN time
        // If no targetDate provided, default to YESTERDAY
        if (!targetDateStr) {
            const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
            const nowVn = new Date(Date.now() + VN_OFFSET_MS);
            nowVn.setDate(nowVn.getDate() - 1); // Yesterday
            targetDateStr = nowVn.toISOString().split('T')[0];
        }

        console.log(`[Cron] Syncing Daily Ledger for date: ${targetDateStr}`);

        // Boundaries in VN time
        const startTimeStr = `${targetDateStr}T00:00:00+07:00`;
        const endTimeStr = `${targetDateStr}T23:59:59.999+07:00`;

        // 1. Get configs
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

        // 2. Fetch KTVs
        const { data: ktvs } = await supabase
            .from('Staff')
            .select('id, full_name')
            .eq('status', 'ĐANG LÀM')
            .ilike('id', 'NH%');
        
        if (!ktvs || ktvs.length === 0) return NextResponse.json({ success: true, message: 'No KTVs found' });

        // 3. Fetch Bookings for the target date
        const { data: bookings } = await supabase
            .from('Bookings')
            .select(`
                id, timeStart, timeEnd, status, technicianCode,
                BookingItems:BookingItems!fk_bookingitems_booking ( id, serviceId, technicianCodes, segments, status, tip )
            `)
            .gte('timeStart', startTimeStr)
            .lte('timeStart', endTimeStr)
            .in('status', ['IN_PROGRESS', 'DONE', 'FEEDBACK', 'CLEANING']);

        const { data: services } = await supabase.from('Services').select('id, duration');
        const svcDurationMap: Record<string, number> = {};
        (services || []).forEach(s => { svcDurationMap[String(s.id)] = s.duration || 60; });

        // 4. Fetch Adjustments & Withdrawals for the target date
        const { data: adjustments } = await supabase
            .from('WalletAdjustments')
            .select('staff_id, amount')
            .gte('created_at', startTimeStr)
            .lte('created_at', endTimeStr);

        const { data: withdrawals } = await supabase
            .from('KTVWithdrawals')
            .select('staff_id, amount')
            .eq('status', 'APPROVED')
            .gte('request_date', startTimeStr)
            .lte('request_date', endTimeStr);

        const validBookings = (bookings || []).filter(b => b.BookingItems && b.BookingItems.length > 0);

        const upsertRows = [];

        // 5. Calculate per KTV
        for (const ktv of ktvs) {
            const techCode = ktv.id;
            let total_commission = 0;
            let total_tip = 0;

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

                total_commission += calcCommission(totalDuration || 60, milestones, ratePer60);
                total_tip += relevantItems.reduce((sum: number, i: any) => sum + (Number(i.tip) || 0), 0);
            }

            const ktvAdjustments = (adjustments || []).filter(a => a.staff_id === techCode);
            const ktvWithdrawals = (withdrawals || []).filter(w => w.staff_id === techCode);

            const total_adjustment = ktvAdjustments.reduce((sum, a) => sum + Number(a.amount), 0);
            const total_withdrawn = ktvWithdrawals.reduce((sum, w) => sum + Number(w.amount), 0);

            // Only add to upsert if there is actual activity, to keep DB lean,
            // OR we can just add everyone so balance is continuous. Let's add everyone to be safe.
            upsertRows.push({
                date: targetDateStr,
                staff_id: techCode,
                total_commission,
                total_tip,
                total_adjustment,
                total_withdrawn,
                updated_at: new Date().toISOString()
            });
        }

        // 6. Bulk UPSERT
        if (upsertRows.length > 0) {
            const { error: upsertErr } = await supabase
                .from('KTVDailyLedger')
                .upsert(upsertRows, {
                    onConflict: 'date, staff_id'
                });

            if (upsertErr) {
                console.error('Upsert Error:', upsertErr);
                throw upsertErr;
            }
        }

        return NextResponse.json({ success: true, message: `Synced ${upsertRows.length} ledgers for ${targetDateStr}` });
    } catch (err: any) {
        console.error('Exception in sync-daily-ledger:', err);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
