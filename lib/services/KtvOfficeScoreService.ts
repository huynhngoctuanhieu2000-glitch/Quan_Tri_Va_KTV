import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Điểm Office cho KTV Loại D.
 *
 * Hai thang đo song song, KHÔNG liên quan nhau:
 *  - Giờ tích lũy (KTVServiceHoursLedger) → quyết định thứ tự nhận tua.
 *  - Điểm Office (bảng này)               → quyết định mức miễn quỹ nội bộ 250k/tháng.
 *
 * Quy chế: public/regulations/type-d.html — mục "Bảng tự chấm điểm cuối ca".
 *
 * CÁCH TÍNH:
 *  - Điểm NGÀY:  mỗi ngày đi làm bắt đầu từ 100, trừ dần theo lỗi CỦA NGÀY ĐÓ.
 *  - Điểm THÁNG: TRUNG BÌNH điểm các ngày đi làm trong tháng, rồi trừ phạt lỗi lặp.
 *                Không phải bộ đếm chạy từ 100 xuống — là trung bình cộng.
 *  - Phạm vi kỳ: chỉ đọc phiếu trừ trong khoảng [đầu tháng, cuối tháng], nên lỗi
 *                tháng trước không ảnh hưởng tháng sau. Phạt lỗi lặp cũng chỉ đếm
 *                trong phạm vi 1 tháng.
 * Không cần job reset định kỳ — kỳ được quyết bởi bộ lọc `month` khi đọc.
 */

/** Cùng 1 lỗi lặp từ ngần này lần trong tháng thì bị trừ thêm. */
export const REPEAT_THRESHOLD = 3;

/** Quỹ nội bộ gốc mỗi tháng (đồng). */
export const FUND_BASE = 250_000;

/** Bậc miễn quỹ theo điểm tháng. Duyệt từ trên xuống, lấy bậc đầu tiên khớp. */
export const FUND_TIERS = [
    { min: 98, exemptPct: 100 },
    { min: 96, exemptPct: 50 },
    { min: 90, exemptPct: 30 },
    { min: 85, exemptPct: 10 },
    { min: 0, exemptPct: 0 },
] as const;

export interface OfficeHit {
    criteriaId: string;
    label: string;
    points: number;
    note: string | null;
    photoUrls: string[];
    byName: string;
    at: string;
    logId: string;
}

export interface OfficeDay {
    workDate: string;
    dayScore: number;
    hits: OfficeHit[];
}

export interface RepeatPenalty {
    criteriaId: string;
    label: string;
    times: number;
    points: number;
}

export interface OfficeMonth {
    staffId: string;
    workDays: number;
    cleanDays: number;
    avg: number;
    repeats: RepeatPenalty[];
    repeatPenalty: number;
    final: number;
    exemptPct: number;
    fundDue: number;
    days: OfficeDay[];
}

export interface HoursAggregate {
    /** Giờ làm THỰC trong dịch vụ (đã loại dịch vụ tiện ích). */
    earned: number;
    /** Giờ bị trừ do kỷ luật (nghỉ không báo, từ chối tua…). */
    penalty: number;
    /** earned − penalty. Có thể ÂM khi phạt nhiều hơn giờ làm — không cắt về 0
     *  để người xem thấy đúng tình trạng thay vì tưởng là chưa làm gì. */
    net: number;
    /** Số tua có phát sinh giờ làm. */
    turns: number;
    /** Số ngày có ít nhất 1 tua. */
    days: number;
    /** Ngày có tua gần nhất. */
    lastDate: string | null;
}

/**
 * Ai được sửa quy chế, chấm điểm cho ngày cũ và thu hồi phiếu.
 * Lễ tân chỉ chấm điểm theo quy chế có sẵn, trong hôm nay + hôm qua.
 * Nhận `Staff.role` thô (chữ hoa như trong DB), không phải roleId đã chuẩn hoá.
 */
export function isOfficeManager(role?: string | null): boolean {
    return ['ADMIN', 'DEV', 'MANAGER'].includes(String(role || '').toUpperCase());
}

