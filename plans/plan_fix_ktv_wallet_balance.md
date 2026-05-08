# Kế hoạch đồng bộ hóa Số dư Ví KTV (Tạm thời)

## Vấn đề hiện tại
- **Mâu thuẫn dữ liệu**: "Số dư hiện tại" trên giao diện KTV Wallet hiển thị sai (cao hơn thực tế), trong khi "Lịch sử giao dịch" (Timeline) tính toán đúng.
- **Nguyên nhân gốc rễ**: 
  - API `balance` sử dụng cơ chế lai (Hybrid) giữa dữ liệu đã chốt trong `KTVDailyLedger` và đơn hàng thực tế (Realtime). Do lỗi tính toán mốc thời gian, các đơn hàng của "ngày hôm nay" bị tính trùng (double count) cả trong Ledger và Realtime.
  - API `balance` cộng gộp các khoản Điều chỉnh (WalletAdjustments) và Rút tiền (KTVWithdrawals) từ toàn bộ lịch sử, thay vì từ mốc bắt đầu `2026-05-04` như API `timeline`.

## Giải pháp triển khai (Tạm thời)
Nhằm giải quyết triệt để lỗi hiển thị tức thời cho người dùng, đảm bảo số dư tổng khớp 100% với lịch sử:
1. **Đồng nhất cơ chế**: Chỉnh sửa API `/api/ktv/wallet/balance/route.ts` để loại bỏ việc đọc từ `KTVDailyLedger`. 
2. **Tính toán Realtime toàn phần**: API `balance` sẽ tính lại toàn bộ tiền tua từ bảng `Bookings` và `BookingItems` bắt đầu từ mốc thời gian `2026-05-04` (tương tự như API `timeline`).
3. **Đồng bộ mốc thời gian**: Giới hạn việc truy vấn dữ liệu từ bảng `WalletAdjustments` và `KTVWithdrawals` cũng từ mốc `2026-05-04`.

*Lưu ý: Đây là biện pháp tạm thời để fix bug khẩn cấp. Về lâu dài, cơ chế Daily Ledger cần được fix triệt để để giảm tải query cho database khi số lượng đơn hàng tăng lên.*
