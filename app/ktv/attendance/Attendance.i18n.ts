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
    checkOutPhotoOptional: 'Chụp ảnh (tùy chọn)',
    cannotCheckOutYet: (time: string) => `Chưa tới giờ tan ca. Bạn có thể tan ca từ ${time}`,
    noShiftAssigned: 'Bạn chưa được gán ca — vui lòng liên hệ quản lý.',

    // Late / Warning string
    lateWarning: '⚠️ Bạn đang điểm danh trễ — vui lòng nhập lý do',
    reasonRequired: 'Lý do điểm danh trễ (*)',
    reasonPlaceholder: 'Ví dụ: Kẹt xe, do lý do cá nhân...',
    reasonOptional: 'Lý do/Ghi chú (tùy chọn)',
    reasonRequiredGeneral: 'Lý do/Ghi chú (*)',

    // Photo
    addPhoto: (count: number, max: number) => `Thêm ảnh (${count}/${max})`,
    openCamera: 'Mở Camera Điện Thoại',
    photoRequired: 'Chụp ảnh minh chứng (*)',

    // Rejected
    rejectedTitle: '❌ Admin đã từ chối',
    rejectedDesc: 'Vui lòng liên hệ quản lý để được hỗ trợ',
    retry: 'Thử lại',

    // Checked out
    checkedOutTitle: 'Đã tan ca',
    checkedOutDesc: 'Cảm ơn bạn đã làm việc hôm nay!',
} as const;