/** 'YYYY-MM' của tháng hiện tại theo giờ VN. */
export function currentMonthVn(): string {
    const vn = new Date(Date.now() + 7 * 60 * 60 * 1000);
    return `${vn.getUTCFullYear()}-${String(vn.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Khoảng ngày [đầu tháng, cuối tháng] của chuỗi 'YYYY-MM'. */
export function monthRange(month: string): { from: string; to: string } {
    const [y, m] = month.split('-').map(Number);
    const last = new Date(y, m, 0).getDate();
    const mm = String(m).padStart(2, '0');
    return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, '0')}` };
}

export function fundTierOf(score: number) {
    const tier = FUND_TIERS.find(t => score >= t.min) || FUND_TIERS[FUND_TIERS.length - 1];
    return {
        exemptPct: tier.exemptPct,
        // Số tiền KTV CÒN PHẢI ĐÓNG (không phải số được miễn).
        fundDue: Math.round(FUND_BASE * (100 - tier.exemptPct) / 100),
    };
}

export class KtvOfficeScoreService {
    /**
     * Tính điểm Office tháng cho nhiều KTV cùng lúc.
     * Gom hết vào 2 query để tránh N+1 khi bảng danh sách có vài chục KTV.
     */
    static async computeMonth(
        supabase: SupabaseClient,
        staffIds: string[],
        month: string
    ): Promise<Map<string, OfficeMonth>> {
        const out = new Map<string, OfficeMonth>();
        if (staffIds.length === 0) return out;

        const { from, to } = monthRange(month);

        // 1. Các phiếu trừ điểm chưa bị thu hồi.
        const { data: logs, error: logErr } = await supabase
            .from('KTVOfficeScoreLog')
            .select('id, staff_id, work_date, criteria_id, criteria_label, points_deducted, note, photo_urls, created_by_name, created_at')
            .in('staff_id', staffIds)
            .gte('work_date', from)
            .lte('work_date', to)
            .is('revoked_at', null)
            .order('work_date', { ascending: false });
        if (logErr) throw logErr;

        // 2. Số ngày ĐI LÀM THỰC TẾ — mẫu số của điểm tháng. Ngày OFF không tính.
        const { data: att, error: attErr } = await supabase
            .from('KTVAttendance')
            .select('employeeId, date')
            .in('employeeId', staffIds)
            .gte('date', from)
            .lte('date', to)
            .in('checkType', ['CHECK_IN', 'LATE_CHECKIN']);
        if (attErr) throw attErr;

        const workDaysOf = new Map<string, Set<string>>();
        (att || []).forEach((a: any) => {
            if (!workDaysOf.has(a.employeeId)) workDaysOf.set(a.employeeId, new Set());
            workDaysOf.get(a.employeeId)!.add(a.date);
        });

        const logsOf = new Map<string, any[]>();
        (logs || []).forEach((l: any) => {
            if (!logsOf.has(l.staff_id)) logsOf.set(l.staff_id, []);
            logsOf.get(l.staff_id)!.push(l);
        });

        for (const staffId of staffIds) {
            out.set(staffId, this.buildMonth(staffId, logsOf.get(staffId) || [], workDaysOf.get(staffId) || new Set()));
        }
        return out;
    }

