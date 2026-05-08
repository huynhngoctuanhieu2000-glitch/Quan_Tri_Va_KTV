const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const s = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY']);

const milestones = { "1": 2000, "30": 50000, "45": 75000, "60": 100000, "70": 115000, "90": 150000, "100": 165000, "120": 200000, "180": 300000, "300": 500000 };
const ratePer60 = 100000;

const calcCommission = (durationMins) => {
    const sMins = String(durationMins);
    if (milestones[sMins] !== undefined) return milestones[sMins];
    const h = durationMins / 60;
    const comm = Math.round(h * ratePer60);
    return Math.round(comm / 1000) * 1000;
};

const getMins = (start, end) => {
    if (!start || !end) return 0;
    const [h1, m1] = start.split(':').map(Number);
    const [h2, m2] = end.split(':').map(Number);
    let mins1 = h1 * 60 + m1;
    let mins2 = h2 * 60 + m2;
    if (mins2 < mins1) mins2 += 24 * 60;
    return mins2 - mins1;
};

async function check() {
    const techCode = 'NH002';
    const START_DATE = '2026-05-04T00:00:00+07:00';

    const { data: bookings } = await s.from('Bookings').select('id, timeStart, billCode, status, BookingItems(id, serviceId, technicianCodes, segments, tip)').gte('timeStart', START_DATE).in('status', ['IN_PROGRESS', 'DONE', 'FEEDBACK', 'CLEANING']);
    
    let totalComm = 0;
    console.log(`Bookings for ${techCode}:`);
    
    for (const b of bookings || []) {
        const relevantItems = (b.BookingItems || []).filter(i => i.technicianCodes?.some(tc => tc.toLowerCase().includes(techCode.toLowerCase())));
        if (relevantItems.length === 0) continue;

        let totalDuration = 0;
        for (const item of relevantItems) {
            let segs = item.segments || [];
            const mySegs = segs.filter(seg => seg.ktvId?.toLowerCase().includes(techCode.toLowerCase()));
            if (mySegs.length > 0) {
                totalDuration += mySegs.reduce((sum, seg) => sum + (getMins(seg.startTime, seg.endTime) || Number(seg.duration) || 0), 0);
            } else {
                totalDuration += 60; // Default
            }
        }
        const comm = calcCommission(totalDuration || 60);
        totalComm += comm;
        console.log(`- Bill: ${b.billCode}, Date: ${b.timeStart}, Duration: ${totalDuration}m, Comm: ${comm}`);
    }
    console.log(`Total Commission (Recalculated): ${totalComm}`);
}

check();
