/**
 * Kiểm thử KtvDLedgerEngine — công thức tiền tua & giờ loại D.
 *
 *   npx ts-node -O '{"module":"commonjs"}' scripts/simulate_ktvd_ledger_engine.ts
 */
import {
    computeRows, computeMinutes, resolveRating, rateCategoryOf,
    TypeDConfigs, EngineBooking, EngineService,
} from '../lib/services/KtvDLedgerEngine';

let pass = 0, fail = 0;
function check(label: string, got: any, want: any) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (ok) { pass++; console.log(`  PASS  ${label}`); }
    else { fail++; console.log(`  FAIL  ${label}\n          got  = ${JSON.stringify(got)}\n          want = ${JSON.stringify(want)}`); }
}
function section(t: string) { console.log(`\n=== ${t} ===`); }

const CFG: TypeDConfigs = {
    rateVIP: 180000,
    ratePT: 100000,
    ratingDeductions: { '0': 0, '1': 0.75, '2': 0.5, '3': 0.25, '4': 0 },
    cutoffHours: 6,
    taxRate: 0.1,
    taxEffectiveFrom: null,
};

const SERVICES: Record<string, EngineService> = {
    NHS0800: { nameVN: 'Gói dịch vụ cao cấp', is_utility: false },
    NHP0001: { nameVN: 'Phòng VIP', is_utility: false },
    NHS0900: { nameVN: 'Phòng riêng', is_utility: true },
};

/** timeStart lưu naive-UTC. 07:00 UTC = 14:00 VN. */
const seg = (o: Partial<Record<string, any>> = {}) => ({
    ktvId: 'T016', duration: 60, ...o,
});

function booking(over: Partial<EngineBooking> = {}): EngineBooking {
    return {
        id: 'B1', billCode: '001-10092026', timeStart: '2026-09-10T07:00:00',
        status: 'DONE', rating: null,
        BookingItems: [], BookingGuests: [], ...over,
    };
}

// ─────────────────────────────────────────────────────────────────
section('computeMinutes — luật min(thực, gán)');

check('làm 55/60 → trả 55, giờ thực 55',
    computeMinutes([seg({ actualStartTime: '2026-09-10T07:00:00Z', actualEndTime: '2026-09-10T07:55:00Z' })]),
    { assigned: 60, actual: 55, paid: 55, custom: null });

check('làm 70/60 → trả 60 (không trả dư), giờ thực 70',
    computeMinutes([seg({ actualStartTime: '2026-09-10T07:00:00Z', actualEndTime: '2026-09-10T08:10:00Z' })]),
    { assigned: 60, actual: 70, paid: 60, custom: null });

check('không có mốc thực → dùng giờ gán',
    computeMinutes([seg()]),
    { assigned: 60, actual: 60, paid: 60, custom: null });

check('admin can thiệp thắng tất cả',
    computeMinutes([seg({ customCommissionDuration: 45, actualStartTime: '2026-09-10T07:00:00Z', actualEndTime: '2026-09-10T08:10:00Z' })]),
    { assigned: 60, actual: 45, paid: 45, custom: 45 });

check('2 segment cộng dồn',
    computeMinutes([
        seg({ duration: 60, actualStartTime: '2026-09-10T07:00:00Z', actualEndTime: '2026-09-10T07:50:00Z' }),
        seg({ duration: 30 }),
    ]),
    { assigned: 90, actual: 80, paid: 80, custom: null });

// ⚠️ Tiền dùng phút LẺ, giờ dùng phút LÀM TRÒN — sao chép đúng 2 hàm đang chạy.
check('phần lẻ: tiền giữ nguyên 29,4140p, giờ làm tròn 29p',
    computeMinutes([seg({ duration: 30, actualStartTime: '2026-09-01T00:00:00.000Z', actualEndTime: '2026-09-01T00:29:24.840Z' })]),
    { assigned: 30, actual: 29, paid: 29.414, custom: null });

check('mốc lỗi (kết thúc trước khi bắt đầu): tiền trả 0, giờ lùi về giờ gán',
    computeMinutes([seg({ duration: 60, actualStartTime: '2026-09-10T08:00:00Z', actualEndTime: '2026-09-10T07:00:00Z' })]),
    { assigned: 60, actual: 60, paid: 0, custom: null });

// ─────────────────────────────────────────────────────────────────
section('rateCategoryOf');
check('NHP → VIP', rateCategoryOf('NHP0001'), 'VIP');
check('NHT → VIP', rateCategoryOf('NHT0002'), 'VIP');
check('NHS0800 (Combo King) → PT', rateCategoryOf('NHS0800'), 'PT');
check('COMBO* → PT (không còn nhóm riêng)', rateCategoryOf('COMBOX'), 'PT');

// ─────────────────────────────────────────────────────────────────
section('resolveRating — ưu tiên theo khách');
const b0 = booking({ rating: 4 });
const it = (o: any = {}) => ({ id: 'I1', serviceId: 'NHS0800', ...o });

