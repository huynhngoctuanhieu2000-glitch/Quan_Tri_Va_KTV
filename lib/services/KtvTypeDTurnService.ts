import { SupabaseClient } from '@supabase/supabase-js';

// 🔧 CONFIGURATION
const DONE_STATUSES = ['DONE', 'COMPLETED', 'FEEDBACK', 'CLEANING'];
const VN_TIMEZONE = 'Asia/Ho_Chi_Minh';

export class KtvTypeDTurnService {

    /**
     * Calculate ACTUAL working minutes for a KTV in a booking item.
     *
     * Priority:
     * 1. customCommissionDuration (admin override)
     * 2. actualStartTime → actualEndTime (real time KTV worked)
     * 3. seg.duration (assigned duration, fallback)
     *
     * NOTE: This is DIFFERENT from KtvCommissionService.calculateItemDuration()
     * which always uses assigned time for commission (don't overpay slow workers).
     * This function uses ACTUAL time for RANKING to reflect real effort.
     */
    static calculateActualMinutes(item: any, techCode: string): number {
        let segs: any[] = [];
        try {
            segs = typeof item.segments === 'string' ? JSON.parse(item.segments) : (item.segments || []);
        } catch { }

        const mySegs = segs.filter((seg: any) =>
            seg.ktvId && seg.ktvId.toLowerCase().includes(techCode.toLowerCase())
        );

        if (mySegs.length === 0) return 0;

        return mySegs.reduce((sum: number, seg: any) => {
            // Priority 1: Admin override
            if (seg.customCommissionDuration) {
                return sum + Number(seg.customCommissionDuration);
            }

            // Priority 2: Actual time (KTV làm bao lâu tính bấy nhiêu)
            if (seg.actualStartTime && seg.actualEndTime) {
                const t1 = new Date(seg.actualStartTime).getTime();
                const t2 = new Date(seg.actualEndTime).getTime();
                if (!isNaN(t1) && !isNaN(t2) && t2 > t1) {
                    return sum + Math.round((t2 - t1) / 60000);
                }
            }

            // Priority 3: Assigned duration (fallback)
            return sum + (Number(seg.duration) || 0);
        }, 0);
    }

    /**
     * Get today's date string in Vietnam timezone (YYYY-MM-DD)
     */
    private static getVnTodayStr(): string {
        const now = new Date();
        const vnNow = new Date(now.toLocaleString('en-US', { timeZone: VN_TIMEZONE }));
        return vnNow.getFullYear() + '-' +
            String(vnNow.getMonth() + 1).padStart(2, '0') + '-' +
            String(vnNow.getDate()).padStart(2, '0');
    }

