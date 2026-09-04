import { toBusinessDate } from '../business-date';

/**
 * ================================================================
 * KtvDLedgerEngine — CÔNG THỨC DUY NHẤT cho tiền tua & giờ loại D
 * ================================================================
 * Hàm THUẦN: không query, không ghi DB, không đọc `new Date()` cho logic
 * nghiệp vụ. Đưa vào dữ liệu đã fetch + config → trả ra các dòng sổ cái.
 *
 * Nhờ vậy nó test được bằng dữ liệu bịa, và được dùng lại y nguyên cho cả
 * 3 đường: ghi theo sự kiện, backfill, và cron lưới an toàn.
 *
 * Grain: 1 dòng = 1 KTV × 1 BookingItem.
 *
 * ⚠️ MỌI consumer (ví, lịch sử, giờ tích lũy, xếp tua, báo cáo) phải lấy số
 * từ các dòng này. Không nơi nào được tự tính lại từ Bookings.
 */

// ── Trạng thái item được tính tiền ──────────────────────────────────
const PAYABLE_STATUSES = ['DONE', 'COMPLETED', 'FEEDBACK', 'CLEANING'];
/** Item đã chốt hẳn — sao đã về, KTV đã bàn giao. */
const FINAL_STATUSES = ['DONE'];
/** Đủ điều kiện hiện tiền cho KTV (khách đã FB hoặc đã bỏ qua). */
const SETTLED_STATUSES = ['DONE', 'COMPLETED'];

// ── Nhóm đơn giá ────────────────────────────────────────────────────
// Chỉ 2 nhóm. Không có 'COMBO': không mã dịch vụ nào bắt đầu bằng COMBO
// ("Combo King" là NHS0800 → Phổ thông), và Settings cũng chỉ có 2 đơn giá.
const VIP_PREFIXES = ['NHP', 'NHT', 'VIP'];

export type RateCategory = 'VIP' | 'PT';
export type RatingSource = 'GUEST_KTV' | 'GUEST' | 'ITEM_KTV' | 'ITEM' | 'BOOKING' | 'NONE';
export type EntryStatus = 'OPEN' | 'FINAL';

export interface TypeDConfigs {
    rateVIP: number;
    ratePT: number;
    /** { '0':0, '1':0.75, '2':0.5, '3':0.25, '4':0 } — thang 4★ */
    ratingDeductions: Record<string, number>;
    cutoffHours: number;
    /** 0.1 = 10% */
    taxRate: number;
    /** 'YYYY-MM-DD', hoặc null nếu chưa áp thuế */
    taxEffectiveFrom: string | null;
}

export interface EngineGuest {
    id: string;
    rating?: number | null;
    ktv_ratings?: Record<string, number> | null;
}

export interface EngineItem {
    id: string;
    serviceId?: string | null;
    guest_id?: string | null;
    technicianCodes?: string[] | null;
    segments?: any;
    status?: string | null;
    tip?: number | null;
    itemRating?: number | null;
    ktvRatings?: Record<string, number> | null;
    options?: any;
    handover_status?: string | null;
    handover_comment?: string | null;
}

export interface EngineBooking {
    id: string;
    billCode?: string | null;
    timeStart?: string | null;
    status?: string | null;
    rating?: number | null;
    BookingItems?: EngineItem[] | null;
    BookingGuests?: EngineGuest[] | null;
}

export interface EngineService {
    nameVN?: string | null;
    code?: string | null;
    is_utility?: boolean | null;
}

export interface TurnRow {
    staff_id: string;
    booking_item_id: string;
    booking_id: string;
    guest_id: string | null;
    group_id: string;
    work_date: string;

    bill_code: string | null;
    bill_suffix: string;
    service_id: string | null;
    service_name: string | null;
    rate_category: RateCategory;
    booking_time_start: string | null;

    assigned_minutes: number;
    actual_minutes: number;
    paid_minutes: number;
    custom_minutes: number | null;

    rate_per_60m: number;
    rating_used: number;
    rating_source: RatingSource;
    deduction_rate: number;
    commission_gross: number;
    commission_net: number;
    tax_amount: number;
    tip: number;

    item_status: string | null;
    is_provisional: boolean;
    entry_status: EntryStatus;

    handover_status: string | null;
    handover_comment: string | null;
    co_workers: string[];
}

// ── Tiện ích ────────────────────────────────────────────────────────

function parseJson(value: any, fallback: any): any {
    if (value == null) return fallback;
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch { return fallback; }
}

function sameKtv(a: string | null | undefined, b: string): boolean {
    return !!a && a.toLowerCase() === b.toLowerCase();
}

/** Segments của riêng KTV này trong một item. */
function segmentsOf(item: EngineItem, staffId: string): any[] {
    const segs = parseJson(item.segments, []);
    if (!Array.isArray(segs)) return [];
    return segs.filter((s: any) => sameKtv(s?.ktvId, staffId));
}

