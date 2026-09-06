/**
 * ================================================================
 * MỐC GIỜ TRONG MỘT CHẶNG (segment)
 * ================================================================
 * Nguồn duy nhất trả lời: "chặng này KTV làm thực bao nhiêu phút?"
 *
 * ⚠️ TRƯỚC ĐÂY LÀM SAI THẾ NÀY — đừng quay lại:
 * `resumeItem` từng DỜI `actualStartTime` tới trước đúng bằng thời gian đã
 * tạm dừng, để đồng hồ đếm ngược chạy tiếp cho khớp. Đồng hồ thì đúng, nhưng
 * mốc bắt đầu THẬT bị ghi đè mất — ô "Bắt đầu" trên Kanban nhảy muộn đi sau
 * mỗi lần tạm dừng, và không cách nào phục hồi con số gốc.
 *
 * NAY: `actualStartTime` BẤT BIẾN. Mỗi lần tạm dừng ghi thêm một khoảng vào
 * `seg.pauses[]`, và giờ làm thực = (kết − bắt đầu) − Σ(khoảng dừng).
 * Đồng hồ vẫn mượt vì hạn kết thúc tính động: bắt đầu + giờ gán + Σ(dừng).
 *
 *   {
 *     "actualStartTime": "…T04:20:52Z",     // không bao giờ đổi
 *     "actualEndTime":   "…T05:30:00Z",
 *     "pauses": [ { "from": "…T04:40:00Z", "to": "…T04:45:00Z" } ]
 *   }
 *
 * Dữ liệu cũ không có `pauses` → Σ = 0 → công thức thoái về đúng như trước,
 * nên KHÔNG cần migrate.
 *
 * 🔗 Ba nơi tính tiền/giờ đều phải đi qua file này, sót một nơi là lệch lương:
 *   - KtvDLedgerEngine.computeMinutes          (tiền + giờ loại D)
 *   - KtvTypeDTurnService.calculateActualMinutes (giờ tích luỹ → thứ tự tua)
 *   - KtvCommissionService.calculateItemDuration (tiền A/B/C)
 */

/** Mốc giờ trong DB khi thì ISO, khi thì 'YYYY-MM-DD HH:mm:ss' trần. */
export function parseTimeMs(v: any): number {
    if (!v) return NaN;
    if (typeof v !== 'string') return new Date(v).getTime();
    const normalized = v.includes('T') ? v : v.replace(' ', 'T');
    const hasZone = /(Z|[+-]\d{2}:?\d{2})$/.test(normalized);
    return new Date(hasZone ? normalized : normalized + 'Z').getTime();
}

/**
 * Chặng bị tước sạch quyền lợi (KTV bị đổi ra, hoặc đơn huỷ do lỗi KTV).
 * Vẫn nằm trong đơn để biết ai từng làm cho khách, nhưng không quy ra tiền/giờ.
 */
export function isVoidedSegment(seg: any): boolean {
    return seg?.voided === true;
}

/**
 * Tổng thời gian đã tạm dừng của một chặng, tính bằng mili giây.
 *
 * @param seg      chặng
 * @param openEnd  mốc dùng để đóng khoảng dừng còn hở (chưa bấm tiếp tục).
 *                 Thường là `actualEndTime` của chặng, hoặc `Date.now()` khi
 *                 đang tính đồng hồ chạy trực tiếp. Bỏ trống thì khoảng còn hở
 *                 được tính là 0.
 */
export function pausedMsOf(seg: any, openEnd?: string | number | null): number {
    const list = Array.isArray(seg?.pauses) ? seg.pauses : [];
    if (list.length === 0) return 0;

    const openEndMs = openEnd == null
        ? NaN
        : (typeof openEnd === 'number' ? openEnd : parseTimeMs(openEnd));

    let total = 0;
    for (const p of list) {
        const from = parseTimeMs(p?.from);
        if (!Number.isFinite(from)) continue;

        let to = parseTimeMs(p?.to);
        if (!Number.isFinite(to)) to = openEndMs;      // còn đang dừng
        if (!Number.isFinite(to) || to <= from) continue;

        total += to - from;
    }
    return total;
}

/**
 * Số mili giây KTV thực sự làm trong chặng, đã trừ các khoảng tạm dừng.
 * Trả `null` khi chặng thiếu mốc để tính (chưa bắt đầu, hoặc chưa kết thúc và
 * người gọi không đưa `endOverride`).
 */
export function workedMsOf(seg: any, endOverride?: string | number | null): number | null {
    const start = parseTimeMs(seg?.actualStartTime);
    if (!Number.isFinite(start)) return null;

    const rawEnd = endOverride ?? seg?.actualEndTime;
    const end = typeof rawEnd === 'number' ? rawEnd : parseTimeMs(rawEnd);
    if (!Number.isFinite(end)) return null;

    const worked = end - start - pausedMsOf(seg, end);
    return worked > 0 ? worked : 0;
}

/**
 * Hạn kết thúc thực tế của chặng, đã cộng bù thời gian tạm dừng.
 * Dùng cho đồng hồ đếm ngược và cho cột "Kết thúc" dự kiến.
 */
export function expectedEndMs(seg: any, assignedMins: number, now: number = Date.now()): number | null {
    const start = parseTimeMs(seg?.actualStartTime);
    if (!Number.isFinite(start)) return null;
    return start + assignedMins * 60000 + pausedMsOf(seg, now);
}
