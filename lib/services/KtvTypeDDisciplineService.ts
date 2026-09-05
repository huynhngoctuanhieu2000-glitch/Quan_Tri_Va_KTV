import { SupabaseClient } from '@supabase/supabase-js';
import { TYPE_D_DISCIPLINE_PENALTIES } from '../constants/staff.constants';

/**
 * ================================================================
 * KỶ LUẬT TRỪ GIỜ TÍCH LŨY — LOẠI D
 * ================================================================
 * Ghi vào `KTVDPenaltyLedger`. `KtvDLedgerReader.netHoursByStaff()` trừ các
 * dòng này khỏi giờ làm:
 *
 *   giờ ròng = Σ KTVDTurnLedger.actual_minutes/60 − Σ hours_penalty
 *
 * Trước đây ghi vào `KTVServiceHoursLedger` — bảng trộn chung dòng làm và
 * dòng phạt, đang được gỡ bỏ (xem plans/plan_ktvd_turn_ledger.md §3.5).
 *
 * Mức phạt lấy từ `TYPE_D_DISCIPLINE_PENALTIES`, khớp với quy chế:
 *   · Bỏ lịch đã đăng ký (không báo / báo trễ)  → −10 giờ
 *   · Báo vắng / chuyển OFF sau hạn miễn phạt   →  −5 giờ
 *   · Đến trễ hơn giờ đã báo trễ                →  −5 giờ
 *   · Từ chối tua đã gán                        → −3× thời lượng gói
 */

export type DailyViolationType = 'ABSENT_NO_NOTICE' | 'ABSENT_EARLY_NOTICE' | 'LATE_NO_UPDATE';

/** Khoá cấu hình hệ số phạt từ chối tua trong `SystemConfigs`. */
export const REJECT_MULTIPLIER_KEY = 'ktv_typed_reject_multiplier';

export class KtvTypeDDisciplineService {

    /**
     * Hệ số phạt khi từ chối tua đã gán: gói 60 phút × hệ số 3 → trừ 3 giờ.
     *
     * Admin chỉnh được ở Cài đặt → Tính năng. Cấu hình hỏng hoặc <= 0 thì lùi
     * về hằng số quy chế, không để hệ số 0 biến hình phạt thành vô hiệu.
     */
    static async getRejectMultiplier(supabase: SupabaseClient): Promise<number> {
        try {
            const { data } = await supabase
                .from('SystemConfigs').select('value').eq('key', REJECT_MULTIPLIER_KEY).maybeSingle();
            const n = Number((data as any)?.value);
            if (Number.isFinite(n) && n > 0) return n;
        } catch { /* dùng mặc định bên dưới */ }
        return TYPE_D_DISCIPLINE_PENALTIES.ORDER_REJECT_MULTIPLIER;
    }

    /**
     * Phạt trừ giờ theo NGÀY (vắng, trễ) — không gắn với đơn nào.
     *
     * Idempotent: `UNIQUE(staff_id, work_date, penalty_type)` nên gọi lại
     * cùng một loại lỗi trong cùng ngày chỉ cập nhật, không trừ hai lần.
     */
    static async deductDailyViolation(
        supabase: SupabaseClient,
        staffId: string,
        workDate: string,               // YYYY-MM-DD, theo NGÀY LÀM VIỆC
        violationType: DailyViolationType,
        note?: string,
        createdBy?: string,
    ) {
        const hoursPenalty = TYPE_D_DISCIPLINE_PENALTIES[violationType];

        const { error } = await supabase
            .from('KTVDPenaltyLedger')
            .upsert({
                staff_id: staffId,
                work_date: workDate,
                penalty_type: violationType,
                hours_penalty: hoursPenalty,
                money_penalty: 0,
                note: note || `Vi phạm: ${violationType}`,
                created_by: createdBy || null,
            }, { onConflict: 'staff_id,work_date,penalty_type' });

        if (error) {
            console.error('[Type D] Lỗi ghi phạt ngày:', error);
            throw error;
        }
        return hoursPenalty;
    }

    /**
     * Phạt TỪ CHỐI TUA ĐÃ GÁN — trừ gấp 3 lần thời lượng gói dịch vụ.
     * Gói 60 phút → trừ 3 giờ.
     *
     * ⚠️ Khoá idempotency là `(staff_id, work_date, penalty_type)`, nên KTV từ
     * chối nhiều tua trong CÙNG một ngày thì các lần sau ghi đè lần trước chứ
     * không cộng dồn. Vì vậy phải cộng tay vào dòng đang có.
     */
    static async deductOrderReject(
        supabase: SupabaseClient,
        staffId: string,
        workDate: string,
        bookingItemId: string,
        serviceDurationMins: number,
        createdBy?: string,
        multiplier?: number,
    ) {
        const factor = Number.isFinite(multiplier as number) && (multiplier as number) > 0
            ? (multiplier as number)
            : await KtvTypeDDisciplineService.getRejectMultiplier(supabase);
        const thisPenalty = (serviceDurationMins / 60) * factor;

        const { data: existing } = await supabase
            .from('KTVDPenaltyLedger')
            .select('hours_penalty, note')
            .eq('staff_id', staffId)
            .eq('work_date', workDate)
            .eq('penalty_type', 'ORDER_REJECT')
            .maybeSingle();

        const total = Number(existing?.hours_penalty || 0) + thisPenalty;
        const note = [existing?.note, `${bookingItemId} (${serviceDurationMins}p → ${thisPenalty}h)`]
            .filter(Boolean).join('; ');

        const { error } = await supabase
            .from('KTVDPenaltyLedger')
            .upsert({
                staff_id: staffId,
                work_date: workDate,
                penalty_type: 'ORDER_REJECT',
                hours_penalty: total,
                money_penalty: 0,
                note: `Từ chối tua: ${note}`.slice(0, 500),
                created_by: createdBy || null,
            }, { onConflict: 'staff_id,work_date,penalty_type' });

        if (error) {
            console.error('[Type D] Lỗi ghi phạt từ chối tua:', error);
            throw error;
        }
        return thisPenalty;
    }

    /**
     * Dấu mốc KHOÁ TÀI KHOẢN — `hours_penalty = 0`, không phải khoản phạt.
     *
     * Để lịch sử ngày-theo-ngày còn vết sau khi tài khoản đã được mở khoá:
     * `lockInfo` ở màn hình điểm danh chỉ hiện lúc đang bị khoá, mở khoá xong
     * là mất dấu.
     */
    static async markAccountLock(
        supabase: SupabaseClient,
        staffId: string,
        workDate: string,
        reason: string,
    ) {
        const { error } = await supabase
            .from('KTVDPenaltyLedger')
            .upsert({
                staff_id: staffId,
                work_date: workDate,
                penalty_type: 'ACCOUNT_LOCK',
                hours_penalty: 0,
                money_penalty: 0,
                note: reason,
            }, { onConflict: 'staff_id,work_date,penalty_type' });

        if (error) console.error('[Type D] Lỗi ghi dấu khoá tài khoản:', error);
    }
}
