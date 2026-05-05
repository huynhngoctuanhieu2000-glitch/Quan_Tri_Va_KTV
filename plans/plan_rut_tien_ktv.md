# Kế hoạch & Phân tích tính năng: Quản Lý Thu Nhập & Rút Tiền KTV

Theo các yêu cầu mới nhất, tính năng này không chỉ đơn thuần là "Rút tiền" mà là một hệ thống **Ví Điện Tử Thu Nhỏ (KTV Wallet)** kết hợp **Quản lý Tài chính (Finance)** cho bộ phận Kế toán. Để đảm bảo an toàn và không gây lỗi cho hệ thống hiện tại, tiến trình sẽ được chia thành **3 Pha (Phases)**.

---

## 🛑 Rủi ro & Giải pháp Kiến trúc (Core Architecture)

1. **Rủi ro tính toán sai lệch:** Hiện tại Tiền Tua, Tiền Tip, Tiền Bonus nằm rải rác ở các bảng khác nhau (`TurnLedger`, `BookingItems`...). Nếu Query thẳng từ Frontend sẽ rất chậm và dễ sai số.
2. **Giải pháp (Hợp nhất dữ liệu - Lịch sử giao dịch):**
   - Chúng ta sẽ tạo một **Database View** hoặc **RPC Function** (ví dụ: `get_ktv_wallet_transactions`) để `UNION` (Gộp) tất cả các nguồn tiền lại thành một luồng Lịch sử (Timeline) duy nhất.
   - Luồng tiền VÀO (+): Tiền Tua, Tiền Tip, Tiền Bonus.
   - Luồng tiền RA (-): Rút tiền.
3. **Giải pháp chặn Race Condition & Tiền Cọc:**
   - Số dư ví (Tổng tiền KTV đang có) = `SUM(Tiền Vào)` - `SUM(Tiền Ra + Đang chờ duyệt)`.
   - **Tiền Vào (+):** Bao gồm Tiền Tua, Tiền Tip, và **Các khoản điều chỉnh cộng (GIFT/ADJUSTMENT)**.
   - **Tiền Ra (-):** Bao gồm Lệnh rút đã duyệt và **Các khoản điều chỉnh trừ (PENALTY/ADJUSTMENT)**.
   - **Validation khi rút tiền:** `Số dư ví - Số tiền muốn rút >= Cọc (500k)`. Nếu vi phạm (VD: Có 565k muốn rút 68k -> còn 497k < 500k), sẽ block và hiện popup thông báo: *"Số dư ví sau khi rút phải còn tối thiểu 500.000đ tiền cọc"*.
   - **Nguyên tắc Audit Trail (Bắt buộc):** Hệ thống tài chính **KHÔNG XOÁ/SỬA** bản ghi. Nếu nhập sai, Admin phải tạo lệnh **Đảo ngược (Reverse)** để bù trừ. Mọi biến động tiền đều phải để lại dấu vết.
   - **Chống Spam/Trùng lặp:** Chỉ cho phép 1 lệnh rút tiền ở trạng thái `PENDING` cho mỗi KTV. Nếu KTV bấm liên tục (spam click) tạo ra nhiều request cùng lúc, Backend sẽ chặn lại và trả về thông báo khéo léo: *"Hệ thống đang quá tải, vui lòng thử lại sau"* để tránh làm KTV hoang mang.

---

## 🚀 Lộ Trình Triển Khai (Phases)

### 🟢 PHA 1: Nền tảng Rút tiền & Phân quyền bảo mật
*Mục tiêu: Đưa tính năng rút tiền vào hoạt động, đảm bảo chỉ KTV được phép mới nhìn thấy và sử dụng.*

**1. Database & Security:**
- Cập nhật bảng `Users` (cột `permissions`): Thêm quyền `KTV_WITHDRAWAL_ACCESS`.
- Thêm `KTV_MINIMUM_DEPOSIT` (500,000đ) vào bảng `SystemConfigs`.
- Tạo bảng **`KTVWithdrawals`** (Quản lý rút tiền: `id`, `staff_id`, `amount`, `status`, `request_date`,...).
- Tạo bảng **`WalletAdjustments`** (Quản lý nạp/trừ tiền: `id`, `staff_id`, `amount`, `type`, `reason`, `created_by`,...).