    /** Gộp các phiếu trừ của 1 KTV thành kết quả tháng. */
    private static buildMonth(staffId: string, logs: any[], attendedDates: Set<string>): OfficeMonth {
        // Gom phiếu theo ngày vi phạm.
        const byDate = new Map<string, OfficeHit[]>();
        for (const l of logs) {
            const hit: OfficeHit = {
                criteriaId: l.criteria_id,
                label: l.criteria_label,
                points: Number(l.points_deducted) || 0,
                note: l.note,
                photoUrls: Array.isArray(l.photo_urls) ? l.photo_urls : [],
                byName: l.created_by_name,
                at: l.created_at,
                logId: l.id,
            };
            if (!byDate.has(l.work_date)) byDate.set(l.work_date, []);
            byDate.get(l.work_date)!.push(hit);
        }

        // Mẫu số: ngày đi làm thực tế. Nếu chấm công thiếu mà vẫn có phiếu trừ,
        // vẫn phải đếm ngày đó, nếu không trung bình sẽ sai lệch có lợi cho KTV.
        const allDays = new Set<string>([...attendedDates, ...byDate.keys()]);

        // Mỗi ngày đi làm bắt đầu từ 100đ rồi trừ dần. Ngày sạch vẫn nằm trong danh
        // sách với 100đ để người xem đối chiếu được từng ngày, không chỉ ngày có lỗi.
        const days: OfficeDay[] = [...allDays]
            .map(workDate => {
                const hits = byDate.get(workDate) || [];
                return {
                    workDate,
                    dayScore: Math.max(0, 100 - hits.reduce((a, h) => a + h.points, 0)),
                    hits,
                };
            })
            .sort((a, b) => b.workDate.localeCompare(a.workDate));

        const workDays = days.length;
        const cleanDays = days.filter(d => d.hits.length === 0).length;

        const sum = days.reduce((a, d) => a + d.dayScore, 0);
        const avg = workDays > 0 ? sum / workDays : 100;

        // Phạt lỗi lặp — phương án A: cùng 1 lỗi từ 3 lần/tháng (rải rác bất kỳ,
        // không cần liên tiếp) thì trừ thêm ĐÚNG 1 LẦN điểm lỗi đó, dù lặp 3 hay 10 lần.
        const tally = new Map<string, { label: string; points: number; times: number }>();
        for (const l of logs) {
            const cur = tally.get(l.criteria_id);
            if (cur) cur.times++;
            else tally.set(l.criteria_id, { label: l.criteria_label, points: Number(l.points_deducted) || 0, times: 1 });
        }
        const repeats: RepeatPenalty[] = [...tally.entries()]
            .filter(([, v]) => v.times >= REPEAT_THRESHOLD)
            .map(([criteriaId, v]) => ({ criteriaId, label: v.label, times: v.times, points: v.points }));
        const repeatPenalty = repeats.reduce((a, r) => a + r.points, 0);

        const final = Math.max(0, avg - repeatPenalty);
        const { exemptPct, fundDue } = fundTierOf(final);

        return {
            staffId, workDays, cleanDays,
            avg: Math.round(avg * 100) / 100,
            repeats, repeatPenalty,
            final: Math.round(final * 10) / 10,
            exemptPct, fundDue,
            days,
        };
    }

    /**
     * Sổ cái giờ tích lũy của 1 KTV trong tháng, kèm số dư lũy kế theo thứ tự thời gian.
     */
    static async hoursLedger(supabase: SupabaseClient, staffId: string, month: string) {
        const { from, to } = monthRange(month);
        const { data, error } = await supabase
            .from('KTVServiceHoursLedger')
            .select('id, date, hours_earned, hours_penalty, penalty_type, booking_id, note, created_at')
            .eq('staff_id', staffId)
            .gte('date', from)
            .lte('date', to)
            .order('date', { ascending: true })
            .order('created_at', { ascending: true });
        if (error) throw error;

        let balance = 0;
        const rows = (data || []).map((r: any) => {
            const earned = Number(r.hours_earned) || 0;
            const penalty = Number(r.hours_penalty) || 0;
            balance += earned - penalty;
            return {
                id: r.id,
                date: r.date,
                earned,
                penalty,
                penaltyType: r.penalty_type,
                bookingId: r.booking_id,
                note: r.note,
                balance: Math.round(balance * 100) / 100,
            };
        });

        return { rows: rows.reverse(), total: Math.round(balance * 100) / 100 };
    }