/** `options.mergedIntoId || item.id` — id của "đơn con" (một khách). */
function groupIdOf(item: EngineItem): string {
    const opts = parseJson(item.options, {}) || {};
    return opts.mergedIntoId || item.id;
}

export function rateCategoryOf(serviceId: string | null | undefined): RateCategory {
    const sid = String(serviceId || '').toUpperCase();
    return VIP_PREFIXES.some(p => sid.startsWith(p)) ? 'VIP' : 'PT';
}

/**
 * Sao áp cho KTV này ở đơn này — ưu tiên theo KHÁCH, chi tiết nhất trước.
 * Trả cả nguồn để sau này tra được số đó từ đâu ra.
 */
export function resolveRating(
    booking: EngineBooking,
    item: EngineItem,
    guest: EngineGuest | undefined,
    staffId: string
): { rating: number; source: RatingSource } {
    const pick = (map: Record<string, number> | null | undefined): number | null => {
        if (!map) return null;
        for (const [k, v] of Object.entries(map)) {
            if (sameKtv(k, staffId) && v != null) return Number(v);
        }
        return null;
    };

    const guestKtv = pick(parseJson(guest?.ktv_ratings, null));
    if (guestKtv != null) return { rating: guestKtv, source: 'GUEST_KTV' };

    if (guest?.rating != null) return { rating: Number(guest.rating), source: 'GUEST' };

    const itemKtv = pick(parseJson(item.ktvRatings, null));
    if (itemKtv != null) return { rating: itemKtv, source: 'ITEM_KTV' };

    if (item.itemRating != null) return { rating: Number(item.itemRating), source: 'ITEM' };

    if (booking.rating != null) return { rating: Number(booking.rating), source: 'BOOKING' };

    return { rating: 0, source: 'NONE' };
}

/**
 * Phút gán / phút làm thực / phút được trả tiền.
 *
 * ⚠️ `paid` và `actual` KHÔNG dùng chung cách tính, và đây là chủ ý — nó sao
 * chép đúng hai hàm đang chạy trong production, để engine không tự ý đổi
 * lương hay đổi giờ tích lũy của KTV:
 *
 *   paid   ← KtvTypeDCommissionService.calculateGuestCommission  (TIỀN)
 *            · phút LẺ, không làm tròn
 *            · thực = max(0, t2−t1) → mốc lỗi (t2 < t1) trả 0
 *            · = min(thực, gán): làm 55/60 trả 55; làm 70/60 vẫn trả 60
 *
 *   actual ← KtvTypeDTurnService.calculateActualMinutes           (GIỜ)
 *            · phút LÀM TRÒN
 *            · mốc lỗi (t2 ≤ t1) thì lùi về giờ gán
 *            · KHÔNG chặn trên → làm 70 thì tích lũy được 70
 *
 * Hai cách này lệch nhau ở phần lẻ và ở mốc lỗi. Trước đây chúng bị dùng lẫn
 * (lỗi L4). Ở đây tách bạch nhưng vẫn giữ nguyên hành vi từng cái.
 *
 * `customCommissionDuration` (admin can thiệp) thắng cả hai.
 */
export function computeMinutes(segs: any[]): {
    assigned: number; actual: number; paid: number; custom: number | null;
} {
    let assigned = 0, actual = 0, paid = 0, custom: number | null = null;

    for (const seg of segs) {
        const gan = Number(seg?.duration) || 0;
        assigned += gan;

        const hasCustom = seg?.customCommissionDuration !== undefined
            && seg?.customCommissionDuration !== null;
        if (hasCustom) {
            const c = Number(seg.customCommissionDuration) || 0;
            custom = (custom ?? 0) + c;
            actual += c;
            paid += c;
            continue;
        }

        let t1 = NaN, t2 = NaN;
        if (seg?.actualStartTime && seg?.actualEndTime) {
            t1 = new Date(seg.actualStartTime).getTime();
            t2 = new Date(seg.actualEndTime).getTime();
        }
        const hasMarks = Number.isFinite(t1) && Number.isFinite(t2);

        // TIỀN — phút lẻ, mốc lỗi trả 0
        paid += hasMarks ? Math.min(Math.max(0, (t2 - t1) / 60000), gan) : gan;

        // GIỜ — phút làm tròn, mốc lỗi lùi về giờ gán
        actual += (hasMarks && t2 > t1) ? Math.round((t2 - t1) / 60000) : gan;
    }

    return { assigned, actual, paid, custom };
}

// ── Engine ──────────────────────────────────────────────────────────

/**
 * Dựng các dòng sổ cái từ dữ liệu đã fetch.
 *
 * @param bookings   Bookings kèm BookingItems + BookingGuests
 * @param staffIds   Chỉ dựng dòng cho những KTV này (danh sách loại D)
 * @param services   serviceId → { nameVN, is_utility }
 * @param configs    đơn giá, bảng trừ sao, cutoff, thuế
 */
