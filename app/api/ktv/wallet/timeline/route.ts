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
        const timeline: any[] = [];

        // 1. Commission & Tips (from Bookings & BookingItems)
        const { data: bookings } = await supabase
            .from('Bookings')
            .select(`
                id, timeStart, timeEnd, status, technicianCode, billCode, createdAt,
                BookingItems:BookingItems!fk_bookingitems_booking ( id, serviceId, technicianCodes, segments, status, tip )
            `)
            .gte('timeStart', START_DATE)
            .in('status', ['IN_PROGRESS', 'DONE', 'FEEDBACK', 'CLEANING']);

        const { data: services } = await supabase.from('Services').select('id, duration');
        const svcDurationMap: Record<string, number> = {};
        (services || []).forEach(s => { svcDurationMap[String(s.id)] = s.duration || 60; });

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

            const commission = calcCommission(totalDuration || 60, milestones, ratePer60);
            if (commission > 0) {
                timeline.push({
                    id: b.id + '_comm',
                    type: 'COMMISSION',
                    title: `Tiền tua đơn ${b.billCode || b.id.substring(0,6)}`,
                    amount: commission,
                    note: `Tổng thời gian: ${totalDuration} phút`,
                    created_at: b.timeStart || b.createdAt,
                    status: 'APPROVED'
                });
            }

            const ktvTip = relevantItems.reduce((sum: number, i: any) => sum + (Number(i.tip) || 0), 0);
            if (ktvTip > 0) {
                timeline.push({
                    id: b.id + '_tip',
                    type: 'TIP',
                    title: `Tiền Tip đơn ${b.billCode || b.id.substring(0,6)}`,
                    amount: ktvTip,
                    note: '',
                    created_at: b.timeEnd || b.createdAt,
                    status: 'APPROVED'
                });
            }
        }

        // 2. Adjustments
        const { data: adjustments } = await supabase
            .from('WalletAdjustments')
            .select('id, amount, reason, type, created_at')
            .eq('staff_id', techCode)
            .gte('created_at', START_DATE);
        
        (adjustments || []).forEach(a => {
            timeline.push({
                id: a.id,
                type: Number(a.amount) >= 0 ? 'GIFT' : 'ADJUSTMENT',
                title: Number(a.amount) >= 0 ? 'Thưởng hệ thống' : 'Trừ tiền hệ thống',
                amount: a.amount,
                note: a.reason || '',
                created_at: a.created_at,
                status: 'APPROVED'
            });
        });

        // 3. Withdrawals
        const { data: withdrawals } = await supabase
            .from('KTVWithdrawals')
            .select('id, amount, note, request_date, status')
            .eq('staff_id', techCode)
            .gte('request_date', START_DATE);

        (withdrawals || []).forEach(w => {
            timeline.push({
                id: w.id,
                type: 'WITHDRAWAL',
                title: 'Rút tiền mặt',
                amount: -Math.abs(Number(w.amount)),
                note: w.note || '',
                created_at: w.request_date,
                status: w.status
            });
        });

        // Sort timeline asc by created_at to calculate running balance
        timeline.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

        let currentBalance = 0;
        timeline.forEach(item => {
            if (item.type !== 'TIP' && item.status !== 'REJECTED') {
                // Pending withdrawals shouldn't deduct from the physical running balance until approved?
                // Actually, in bank statements, pending usually holds funds, but let's just deduct it to show the available balance dropping, or wait. 
                // Let's only add/deduct if it's not a TIP and not REJECTED.
                // Wait, if it's PENDING withdrawal, should we deduct it? Let's deduct it so they see their balance dropped.
                currentBalance += Number(item.amount);
            }
            item.running_balance = currentBalance;
        });

        // Sort timeline desc for display
        timeline.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        return NextResponse.json({ success: true, data: timeline });
    } catch (err: any) {
        console.error('Exception timeline:', err);
        return NextResponse.json({ success: false, error: 'Internal Error' }, { status: 500 });
    }
}