check('ktv_ratings của khách thắng tất cả',
    resolveRating(b0, it({ itemRating: 2, ktvRatings: { T016: 1 } }), { id: 'G1', rating: 3, ktv_ratings: { T016: 5 } }, 'T016'),
    { rating: 5, source: 'GUEST_KTV' });

check('rating của khách đứng thứ 2',
    resolveRating(b0, it({ itemRating: 2 }), { id: 'G1', rating: 3 }, 'T016'),
    { rating: 3, source: 'GUEST' });

check('không có khách → ktvRatings của item',
    resolveRating(b0, it({ itemRating: 2, ktvRatings: { t016: 1 } }), undefined, 'T016'),
    { rating: 1, source: 'ITEM_KTV' });

check('rồi tới itemRating',
    resolveRating(b0, it({ itemRating: 2 }), undefined, 'T016'),
    { rating: 2, source: 'ITEM' });

check('cuối cùng mới tới rating của cả bill',
    resolveRating(b0, it(), undefined, 'T016'),
    { rating: 4, source: 'BOOKING' });

check('không có gì → 0 / NONE',
    resolveRating(booking(), it(), undefined, 'T016'),
    { rating: 0, source: 'NONE' });

// ─────────────────────────────────────────────────────────────────
section('computeRows — tua 60 làm 55, PT, 3★ (tính tay)');
// 55 phút × (100000/60) = 91.666,67 → gross 91.667
// 3★ trừ 25% → 91.667 × 0,75 = 68.750,25 → net 68.750
{
    const rows = computeRows([booking({
        BookingGuests: [{ id: 'G1', rating: 3 }],
        BookingItems: [it({
            guest_id: 'G1', status: 'DONE', tip: 20000,
            segments: [seg({ actualStartTime: '2026-09-10T07:00:00Z', actualEndTime: '2026-09-10T07:55:00Z' })],
            technicianCodes: ['T016'],
        })],
    })], ['T016'], SERVICES, CFG);

    check('sinh đúng 1 dòng', rows.length, 1);
    const r = rows[0];
    check('paid_minutes', r.paid_minutes, 55);
    check('actual_minutes', r.actual_minutes, 55);
    check('rate_per_60m', r.rate_per_60m, 100000);
    check('commission_gross', r.commission_gross, 91667);
    check('deduction_rate', r.deduction_rate, 0.25);
    check('commission_net', r.commission_net, 68750);
    check('tip', r.tip, 20000);
    check('rating_source', r.rating_source, 'GUEST');
    check('work_date (14:00 VN → ngày 10/09)', r.work_date, '2026-09-10');
    check('entry_status', r.entry_status, 'FINAL');
    check('is_provisional', r.is_provisional, false);
    check('không thuế khi chưa tới mốc', r.tax_amount, 0);
}

section('computeRows — VIP 4★ không bị trừ');
{
    const rows = computeRows([booking({
        BookingGuests: [{ id: 'G1', rating: 4 }],
        BookingItems: [it({
            id: 'I2', serviceId: 'NHP0001', guest_id: 'G1', status: 'DONE',
            segments: [seg()], technicianCodes: ['T016'],
        })],
    })], ['T016'], SERVICES, CFG);
    check('VIP 60 phút = 180.000', rows[0].commission_gross, 180000);
    check('4★ không trừ', rows[0].commission_net, 180000);
    check('rate_category', rows[0].rate_category, 'VIP');
}

section('Thuế 10% ở tầng dòng');
{
    const rows = computeRows([booking({
        BookingGuests: [{ id: 'G1', rating: 4 }],
        BookingItems: [it({ guest_id: 'G1', status: 'DONE', segments: [seg()], technicianCodes: ['T016'] })],
    })], ['T016'], SERVICES, { ...CFG, taxEffectiveFrom: '2026-09-01' });
    check('net 100.000 → thuế 10.000', rows[0].tax_amount, 10000);
}
{
    const rows = computeRows([booking({
        BookingGuests: [{ id: 'G1', rating: 4 }],
        BookingItems: [it({ guest_id: 'G1', status: 'DONE', segments: [seg()], technicianCodes: ['T016'] })],
    })], ['T016'], SERVICES, { ...CFG, taxEffectiveFrom: '2026-12-01' });
    check('trước mốc hiệu lực → không thuế', rows[0].tax_amount, 0);
}

section('Loại trừ & lọc');
{
    const rows = computeRows([booking({
        BookingItems: [it({ id: 'IU', serviceId: 'NHS0900', status: 'DONE', segments: [seg()], technicianCodes: ['T016'] })],
    })], ['T016'], SERVICES, CFG);
    check('dịch vụ tiện ích (Phòng riêng) không sinh dòng', rows.length, 0);
}
{
    const rows = computeRows([booking({
        BookingItems: [it({ status: 'IN_PROGRESS', segments: [seg()], technicianCodes: ['T016'] })],
    })], ['T016'], SERVICES, CFG);
    check('item chưa xong (IN_PROGRESS) không sinh dòng', rows.length, 0);
}
{
    const rows = computeRows([booking({
        BookingItems: [it({ status: 'DONE', segments: [seg({ ktvId: 'T099' })], technicianCodes: ['T099'] })],
    })], ['T016'], SERVICES, CFG);
    check('KTV không thuộc loại D không sinh dòng', rows.length, 0);
}

