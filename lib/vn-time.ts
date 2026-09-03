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
 * Check if a registration for workDate can still be edited.
 * Rule: đăng ký / sửa / hủy lịch ngày D được phép đến HẾT ngày D-1,
 * khóa đúng 00:00 (nửa đêm) giờ VN của ngày D.
 * VD: 23:59 ngày 02/09 vẫn sửa được 03/09; 00:00 ngày 03/09 thì đóng băng.
 * @param workDate string format 'yyyy-MM-dd'
 */
export function canEditRegistration(workDateStr: string): boolean {
  return workDateStr > vnToday();
}