**2. UI Admin (Phân quyền & Điều chỉnh):**
- Cập nhật Popup "Phân quyền chi tiết": Thêm checkbox `[x] Thu Nhập & Rút Tiền` vào nhóm **Kỹ Thuật Viên** hoặc **Tài Chính & Kế Toán**.
- **Màn hình Nạp/Trừ tiền:** Cho phép Admin nhập số tiền cộng/trừ, chọn loại (Tặng/Phạt/Điều chỉnh) và ghi chú lý do.

**3. UI KTV (Cơ bản):**
- Ẩn/Hiện menu "Ví / Thu Nhập" theo quyền truy cập.
- **Thẻ Số Dư:** Hiển thị **Số Dư Ví** (Số tiền thực tế KTV đang có).
- **Form yêu cầu rút tiền:** Khi bấm Rút tiền, hệ thống check `Số dư ví - Tiền rút >= 500k`. Nếu vi phạm sẽ chặn lại và hiện Popup cảnh báo.

**4. UI Admin (Quản lý Rút tiền):**
- Màn hình duyệt lệnh rút tiền (Tabs: Chờ duyệt, Đã duyệt, Từ chối).
- Logic duyệt (Approve) và Từ chối (Reject - kèm lý do).

---

### 🟡 PHA 2: Lịch sử Giao Dịch KTV (Ví KTV Timeline)
*Mục tiêu: Xây dựng màn hình lịch sử giống hình ảnh thiết kế (Gom nhóm theo tháng, biến động số dư).*

**1. Backend (API/RPC):**
- Viết RPC `get_ktv_wallet_timeline(ktv_id, month, year)`.
- Hàm này gom dữ liệu từ:
  - `TurnLedger`: Lấy ngày giờ + số tiền tua.
  - `BookingItems`: Lấy tiền tip của KTV.
  - `WalletAdjustments`: Lấy các khoản thưởng/phạt.
  - `KTVWithdrawals` (APPROVED): Lấy các khoản đã rút.

**2. UI KTV (Lịch sử giao dịch):**
- Giao diện dạng Timeline / Feed y hệt thiết kế mẫu.
- **Header:** Tháng 5/2026.
- **Item list:** 
  - Icon loại giao dịch (Tiền tua, Tiền Tip, Rút tiền).
  - Tiêu đề (VD: Tiền Tip đơn hàng NH-123).
  - Giờ, Ngày giao dịch.
  - Số tiền: `+ 150.000đ` (Màu xanh) hoặc `- 500.000đ` (Màu đen/đỏ).
  - Trạng thái (Thành công, Thất bại, Đang chờ).

---

### 🟠 PHA 3: Màn Hình Tài Chính KTV (Dành cho Admin/Kế Toán)
*Mục tiêu: Cung cấp bức tranh toàn cảnh về tài chính của tất cả KTV cho phòng Kế toán.*

**1. Backend (API/RPC):**
- Viết RPC `get_all_ktv_financial_summary(date_range)`.

**2. UI Admin (Phân hệ Finance):**
- Tạo trang mới: `/finance/ktv` (Quản lý tiền KTV).
- Bảng thống kê tổng hợp (DataGrid):
  - **KTV:** Tên & Mã KTV.
  - **Tiền Tua (+):** Tổng tiền tua trong kỳ.
  - **Tiền Tip (+):** Tổng tiền tip khách cho qua app/lễ tân.
  - **Tiền Bonus (+):** Các khoản thưởng thêm.
  - **Tổng thu nhập:** (Tua + Tip + Bonus).
  - **Đã rút (-):** Tổng số tiền đã thanh toán cho KTV.
  - **Tiền Tích Luỹ (Khả dụng):** Số tiền KTV còn trong hệ thống chưa rút.
- **Tính năng mở rộng:** Lọc theo tháng/tuần, Xuất báo cáo Excel (Export CSV).

---

> **💡 Lời khuyên từ AI Sparring Partner:** 
> Thiết kế chia Pha (Phases) này giúp chúng ta không bị ngợp, đảm bảo tính năng **Cốt lõi (Rút tiền - Pha 1)** chạy ổn định, không có bug mất tiền trước khi tiến hành ráp giao diện **Timeline phức tạp (Pha 2)** và **Báo cáo Kế toán (Pha 3)**.

> Bạn có đồng ý chốt kế hoạch 3 Pha này không? Nếu **DUYỆT**, tôi sẽ bắt tay ngay vào **PHA 1: Viết script SQL cho Database và Code UI Phân quyền Admin.**