    /** Tổng giờ tích lũy trong tháng cho nhiều KTV — dùng cho bảng xếp hạng. */
    static async hoursTotals(supabase: SupabaseClient, staffIds: string[], month: string): Promise<Map<string, number>> {
        const out = new Map<string, number>();
        staffIds.forEach(id => out.set(id, 0));
        if (staffIds.length === 0) return out;

        const { from, to } = monthRange(month);
        const { data, error } = await supabase
            .from('KTVServiceHoursLedger')
            .select('staff_id, hours_earned, hours_penalty')
            .in('staff_id', staffIds)
            .gte('date', from)
            .lte('date', to);
        if (error) throw error;

        (data || []).forEach((r: any) => {
            const cur = out.get(r.staff_id) || 0;
            out.set(r.staff_id, cur + (Number(r.hours_earned) || 0) - (Number(r.hours_penalty) || 0));
        });
        for (const [k, v] of out) out.set(k, Math.round(v * 100) / 100);
        return out;
    }

    /**
     * Giờ tích lũy CHI TIẾT của nhiều KTV — dùng cho bảng xếp hạng giờ làm.
     *
     * `range` bỏ trống = lũy kế toàn bộ lịch sử.
     *
     * ⚠️ Phải đọc theo TRANG: Supabase cắt mặc định ở 1000 dòng. Sổ giờ ghi 1 dòng
     * cho mỗi tua, nên một tháng của cả đội đã có thể vượt mốc này và bản lũy kế thì
     * chắc chắn vượt — thiếu trang sau là xếp hạng sai chứ không phải chỉ thiếu ít.
     */
    static async hoursBreakdown(
        supabase: SupabaseClient,
        staffIds: string[],
        range: { from?: string; to?: string } = {}
    ): Promise<Map<string, HoursAggregate>> {
        const out = new Map<string, HoursAggregate>();
        staffIds.forEach(id =>
            out.set(id, { earned: 0, penalty: 0, net: 0, turns: 0, days: 0, lastDate: null }));
        if (staffIds.length === 0) return out;

        const daysOf = new Map<string, Set<string>>();
        const PAGE = 1000;

        for (let page = 0; ; page++) {
            let q = supabase
                .from('KTVServiceHoursLedger')
                .select('id, staff_id, date, hours_earned, hours_penalty')
                .in('staff_id', staffIds)
                .order('date', { ascending: true })
                .order('id', { ascending: true })
                .range(page * PAGE, (page + 1) * PAGE - 1);
            if (range.from) q = q.gte('date', range.from);
            if (range.to) q = q.lte('date', range.to);

            const { data, error } = await q;
            if (error) throw error;
            const rows = (data || []) as any[];

            for (const r of rows) {
                const agg = out.get(r.staff_id);
                if (!agg) continue;
                const earned = Number(r.hours_earned) || 0;
                const penalty = Number(r.hours_penalty) || 0;
                agg.earned += earned;
                agg.penalty += penalty;
                // Dòng chỉ có phạt (từ chối tua, nghỉ không báo) không phải là một tua
                // đã làm, nên không tính vào số tua / số ngày công.
                if (earned > 0) {
                    agg.turns++;
                    if (!daysOf.has(r.staff_id)) daysOf.set(r.staff_id, new Set());
                    daysOf.get(r.staff_id)!.add(r.date);
                    if (!agg.lastDate || r.date > agg.lastDate) agg.lastDate = r.date;
                }
            }

            if (rows.length < PAGE) break;
        }

        const round2 = (n: number) => Math.round(n * 100) / 100;
        for (const [id, agg] of out) {
            agg.earned = round2(agg.earned);
            agg.penalty = round2(agg.penalty);
            agg.net = round2(agg.earned - agg.penalty);
            agg.days = daysOf.get(id)?.size ?? 0;
        }
        return out;
    }
}

/** Dịch mã phạt giờ sang tiếng Việt để lễ tân/KTV đọc được. */
export const HOURS_PENALTY_VI: Record<string, string> = {
    ABSENT_NO_NOTICE: 'Nghỉ đột xuất không báo',
    ABSENT_EARLY_NOTICE: 'Báo vắng trước 07:00',
    LATE_NO_UPDATE: 'Đến muộn hơn giờ đã báo',
    ORDER_REJECT: 'Từ chối tua đã gán',
};
