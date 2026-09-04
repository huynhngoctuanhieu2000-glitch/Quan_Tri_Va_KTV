/**
 * Backfill KTVDTurnLedger từ Bookings.
 *
 *   # xem trước, KHÔNG ghi gì
 *   npx ts-node -O '{"module":"commonjs"}' scripts/backfill_ktvd_turn_ledger.ts 2026-09-01 2026-09-30 --dry-run
 *
 *   # ghi thật
 *   npx ts-node -O '{"module":"commonjs"}' scripts/backfill_ktvd_turn_ledger.ts 2026-09-01 2026-09-30
 *
 * An toàn:
 *   · upsert theo (staff_id, booking_item_id) → chạy lại bao nhiêu lần cũng ra một kết quả
 *   · KHÔNG đè dòng đã `entry_status = 'LOCKED'`
 *   · chỉ ghi vào KTVDTurnLedger, không đụng bảng nào khác
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { computeRows, TurnRow, TypeDConfigs, EngineService } from '../lib/services/KtvDLedgerEngine';
import { getDayCutoffHours, businessDayRange } from '../lib/business-date';

function loadEnv(): Record<string, string> {
    const env: Record<string, string> = {};
    for (const line of fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split(/\r?\n/)) {
        const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
        if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
    }
    return env;
}

const vnd = (n: number) => Math.round(n).toLocaleString('vi-VN') + 'đ';

async function main() {
    const from = process.argv[2] || '2026-09-01';
    const to = process.argv[3] || '2026-09-30';
    const dryRun = process.argv.includes('--dry-run');

    const env = loadEnv();
    const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    const cutoffHours = await getDayCutoffHours(sb as any);

    const { data: cfgRows } = await sb.from('SystemConfigs').select('key, value');
    const cfg: Record<string, any> = {};
    (cfgRows || []).forEach((c: any) => {
        let v = c.value;
        if (typeof v === 'string') { try { v = JSON.parse(v); } catch { /* giữ nguyên */ } }
        cfg[c.key] = v;
    });

    const taxFrom = String(cfg['ktv_type_d_tax_effective_from'] ?? '').replace(/"/g, '').trim();
    const configs: TypeDConfigs = {
        rateVIP: Number(cfg['ktv_type_d_vip_rate_per_60m']) || 180000,
        ratePT: Number(cfg['ktv_type_d_pt_rate_per_60m']) || 100000,
        ratingDeductions: cfg['ktv_type_d_rating_deduction'] || { '0': 0, '1': 0.75, '2': 0.5, '3': 0.25, '4': 0 },
        cutoffHours,
        taxRate: 0.1,
        taxEffectiveFrom: taxFrom || null,
    };

    console.log(`${dryRun ? '🔍 XEM TRƯỚC (không ghi)' : '✍️  GHI THẬT'}`);
    console.log(`Kỳ ${from} → ${to} | cutoff ${cutoffHours}h | VIP ${vnd(configs.rateVIP)} · PT ${vnd(configs.ratePT)}`);
    console.log(`Thuế áp từ: ${configs.taxEffectiveFrom || '(chưa áp)'}\n`);

    const { data: staff } = await sb.from('Staff').select('id').eq('work_type', 'TYPE_D');
    const staffIds = (staff || []).map((s: any) => s.id);

    const { data: svc } = await sb.from('Services').select('id, code, nameVN, is_utility');
    const services: Record<string, EngineService> = {};
    (svc || []).forEach((s: any) => {
        const e = { nameVN: s.nameVN, code: s.code, is_utility: !!s.is_utility };
        if (s.id) services[String(s.id)] = e;
        if (s.code) services[String(s.code)] = e;
    });

    // Nới rộng cửa sổ fetch 1 ngày mỗi đầu: tua ca đêm của ngày `from` có
    // timeStart rơi sang ngày lịch kế tiếp.
    const wide = businessDayRange(from, cutoffHours);
    const wideEnd = businessDayRange(to, cutoffHours);

    let all: any[] = [];
    for (let page = 0; ; page++) {
        const { data, error } = await sb
            .from('Bookings')
            .select(`
                id, billCode, timeStart, status, rating,
                BookingItems!fk_bookingitems_booking (
                    id, serviceId, guest_id, technicianCodes, segments, status, tip,
                    itemRating, ktvRatings, options, handover_status, handover_comment
                ),
                BookingGuests ( id, rating, ktv_ratings )
            `)
            .gte('timeStart', wide.startIso)
            .lt('timeStart', wideEnd.endIso)
            .neq('status', 'CANCELLED')
            .range(page * 500, (page + 1) * 500 - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all = all.concat(data);
        if (data.length < 500) break;
    }

    const rows = computeRows(all as any, staffIds, services, configs)
        .filter(r => r.work_date >= from && r.work_date <= to);

    console.log(`Bookings quét: ${all.length}  →  dòng sổ cái: ${rows.length}\n`);
    if (rows.length === 0) { console.log('Không có gì để ghi.'); return; }

    // Không đè dòng đã khoá sổ.
    const { data: locked } = await sb
        .from('KTVDTurnLedger')
        .select('staff_id, booking_item_id')
        .eq('entry_status', 'LOCKED')
        .gte('work_date', from).lte('work_date', to);
    const lockedKeys = new Set((locked || []).map((l: any) => `${l.staff_id}|${l.booking_item_id}`));

    const writable = rows.filter(r => !lockedKeys.has(`${r.staff_id}|${r.booking_item_id}`));
    if (lockedKeys.size > 0) {
        console.log(`⏭️  Bỏ qua ${rows.length - writable.length} dòng đã LOCKED\n`);
    }

    // Tổng theo ngày để soi nhanh
    const byDate: Record<string, { n: number; net: number; hours: number }> = {};
    for (const r of writable) {
        const d = (byDate[r.work_date] ||= { n: 0, net: 0, hours: 0 });
        d.n++; d.net += r.commission_net; d.hours += r.actual_minutes / 60;
    }
    console.log('ngày          dòng   tiền tua        giờ tích lũy');
    console.log('─'.repeat(52));
    for (const [d, v] of Object.entries(byDate).sort()) {
        console.log(`${d}   ${String(v.n).padStart(4)}   ${vnd(v.net).padStart(12)}   ${v.hours.toFixed(2).padStart(8)}h`);
    }
    console.log('─'.repeat(52));
    const total = writable.reduce((s, r) => s + r.commission_net, 0);
    console.log(`TỔNG          ${String(writable.length).padStart(4)}   ${vnd(total).padStart(12)}\n`);

    if (dryRun) { console.log('🔍 Chế độ xem trước — chưa ghi gì vào database.'); return; }

    const payload = writable.map((r: TurnRow) => ({ ...r, source: 'BACKFILL' }));
    let done = 0;
    for (let i = 0; i < payload.length; i += 200) {
        const chunk = payload.slice(i, i + 200);
        const { error } = await sb
            .from('KTVDTurnLedger')
            .upsert(chunk, { onConflict: 'staff_id,booking_item_id' });
        if (error) throw error;
        done += chunk.length;
        console.log(`   ghi ${done}/${payload.length}`);
    }
    console.log(`\n✅ Đã ghi ${done} dòng vào KTVDTurnLedger.`);
}

main().catch(e => { console.error('❌', e.message || e); process.exit(1); });
