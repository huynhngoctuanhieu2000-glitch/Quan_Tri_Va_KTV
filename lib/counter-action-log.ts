import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * ================================================================
 * NHẬT KÝ THAO TÁC TẠI QUẦY
 * ================================================================
 * Ghi lại AI ở quầy đã bấm gì, LÚC NÀO, trên đơn nào.
 *
 * VÌ SAO CẦN
 * Trước đây hệ thống lưu đủ mốc giờ (`pauses[]`, `pauseStart`) nhưng KHÔNG lưu
 * người thao tác, cũng không lưu thời điểm bấm nút. Với một đơn bị huỷ ta chỉ
 * biết "đơn bị huỷ, lý do 'test', KTV mất trắng" — không biết ai quyết và quyết
 * lúc mấy giờ. Có tranh cãi về tiền là không truy được.
 *
 * ⚠️ Phân biệt hai mốc giờ, đừng lẫn:
 *   - `pauseStart`  = lúc bấm TẠM DỪNG. Đây là mốc CHỐT TIỀN.
 *   - `at` ở đây    = lúc bấm nút (Kết thúc / Huỷ / Tiếp…). Chỉ để truy vết,
 *                     TUYỆT ĐỐI không dùng để tính tiền — khoảng giữa hai mốc
 *                     là thời gian quầy cân nhắc, KTV không làm.
 *
 * Lưu vào `BookingItems.options.counterLog[]` nên không cần bảng mới, và đi
 * theo đơn nên xoá đơn là xoá luôn, không để lại rác.
 */

export type CounterAction = 'PAUSE' | 'RESUME' | 'FINISH_EARLY' | 'CANCEL' | 'SWAP_KTV';

export interface CounterLogEntry {
    action: CounterAction;
    /** Mã nhân viên quầy đã bấm. `null` khi không xác định được phiên đăng nhập. */
    by: string | null;
    /** Tên hiển thị, chụp lại lúc bấm để sau này đổi tên không mất dấu. */
    byName?: string | null;
    /** Lúc bấm nút — KHÔNG phải mốc chốt tiền. */
    at: string;
    /** Ghi chú tự do: lý do huỷ, KTV mới khi đổi người… */
    note?: string | null;
}

/** Lấy người đang đăng nhập ở quầy. Không chặn luồng chính nếu không lấy được. */
export async function currentCounterActor(): Promise<{ id: string | null; name: string | null }> {
    try {
        const { requireBusinessUser } = await import('@/lib/auth-server');
        const u = await requireBusinessUser();
        if (!u) return { id: null, name: null };
        return { id: u.businessUserId || u.techCode || null, name: (u as any).username || null };
    } catch {
        return { id: null, name: null };
    }
}

/**
 * Nối thêm một dòng nhật ký vào `options.counterLog` của các dịch vụ.
 *
 * Cố ý KHÔNG throw: mất một dòng nhật ký thì chấp nhận được, còn để nó làm hỏng
 * việc huỷ đơn hay kết thúc đơn thì không.
 */
export async function logCounterAction(
    supabase: SupabaseClient,
    itemIds: string[],
    entry: Omit<CounterLogEntry, 'at'> & { at?: string }
): Promise<void> {
    if (!itemIds || itemIds.length === 0) return;
    const row: CounterLogEntry = { ...entry, at: entry.at || new Date().toISOString() };

    try {
        const { data: items } = await supabase
            .from('BookingItems')
            .select('id, options')
            .in('id', itemIds);

        for (const it of items || []) {
            let opts: any = (it as any).options;
            if (typeof opts === 'string') { try { opts = JSON.parse(opts); } catch { opts = {}; } }
            opts = opts || {};
            const log = Array.isArray(opts.counterLog) ? opts.counterLog : [];
            log.push(row);
            opts.counterLog = log;

            await supabase.from('BookingItems').update({ options: opts }).eq('id', it.id);
        }
    } catch (e: any) {
        console.error('[counterLog] không ghi được nhật ký thao tác quầy:', e?.message || e);
    }
}