    /**
     * ==========================================
     * SINGLE SOURCE OF TRUTH (Hướng B)
     * ==========================================
     * "How many net hours has this Type D KTV worked this month?"
     *
     * Formula:
     *   net_hours = Σ(hours_earned - hours_penalty)  ← KTVServiceHoursLedger (past days, from nightly cron)
     *             + today's earned hours              ← Bookings (real-time, today only)
     *             + today's penalty hours              ← KTVServiceHoursLedger (today, penalty rows)
     *
     * Constraints:
     *   - Only count entries where date >= Staff.work_type_effective_from
     *   - Exclude is_utility services
     *   - Use ACTUAL duration (not assigned)
     *   - Clamp to Math.max(0, ...)
     *   - Reset monthly (automatic via date filtering)
     *
     * Called by: turns/route.ts, service-hours/route.ts, finance reports
     * EVERY consumer MUST use this function — no independent calculations.
     */
    static async getMonthlyNetHours(
        supabase: SupabaseClient,
        staffIds: string[],
        month: number,
        year: number
    ): Promise<Record<string, number>> {
        if (staffIds.length === 0) return {};

        const result: Record<string, number> = {};
        for (const id of staffIds) result[id] = 0;

        // --- Effective dates (for work_type change reset) ---
        const { data: staffData } = await supabase
            .from('Staff')
            .select('id, work_type_effective_from')
            .in('id', staffIds);

        const effectiveDateMap: Record<string, string> = {};
        (staffData || []).forEach((s: any) => {
            effectiveDateMap[s.id] = s.work_type_effective_from || '2020-01-01';
        });

        const firstOfMonth = `${year}-${String(month).padStart(2, '0')}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        const lastOfMonth = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

        // Detect if this is the current month
        const todayStr = KtvTypeDTurnService.getVnTodayStr();
        const todayParts = todayStr.split('-');
        const isCurrentMonth = parseInt(todayParts[1]) === month && parseInt(todayParts[0]) === year;

        if (isCurrentMonth) {
            // === CURRENT MONTH: Ledger (past days) + Realtime (today) ===

            // Part A: Ledger for past days (exclude today to avoid double-counting earned rows)
            const { data: pastLedger } = await supabase
                .from('KTVServiceHoursLedger')
                .select('staff_id, date, hours_earned, hours_penalty')
                .in('staff_id', staffIds)
                .gte('date', firstOfMonth)
                .lt('date', todayStr);

            if (pastLedger) {
                for (const row of pastLedger) {
                    const effectiveDate = effectiveDateMap[row.staff_id] || '2020-01-01';
                    if (row.date >= effectiveDate) {
                        result[row.staff_id] += (Number(row.hours_earned) || 0) - (Number(row.hours_penalty) || 0);
                    }
                }
            }

            // Part B: Today's penalties from ledger (penalty rows have booking_id = NULL)
            const { data: todayPenalties } = await supabase
                .from('KTVServiceHoursLedger')
                .select('staff_id, hours_penalty')
                .in('staff_id', staffIds)
                .eq('date', todayStr)
                .is('booking_id', null);

            if (todayPenalties) {
                for (const row of todayPenalties) {
                    const effectiveDate = effectiveDateMap[row.staff_id] || '2020-01-01';
                    if (todayStr >= effectiveDate) {
                        result[row.staff_id] -= (Number(row.hours_penalty) || 0);
                    }
                }
            }

            // Part C: Today's earned from Bookings (real-time)
            const { data: services } = await supabase
                .from('Services')
                .select('id, is_utility');
            const utilitySet = new Set<string>();
            (services || []).forEach((s: any) => {
                if (s.is_utility) utilitySet.add(String(s.id));
            });

            const { data: bookings } = await supabase
                .from('Bookings')
                .select(`
                    id, timeStart, status,
                    BookingItems!fk_bookingitems_booking ( id, serviceId, technicianCodes, segments, status )
                `)
                .gte('timeStart', `${todayStr}T00:00:00+07:00`)
                .lte('timeStart', `${todayStr}T23:59:59.999+07:00`)
                .neq('status', 'CANCELLED');

            for (const staffId of staffIds) {
                const effectiveDate = effectiveDateMap[staffId] || '2020-01-01';
                if (todayStr < effectiveDate) continue;

                const techCode = staffId.toLowerCase();
                let todayMinutes = 0;

                (bookings || []).forEach((b: any) => {
                    const items = (b.BookingItems || []).filter((i: any) =>
                        i.technicianCodes &&
                        Array.isArray(i.technicianCodes) &&
                        i.technicianCodes.some((tc: string) => tc.toLowerCase().includes(techCode)) &&
                        DONE_STATUSES.includes(i.status) &&
                        !utilitySet.has(String(i.serviceId)) // Exclude utility services
                    );

                    items.forEach((item: any) => {
                        const mins = KtvTypeDTurnService.calculateActualMinutes(item, techCode);
                        if (mins > 0) todayMinutes += mins;
                    });
                });

                result[staffId] += todayMinutes / 60;
            }
        } else {
            // === PAST MONTH: Ledger only (full month) ===
            const { data: ledgerData } = await supabase
                .from('KTVServiceHoursLedger')
                .select('staff_id, date, hours_earned, hours_penalty')
                .in('staff_id', staffIds)
                .gte('date', firstOfMonth)
                .lte('date', lastOfMonth);

            if (ledgerData) {
                for (const row of ledgerData) {
                    const effectiveDate = effectiveDateMap[row.staff_id] || '2020-01-01';
                    if (row.date >= effectiveDate) {
                        result[row.staff_id] += (Number(row.hours_earned) || 0) - (Number(row.hours_penalty) || 0);
                    }
                }
            }
        }

        // --- Clamp to 0 (không cho giờ tích lũy âm) ---
        for (const id of staffIds) {
            result[id] = Math.max(0, result[id] || 0);
        }

        return result;
    }

    /**
     * Gets the TurnQueue for TYPE_D KTVs on a specific date,
     * sorted by monthly accumulated hours (DESC).
     *
     * Tie-break:
     *   1. net_hours       DESC (nhiều giờ đứng trước)
     *   2. check_in_order  ASC  (ai đến trước)
     *   3. employee_id     ASC  (chốt chặn, thứ tự không nhảy)
     */
    static async getTurnQueue(supabase: SupabaseClient, date: string) {
        const { data: queueData, error: queueError } = await supabase
            .from('TurnQueue')
            .select(`
                *,
                Staff!inner (
                    id,
                    work_type,
                    work_type_effective_from
                )
            `)
            .eq('date', date)
            .eq('Staff.work_type', 'TYPE_D');

        if (queueError) throw queueError;
        if (!queueData || queueData.length === 0) return [];

        const staffIds = queueData.map(q => q.employee_id);

        // Get current month/year from VN timezone
        const now = new Date();
        const vnNow = new Date(now.toLocaleString('en-US', { timeZone: VN_TIMEZONE }));
        const month = vnNow.getMonth() + 1;
        const year = vnNow.getFullYear();

        const hoursMap = await KtvTypeDTurnService.getMonthlyNetHours(supabase, staffIds, month, year);

        const enrichedQueue = queueData.map(q => ({
            ...q,
            monthly_hours: hoursMap[q.employee_id] || 0
        }));

        // Sort: monthly_hours DESC → check_in_order ASC → employee_id ASC
        enrichedQueue.sort((a, b) => {
            if (b.monthly_hours !== a.monthly_hours) {
                return b.monthly_hours - a.monthly_hours;
            }
            if ((a.check_in_order || 0) !== (b.check_in_order || 0)) {
                return (a.check_in_order || 0) - (b.check_in_order || 0);
            }
            return a.employee_id.localeCompare(b.employee_id);
        });

        return enrichedQueue;
    }
}
