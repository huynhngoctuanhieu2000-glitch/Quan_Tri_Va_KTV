import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

const VN_TIMEZONE = 'Asia/Ho_Chi_Minh';

/**
 * Returns current Date object in VN timezone
 */
export const vnNow = (): Date => {
  return toZonedTime(new Date(), VN_TIMEZONE);
};

/**
 * Returns today's date string in VN timezone (yyyy-MM-dd)
 */
export const vnToday = (): string => {
  return format(vnNow(), 'yyyy-MM-dd');
};

/**
 * Returns current hour (0-23) in VN timezone
 */
export const vnHour = (): number => {
  return parseInt(format(vnNow(), 'HH'), 10);
};

/**
 * Sửa / huỷ lịch ngày D được phép đến 06:59 sáng chính ngày D.
 * Từ 07:00 thì đóng băng — chỉ còn quyền BÁO TRỄ 1 lần.
 *
 * @param workDateStr 'yyyy-MM-dd'
 */
export function canEditRegistration(workDateStr: string): boolean {
  const today = vnToday();
  if (workDateStr > today) return true;
  if (workDateStr === today && vnHour() < 7) return true;
  return false;
}

/** Hạn chót đổi lịch MIỄN PHẠT: 12:00 trưa ngày HÔM TRƯỚC ngày làm. */
export const OFF_FREE_DEADLINE_HOUR = 12;

export type RegistrationEditWindow =
  | 'FREE'      // còn trong hạn — đổi thoải mái, không phạt
  | 'PENALTY'   // quá hạn nhưng chưa tới 07:00 ngày làm — đổi được nhưng bị trừ 5 giờ
  | 'LOCKED';   // từ 07:00 ngày làm — hết quyền đổi, chỉ còn báo trễ

/**
 * Đổi lịch ngày D đang nằm ở khung nào.
 *
 *   ... → 12:00 ngày D-1    : FREE     — huỷ / chuyển OFF thoải mái
 *   12:00 D-1 → 07:00 D     : PENALTY  — vẫn đổi được, TRỪ 5 GIỜ tích lũy
 *   từ 07:00 ngày D         : LOCKED   — chỉ còn báo trễ 1 lần
 *
 * Mốc 12:00 lấy của ngày HÔM TRƯỚC vì spa mở cửa 09:00 — cho huỷ miễn phí
 * tới trưa ngày làm thì đã mở cửa 3 tiếng mà vẫn hụt người, lễ tân không
 * kịp xoay ca.
 *
 * @param workDateStr    'yyyy-MM-dd' — ngày làm việc đang sửa
 * @param deadlineHour   giờ hạn chót ngày D-1 (mặc định 12)
 */
export function getRegistrationEditWindow(
  workDateStr: string,
  deadlineHour: number = OFF_FREE_DEADLINE_HOUR,
): RegistrationEditWindow {
  const today = vnToday();
  const hour = vnHour();

  // Ngày làm ở tương lai xa (từ D-2 trở về trước) → luôn miễn phạt.
  const dayBefore = new Date(`${workDateStr}T00:00:00Z`);
  dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
  const dayBeforeStr = dayBefore.toISOString().slice(0, 10);

  if (today < dayBeforeStr) return 'FREE';
  if (today === dayBeforeStr) return hour < deadlineHour ? 'FREE' : 'PENALTY';

  // Đã sang chính ngày làm.
  if (today === workDateStr) return hour < 7 ? 'PENALTY' : 'LOCKED';

  // Ngày làm đã qua.
  return 'LOCKED';
}
