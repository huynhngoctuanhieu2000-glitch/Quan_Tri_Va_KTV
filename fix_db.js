// 🔧 FIX: Tính lại và ghi đúng turns_completed vào TurnQueue
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envContent = fs.readFileSync('.env.local', 'utf-8');
const env = {};
for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
        env[trimmed.substring(0, eqIdx).trim()] = trimmed.substring(eqIdx + 1).trim();
    }
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function fixTurns() {
    const today = '2026-04-25';
    const fromFilter = `${today}T00:00:00`;
    const toFilter = `${today}T23:59:59`;

    console.log(`\n🔧 Bắt đầu fix turns_completed cho ngày ${today}...`);

    // 1. Lấy TurnQueue hôm nay
    const { data: turns } = await supabase
        .from('TurnQueue')
        .select('id, employee_id, turns_completed')
        .eq('date', today);

    console.log(`📋 Tìm thấy ${turns.length} KTV trong TurnQueue`);

    // 2. Lấy tất cả Bookings hôm nay
    const { data: bookings } = await supabase
        .from('Bookings')
        .select('id, status')
        .gte('createdAt', fromFilter)
        .lte('createdAt', toFilter);

    const bookingIds = bookings.map(b => b.id);
    const bookingStatusMap = new Map();
    for (const b of bookings) bookingStatusMap.set(b.id, b.status);

    // 3. Lấy tất cả BookingItems
    const { data: items } = await supabase
        .from('BookingItems')
        .select('bookingId, technicianCodes, status')
        .in('bookingId', bookingIds);

    // 4. Tính tua thực tế
    const ktvBills = new Map();
    for (const item of items) {
        const itemDone = ['COMPLETED', 'DONE'].includes(item.status);
        const bookingDone = ['COMPLETED', 'DONE'].includes(bookingStatusMap.get(item.bookingId) || '');
        if (!itemDone && !bookingDone) continue;

        if (item.technicianCodes && Array.isArray(item.technicianCodes)) {
            for (const ktvId of item.technicianCodes) {
                if (!ktvBills.has(ktvId)) ktvBills.set(ktvId, new Set());
                ktvBills.get(ktvId).add(item.bookingId);
            }
        }
    }

    // 5. Ghi vào DB
    console.log('\n📊 Kết quả tính toán:');
    for (const turn of turns) {
        const correctTurns = ktvBills.get(turn.employee_id)?.size || 0;
        const changed = correctTurns !== turn.turns_completed;

        console.log(`   ${turn.employee_id}: ${turn.turns_completed} → ${correctTurns} ${changed ? '⚡ CẬP NHẬT!' : '✅ OK'}`);

        if (changed) {
            const { error } = await supabase
                .from('TurnQueue')
                .update({ turns_completed: correctTurns })
                .eq('id', turn.id);

            if (error) {
                console.error(`   ❌ Lỗi update ${turn.employee_id}:`, error.message);
            }
        }
    }

    console.log('\n✅ Fix xong! Kiểm tra lại trên Supabase.');
}

fixTurns().catch(console.error);
