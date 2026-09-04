import type { SupabaseClient } from '@supabase/supabase-js';
import { computeRows, TurnRow, TypeDConfigs, EngineService } from './KtvDLedgerEngine';
import { getDayCutoffHours } from '../business-date';

/**
 * ================================================================
 * KtvDLedgerWriter — CỬA GHI DUY NHẤT của sổ cái tua loại D
 * ================================================================
 * `recomputeTurnRows()` idempotent: tự đọc lại DB, tự tính, tự upsert. Gọi
 * bao nhiêu lần với cùng đầu vào cũng ra cùng kết quả.
 *
 * Ba đường gọi vào đây, và cả ba dùng CHUNG hàm này — không có bản sao nào:
 *   · worker rút KTVDRecomputeQueue  (trigger đẩy vào)
 *   · backfill                        (scripts/backfill_ktvd_turn_ledger.ts)
 *   · cron đối soát đêm               (lưới an toàn)
 */

/** Chỉ đọc config một lần cho mỗi lượt chạy. */
export interface LedgerContext {
    configs: TypeDConfigs;
    services: Record<string, EngineService>;
    staffIds: string[];
}

export async function loadContext(supabase: SupabaseClient): Promise<LedgerContext> {
    const cutoffHours = await getDayCutoffHours(supabase);

    const { data: cfgRows } = await supabase.from('SystemConfigs').select('key, value');
    const cfg: Record<string, any> = {};
    (cfgRows || []).forEach((c: any) => {
        let v = c.value;
        if (typeof v === 'string') { try { v = JSON.parse(v); } catch { /* giữ nguyên */ } }
        cfg[c.key] = v;
    });

    const taxFrom = String(cfg['ktv_type_d_tax_effective_from'] ?? '').replace(/"/g, '').trim();

    const { data: staff } = await supabase.from('Staff').select('id').eq('work_type', 'TYPE_D');
    const { data: svc } = await supabase.from('Services').select('id, code, nameVN, is_utility');

    const services: Record<string, EngineService> = {};
    (svc || []).forEach((s: any) => {
        const e = { nameVN: s.nameVN, code: s.code, is_utility: !!s.is_utility };
        if (s.id) services[String(s.id)] = e;
        if (s.code) services[String(s.code)] = e;
    });

    return {
        configs: {
            rateVIP: Number(cfg['ktv_type_d_vip_rate_per_60m']) || 180000,
            ratePT: Number(cfg['ktv_type_d_pt_rate_per_60m']) || 100000,
            ratingDeductions: cfg['ktv_type_d_rating_deduction']
                || { '0': 0, '1': 0.75, '2': 0.5, '3': 0.25, '4': 0 },
            cutoffHours,
            taxRate: 0.1,
            taxEffectiveFrom: taxFrom || null,
        },
        services,
        staffIds: (staff || []).map((s: any) => s.id),
    };
}

export interface RecomputeResult {
    itemsRequested: number;
    rowsWritten: number;
    rowsVoided: number;
    rowsSkippedLocked: number;
}

/**
 * Tính lại sổ cái cho đúng các BookingItem được chỉ định.
 *
 * @param itemIds danh sách `BookingItems.id`
 */
export async function recomputeTurnRows(
    supabase: SupabaseClient,
    itemIds: string[],
    ctx?: LedgerContext,
): Promise<RecomputeResult> {
    const empty: RecomputeResult = { itemsRequested: 0, rowsWritten: 0, rowsVoided: 0, rowsSkippedLocked: 0 };
    if (itemIds.length === 0) return empty;

    const context = ctx || await loadContext(supabase);

    // Tìm các booking chứa những item này, rồi nạp ĐẦY ĐỦ booking đó.
    // Phải nạp cả bill vì hậu tố -A/-B được đánh theo toàn bộ đơn con của
    // bill, không thể tính đúng nếu chỉ nhìn một item.
    const { data: idRows, error: idErr } = await supabase
        .from('BookingItems')
        .select('bookingId')
        .in('id', itemIds);
    if (idErr) throw idErr;

    const bookingIds = [...new Set((idRows || []).map((r: any) => r.bookingId).filter(Boolean))];
    if (bookingIds.length === 0) return { ...empty, itemsRequested: itemIds.length };

    const { data: bookings, error: bErr } = await supabase
        .from('Bookings')
        .select(`
            id, billCode, timeStart, status, rating,
            BookingItems!fk_bookingitems_booking (
                id, serviceId, guest_id, technicianCodes, segments, status, tip,
                itemRating, ktvRatings, options, handover_status, handover_comment
            ),
            BookingGuests ( id, rating, ktv_ratings )
        `)
        .in('id', bookingIds);
    if (bErr) throw bErr;

    // Đơn đã huỷ → không sinh dòng nào; các dòng cũ sẽ bị VOID bên dưới.
    const live = (bookings || []).filter((b: any) => b.status !== 'CANCELLED');
    const produced = computeRows(live as any, context.staffIds, context.services, context.configs)
        // Chỉ giữ dòng thuộc đúng những item được yêu cầu — tránh vô tình ghi
        // đè item khác trong cùng bill mà lần này không được nhắc tới.
        .filter((r: TurnRow) => itemIds.includes(r.booking_item_id));

    // Dòng đã LOCKED thì cấm sửa đè — thay đổi phải đi bằng dòng ADMIN_ADJUST.
    const { data: existing } = await supabase
        .from('KTVDTurnLedger')
        .select('staff_id, booking_item_id, entry_status')
        .in('booking_item_id', itemIds);

    const lockedKeys = new Set(
        (existing || []).filter((r: any) => r.entry_status === 'LOCKED')
            .map((r: any) => `${r.staff_id}|${r.booking_item_id}`));

    const writable = produced.filter(r => !lockedKeys.has(`${r.staff_id}|${r.booking_item_id}`));

    if (writable.length > 0) {
        const payload = writable.map(r => ({ ...r, source: 'EVENT', computed_at: new Date().toISOString() }));
        const { error } = await supabase
            .from('KTVDTurnLedger')
            .upsert(payload, { onConflict: 'staff_id,booking_item_id' });
        if (error) throw error;
    }

    // Dòng còn trong sổ nhưng engine không còn sinh ra nữa → VOID.
    // Xảy ra khi: đổi KTV, huỷ đơn, item lùi về trạng thái chưa tính tiền,
    // hoặc dịch vụ được đổi sang loại tiện ích.
    const producedKeys = new Set(writable.map(r => `${r.staff_id}|${r.booking_item_id}`));
    const toVoid = (existing || []).filter((r: any) =>
        r.entry_status !== 'LOCKED'
        && r.entry_status !== 'VOID'
        && !producedKeys.has(`${r.staff_id}|${r.booking_item_id}`));

    for (const r of toVoid) {
        const { error } = await supabase
            .from('KTVDTurnLedger')
            .update({ entry_status: 'VOID', computed_at: new Date().toISOString() })
            .eq('staff_id', r.staff_id)
            .eq('booking_item_id', r.booking_item_id);
        if (error) throw error;
    }

    return {
        itemsRequested: itemIds.length,
        rowsWritten: writable.length,
        rowsVoided: toVoid.length,
        rowsSkippedLocked: lockedKeys.size,
    };
}

export interface DrainResult extends RecomputeResult {
    queueTaken: number;
    queueRemaining: number;
    failed: number;
}

/**
 * Rút hàng đợi và tính lại.
 *
 * Xoá khỏi hàng đợi TRƯỚC khi tính. Nếu tính lỗi thì nhét lại kèm `last_error`
 * và tăng `attempts` — an toàn hơn là giữ nguyên rồi tính lại mãi một item hỏng
 * làm nghẽn cả hàng đợi.
 */
export async function drainRecomputeQueue(
    supabase: SupabaseClient,
    batchSize = 200,
): Promise<DrainResult> {
    const { data: queued, error } = await supabase
        .from('KTVDRecomputeQueue')
        .select('booking_item_id, attempts')
        .lt('attempts', 5)                       // bỏ qua item hỏng kinh niên
        .order('enqueued_at', { ascending: true })
        .limit(batchSize);
    if (error) throw error;

    const itemIds = (queued || []).map((q: any) => q.booking_item_id);
    if (itemIds.length === 0) {
        const { count } = await supabase
            .from('KTVDRecomputeQueue')
            .select('booking_item_id', { count: 'exact', head: true });
        return {
            queueTaken: 0, queueRemaining: count || 0, failed: 0,
            itemsRequested: 0, rowsWritten: 0, rowsVoided: 0, rowsSkippedLocked: 0,
        };
    }

    await supabase.from('KTVDRecomputeQueue').delete().in('booking_item_id', itemIds);

    let result: RecomputeResult;
    let failed = 0;
    try {
        result = await recomputeTurnRows(supabase, itemIds);
    } catch (e: any) {
        failed = itemIds.length;
        const attemptsBy: Record<string, number> = {};
        (queued || []).forEach((q: any) => { attemptsBy[q.booking_item_id] = Number(q.attempts) || 0; });
        await supabase.from('KTVDRecomputeQueue').upsert(
            itemIds.map(id => ({
                booking_item_id: id,
                attempts: (attemptsBy[id] || 0) + 1,
                last_error: String(e?.message || e).slice(0, 500),
            })),
            { onConflict: 'booking_item_id' },
        );
        result = { itemsRequested: itemIds.length, rowsWritten: 0, rowsVoided: 0, rowsSkippedLocked: 0 };
    }

    const { count } = await supabase
        .from('KTVDRecomputeQueue')
        .select('booking_item_id', { count: 'exact', head: true });

    return { ...result, queueTaken: itemIds.length, queueRemaining: count || 0, failed };
}
