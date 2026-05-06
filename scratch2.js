const { loadEnvConfig } = require('@next/env');
loadEnvConfig(process.cwd());
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const calcCommission = (durationMins, milestones, ratePer60) => {
    const sMins = String(durationMins);
    if (milestones && milestones[sMins] !== undefined) {
        return Number(milestones[sMins]);
    }
    const h = durationMins / 60;
    const comm = Math.round(h * ratePer60);
    return Math.round(comm / 1000) * 1000;
};

const getMinsFromTimes = (start, end) => {
    if (!start || !end) return 0;
    const [h1, m1] = start.split(':').map(Number);
    const [h2, m2] = end.split(':').map(Number);
    let mins1 = h1 * 60 + m1;
    let mins2 = h2 * 60 + m2;
    if (mins2 < mins1) mins2 += 24 * 60;
    return mins2 - mins1;
};

(async () => {
    const { data: bookings } = await supabase
            .from('Bookings')
            .select('id, timeStart, timeEnd, status, technicianCode, BookingItems:BookingItems!fk_bookingitems_booking ( id, serviceId, technicianCodes, segments, status, tip )')
            .gte('timeStart', '2026-05-04T00:00:00.000Z')
            .in('status', ['IN_PROGRESS', 'DONE', 'FEEDBACK', 'CLEANING']);
            
    const { data: services } = await supabase.from('Services').select('id, duration');
    const svcMap = {}; services.forEach(s => svcMap[s.id] = s.duration || 60);

    const milestones = { "1": 2000, "30": 50000, "45": 75000, "60": 100000, "70": 115000, "90": 150000, "100": 165000, "120": 200000, "180": 300000, "300": 500000 };
    const ratePer60 = 100000;

    let staffComm = {};
    for (const b of bookings) {
        if (!b.BookingItems) continue;
        for (const item of b.BookingItems) {
            if (!item.technicianCodes) continue;
            let segs = [];
            try { segs = typeof item.segments === 'string' ? JSON.parse(item.segments) : (item.segments || []); } catch {}
            
            for (const tech of item.technicianCodes) {
                if (!staffComm[tech]) staffComm[tech] = 0;
                
                const mySegs = segs.filter(seg => seg.ktvId === tech);
                let dur = 0;
                if (mySegs.length > 0) {
                    dur = mySegs.reduce((sum, seg) => {
                        const realMins = getMinsFromTimes(seg.startTime, seg.endTime);
                        return sum + (realMins > 0 ? realMins : (Number(seg.duration) || 0));
                    }, 0);
                } else {
                    dur = svcMap[item.serviceId] || 60;
                }
                
                staffComm[tech] += calcCommission(dur || 60, milestones, ratePer60);
            }
        }
    }
    
    console.log('Calculated directly from Bookings:', staffComm);
    
    const { data: ledger } = await supabase.from('KTVDailyLedger').select('staff_id, total_commission');
    let ledgerMap = {};
    ledger.forEach(l => {
        if (!ledgerMap[l.staff_id]) ledgerMap[l.staff_id] = 0;
        ledgerMap[l.staff_id] += Number(l.total_commission);
    });
    console.log('From Ledger:', ledgerMap);
})();