section('Nhiều KTV cùng 1 item → mỗi người 1 dòng');
{
    const rows = computeRows([booking({
        BookingGuests: [{ id: 'G1', rating: 4 }],
        BookingItems: [it({
            guest_id: 'G1', status: 'DONE', technicianCodes: ['T016', 'T017'],
            segments: [seg({ ktvId: 'T016', duration: 60 }), seg({ ktvId: 'T017', duration: 30 })],
        })],
    })], ['T016', 'T017'], SERVICES, CFG);
    check('2 dòng', rows.length, 2);
    check('T016 trả theo 60 phút', rows[0].commission_net, 100000);
    check('T017 trả theo 30 phút', rows[1].commission_net, 50000);
    check('co_workers của T016', rows[0].co_workers, ['T017']);
}

section('Hậu tố đơn con -A / -B');
{
    const rows = computeRows([booking({
        BookingGuests: [{ id: 'G1', rating: 4 }, { id: 'G2', rating: 4 }],
        BookingItems: [
            it({ id: 'IA', guest_id: 'G1', status: 'DONE', segments: [seg()], technicianCodes: ['T016'] }),
            it({ id: 'IB', guest_id: 'G2', status: 'DONE', segments: [seg()], technicianCodes: ['T016'] }),
        ],
    })], ['T016'], SERVICES, CFG);
    check('2 đơn con → 2 dòng', rows.length, 2);
    check('hậu tố A/B', rows.map(r => r.bill_suffix), ['-A', '-B']);
    check('group_id khác nhau', rows[0].group_id !== rows[1].group_id, true);
}
{
    const rows = computeRows([booking({
        BookingGuests: [{ id: 'G1', rating: 4 }],
        BookingItems: [it({ guest_id: 'G1', status: 'DONE', segments: [seg()], technicianCodes: ['T016'] })],
    })], ['T016'], SERVICES, CFG);
    check('1 đơn con → không có hậu tố', rows[0].bill_suffix, '');
}

section('work_date theo ngày làm việc (cutoff 6)');
{
    // 18:30 UTC = 01:30 VN ngày 11/09 → ngày làm việc vẫn là 10/09
    const rows = computeRows([booking({
        timeStart: '2026-09-10T18:30:00',
        BookingGuests: [{ id: 'G1', rating: 4 }],
        BookingItems: [it({ guest_id: 'G1', status: 'DONE', segments: [seg()], technicianCodes: ['T016'] })],
    })], ['T016'], SERVICES, CFG);
    check('tua 01:30 sáng 11/09 thuộc ngày làm việc 10/09', rows[0].work_date, '2026-09-10');
}
{
    // 02:00 UTC = 09:00 VN ngày 11/09 → ngày làm việc 11/09
    const rows = computeRows([booking({
        timeStart: '2026-09-11T02:00:00',
        BookingGuests: [{ id: 'G1', rating: 4 }],
        BookingItems: [it({ guest_id: 'G1', status: 'DONE', segments: [seg()], technicianCodes: ['T016'] })],
    })], ['T016'], SERVICES, CFG);
    check('tua 09:00 sáng 11/09 thuộc ngày làm việc 11/09', rows[0].work_date, '2026-09-11');
}

section('Tạm tính khi khách chưa chấm sao');
{
    const rows = computeRows([booking({
        BookingItems: [it({ status: 'CLEANING', segments: [seg()], technicianCodes: ['T016'] })],
    })], ['T016'], SERVICES, CFG);
    check('is_provisional', rows[0].is_provisional, true);
    check('entry_status OPEN', rows[0].entry_status, 'OPEN');
    check('0★ không bị trừ (bảng có "0":0)', rows[0].commission_net, 100000);
}

section('Idempotent — chạy 2 lần ra kết quả giống hệt');
{
    const input = () => [booking({
        BookingGuests: [{ id: 'G1', rating: 3 }],
        BookingItems: [it({
            guest_id: 'G1', status: 'DONE',
            segments: [seg({ actualStartTime: '2026-09-10T07:00:00Z', actualEndTime: '2026-09-10T07:55:00Z' })],
            technicianCodes: ['T016'],
        })],
    })];
    const a = computeRows(input(), ['T016'], SERVICES, CFG);
    const b = computeRows(input(), ['T016'], SERVICES, CFG);
    check('2 lần chạy khớp nhau', JSON.stringify(a) === JSON.stringify(b), true);
}

console.log(`\n${'─'.repeat(50)}`);
console.log(fail === 0 ? `TẤT CẢ PASS (${pass})` : `${pass} pass, ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
