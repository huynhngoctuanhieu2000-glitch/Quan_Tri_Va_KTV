/**
 * ================================================================
 * ĐỊNH DẠNG GIỜ TÍCH LUỸ — dùng chung Office và app KTV
 * ================================================================
 * Hai màn hình cùng nói về một con số thì phải đọc ra một chuỗi giống hệt nhau.
 * Trước đây mỗi nơi tự viết một hàm `fmtHours`, chênh nhau ở chỗ làm tròn phút là
 * đủ để KTV thấy "18h 30P" bên này, "18h 29P" bên kia rồi đi hỏi quầy.
 */

/** Giờ thập phân → "18h 30P". Cùng định dạng với bảng điều phối. */
export function fmtHours(h: number): string {
    const total = Number(h) || 0;
    const sign = total < 0 ? '−' : '';
    const abs = Math.abs(total);
    const hh = Math.floor(abs);
    const mm = Math.round((abs - hh) * 60);
    // Làm tròn phút có thể đẩy lên 60 (vd 2.999h) — dồn lên giờ cho khỏi hiện "2h 60P".
    if (mm === 60) return `${sign}${hh + 1}h 00P`;
    return `${sign}${hh}h ${String(mm).padStart(2, '0')}P`;
}

/** 'YYYY-MM-DD' → '03/09'. */
export function fmtShortDate(iso: string | null): string {
    if (!iso) return '—';
    const [, m, d] = iso.split('-');
    return m && d ? `${d}/${m}` : iso;
}

/** 'YYYY-MM' dịch đi `delta` tháng. */
export function shiftMonth(monthStr: string, delta: number): string {
    const [y, m] = monthStr.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** 'YYYY-MM' của tháng hiện tại theo giờ VN. */
export function currentMonthVn(): string {
    const vn = new Date(Date.now() + 7 * 60 * 60 * 1000);
    return `${vn.getUTCFullYear()}-${String(vn.getUTCMonth() + 1).padStart(2, '0')}`;
}