export function computeRows(
    bookings: EngineBooking[],
    staffIds: string[],
    services: Record<string, EngineService>,
    configs: TypeDConfigs
): TurnRow[] {
    const staffSet = new Map<string, string>(); // lowercase → id gốc
    for (const id of staffIds) staffSet.set(id.toLowerCase(), id);

    const rows: TurnRow[] = [];

    for (const booking of bookings) {
        const allItems = booking.BookingItems || [];
        if (allItems.length === 0) continue;

        const isUtility = (i: EngineItem) => !!services[String(i.serviceId)]?.is_utility;

        // Hậu tố -A / -B: đánh theo TẤT CẢ đơn con của bill (không riêng KTV này),
        // nếu không thì hai KTV cùng bill sẽ thấy hậu tố khác nhau.
        const groupOrder: string[] = [];
        for (const i of allItems) {
            if (isUtility(i)) continue;
            const g = groupIdOf(i);
            if (!groupOrder.includes(g)) groupOrder.push(g);
        }
        const suffixOf = (g: string) => groupOrder.length > 1
            ? `-${String.fromCharCode(65 + Math.max(0, groupOrder.indexOf(g)))}`
            : '';

        const guestById = new Map<string, EngineGuest>();
        for (const g of booking.BookingGuests || []) guestById.set(String(g.id), g);

        const workDate = booking.timeStart
            ? toBusinessDate(new Date(booking.timeStart + (/[Z+]/.test(booking.timeStart.slice(10)) ? '' : 'Z')), configs.cutoffHours)
            : null;

        for (const item of allItems) {
            // Dịch vụ tiện ích (Phòng riêng...) không sinh dòng: không gán KTV,
            // không tính hoa hồng, không tính giờ.
            if (isUtility(item)) continue;
            if (!PAYABLE_STATUSES.includes(String(item.status))) continue;
            if (!workDate) continue;

            const techCodes = item.technicianCodes || [];

            for (const rawCode of techCodes) {
                const staffId = staffSet.get(String(rawCode).toLowerCase());
                if (!staffId) continue; // không phải KTV loại D

                const segs = segmentsOf(item, staffId);
                if (segs.length === 0) continue;

                const { assigned, actual, paid, custom } = computeMinutes(segs);
                if (paid <= 0 && actual <= 0) continue;

                const guest = item.guest_id ? guestById.get(String(item.guest_id)) : undefined;
                const { rating, source } = resolveRating(booking, item, guest, staffId);

                const category = rateCategoryOf(item.serviceId);
                const rate = category === 'VIP' ? configs.rateVIP : configs.ratePT;
                const deduction = Number(configs.ratingDeductions[String(rating)] ?? 0);

                const gross = Math.round(paid * (rate / 60));
                const net = Math.round(gross * (1 - deduction));

                const isTaxed = !!configs.taxEffectiveFrom && workDate >= configs.taxEffectiveFrom;
                const tax = isTaxed ? Math.round(net * configs.taxRate) : 0;

                const itemStatus = String(item.status);
                const hasRating = rating > 0;
                const isSettled = SETTLED_STATUSES.includes(itemStatus);

                const svc = services[String(item.serviceId)];
                const opts = parseJson(item.options, {}) || {};
                const group = groupIdOf(item);

                rows.push({
                    staff_id: staffId,
                    booking_item_id: item.id,
                    booking_id: booking.id,
                    guest_id: item.guest_id ? String(item.guest_id) : null,
                    group_id: group,
                    work_date: workDate,

                    bill_code: booking.billCode ?? null,
                    bill_suffix: suffixOf(group),
                    service_id: item.serviceId ? String(item.serviceId) : null,
                    service_name: opts.displayName || svc?.nameVN || svc?.code || (item.serviceId ? String(item.serviceId) : null),
                    rate_category: category,
                    booking_time_start: booking.timeStart ?? null,

                    assigned_minutes: assigned,
                    actual_minutes: actual,
                    paid_minutes: paid,
                    custom_minutes: custom,

                    rate_per_60m: rate,
                    rating_used: rating,
                    rating_source: source,
                    deduction_rate: deduction,
                    commission_gross: gross,
                    commission_net: net,
                    tax_amount: tax,
                    tip: Number(item.tip) || 0,

                    item_status: itemStatus,
                    // Chưa có sao và chưa chốt trạng thái → chưa hiện tiền cho KTV.
                    is_provisional: !hasRating && !isSettled,
                    entry_status: FINAL_STATUSES.includes(itemStatus) ? 'FINAL' : 'OPEN',

                    handover_status: item.handover_status ?? null,
                    handover_comment: item.handover_comment ?? null,
                    co_workers: techCodes
                        .map(c => String(c).trim().toUpperCase())
                        .filter(c => c && c !== staffId.toUpperCase()),
                });
            }
        }
    }

    return rows;
}
