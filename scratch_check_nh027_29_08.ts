import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve('.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');

envContent.split('\n').forEach(line => {
    if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) process.env.NEXT_PUBLIC_SUPABASE_URL = line.split('=')[1].trim();
    if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) process.env.SUPABASE_SERVICE_ROLE_KEY = line.split('=')[1].trim();
});

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
    const date = '2026-08-29';

    // 1. Staff info NH027
    const { data: staff, error: staffErr } = await supabase.from('Staff').select('id, full_name, work_type').eq('id', 'NH027').single();
    console.log('--- STAFF NH027 ---');
    console.log(staff, staffErr);

    // 2. Ledger row for that date
    const { data: ledger, error: ledgerErr } = await supabase.from('KTVDailyLedger').select('*').eq('staff_id', 'NH027').eq('date', date);
    console.log('\n--- KTVDailyLedger (date=' + date + ') ---');
    console.log(ledger, ledgerErr);

    // 3. Bookings that day involving NH027, with items
    const { data: bookings, error: bErr } = await supabase
        .from('Bookings')
        .select(`
            id, billCode, status, timeStart, source,
            BookingItems:BookingItems!fk_bookingitems_booking ( id, serviceId, technicianCodes, status, itemRating, tip, segments, timeStart, timeEnd, price )
        `)
        .gte('timeStart', `${date}T00:00:00+07:00`)
        .lte('timeStart', `${date}T23:59:59+07:00`);

    console.log('\n--- BOOKINGS ngày ' + date + ' (tổng: ' + (bookings || []).length + ') --- err=', bErr);
    (bookings || []).forEach((b: any) => {
        const items = (b.BookingItems || []).filter((i: any) => {
            let codes = i.technicianCodes;
            if (typeof codes === 'string') { try { codes = JSON.parse(codes); } catch { codes = []; } }
            if (!Array.isArray(codes)) codes = [codes];
            return codes.some((c: string) => typeof c === 'string' && c.toUpperCase().includes('NH027'));
        });
        if (items.length > 0) {
            console.log(`\nBill: ${b.billCode || b.id} | Status: ${b.status} | Source: ${b.source} | Start: ${b.timeStart}`);
            items.forEach((i: any) => {
                console.log(`  itemId=${i.id} serviceId=${JSON.stringify(i.serviceId)} status=${i.status} price=${i.price} timeStart=${i.timeStart} timeEnd=${i.timeEnd} technicianCodes=${JSON.stringify(i.technicianCodes)} segments=${JSON.stringify(i.segments)}`);
            });
        }
    });

    console.log('\n--- RAW: tất cả BookingItems ngày ' + date + ' (giới hạn 5 dòng mẫu) ---');
    (bookings || []).slice(0, 3).forEach((b: any) => {
        console.log(`Bill ${b.billCode || b.id}:`, JSON.stringify(b.BookingItems));
    });

    // 4. Service definition lookup for serviceIds found
    const { data: services } = await supabase.from('Services').select('id, name, duration, is_utility, category');
    console.log('\n--- SERVICES (mẫu, lọc theo tên/70p nếu có) ---');
    (services || []).filter((s: any) => (s.name || '').toLowerCase().includes('vip') || s.duration === 70).forEach((s: any) => {
        console.log(s);
    });
}
main().catch(e => console.error(e));
