/**
 * Text dictionary for KTV Attendance page.
 */
export const t = {
    pageTitle: 'Chấm Công',
    pageSubtitle: 'Bấm nút để ghi nhận vị trí và thông báo quản lý.',
    loadingStatus: 'Đang kiểm tra trạng thái...',
    noAccess: 'Không có quyền truy cập',

    // IDLE
    startShift: 'Bắt đầu ca làm việc',
    gpsNote: 'Hệ thống sẽ ghi nhận vị trí GPS của bạn',
    checkIn: 'ĐIỂM DANH',

    // Loading
    loadingGPS: 'Đang lấy vị trí GPS...',

    // Pending
    pendingTitle: 'Đang chờ xác nhận',
    pendingDesc: 'Admin đang kiểm tra vị trí GPS của bạn',
    viewLocation: 'Vị trí của bạn',
    sentAt: (time: string) => `Gửi lúc: ${time}`,

    // Confirmed
    confirmedTitle: '✅ Đã điểm danh',
    confirmedDesc: 'Admin đã xác nhận vị trí của bạn',
    viewMapLocation: 'Xem vị trí',
    shiftStart: (time: string) => `Vào ca: ${time}`,
    checkOut: 'TAN CA',

    // Rejected
    rejectedTitle: '❌ Admin đã từ chối',
    rejectedDesc: 'Vui lòng liên hệ quản lý để được hỗ trợ',
    retry: 'Thử lại',

    // Checked out
    checkedOutTitle: 'Đã tan ca',
    checkedOutDesc: 'Cảm ơn bạn đã làm việc hôm nay!',
} as const;
