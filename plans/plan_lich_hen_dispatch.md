# Kế hoạch phát triển: Tính năng Lịch Hẹn (Pre-Bookings) tại trang Dispatch

## 1. Bối cảnh & Mục tiêu
Tính năng "Khách liên hệ trước" (Pre-bookings) trước đây nằm ở Web Nội Bộ (`wrb-noi-bo-dev`) sắp bị gỡ bỏ khỏi nhánh test. Do đó, cần chuyển giao việc quản lý và xem khách hẹn trước về màn hình **Giám sát điều phối (Dispatch Board)** trên app Quản Trị (`Quan_Tri_Va_KTV`). 
Khi Lễ tân (Quản trị) bấm vào một khách hẹn, hệ thống sẽ mở tab Web Nội Bộ ra và tự động truyền thông tin khách hàng sang để giữ nguyên luồng Auto-fill thông tin.

---

## 2. Các thay đổi đề xuất

### 2.1. Cập nhật Data Schema (`TableInSupabase.md`)
Bổ sung bảng `PreBookings` vào tài liệu tham chiếu để AI và Developer theo dõi dễ dàng. Bảng này gồm: `id`, `customer_name`, `customer_phone`, `guest_count`, `booking_date`, `booking_time`, `notes`, `status` ('PENDING', 'CONVERTED', 'CANCELLED').

### 2.2. Web Quản Trị (`Quan_Tri_Va_KTV`)
**Vị trí sửa đổi:** Màn hình Điều Phối `app/reception/dispatch`

1. **Thêm UI Lịch Hẹn (AppointmentScheduleModal):**
   - Thiết kế một Modal (hoặc Slide-over Panel bên phải) hiển thị danh sách Khách Hẹn.
   - Thêm nút "Lịch hẹn" (kèm badge hiển thị số lượng khách chưa phục vụ) lên khu vực Header của Dispatch Board.
   - **Chức năng trong Panel:**
     - Lọc và hiển thị danh sách `PreBookings` trong ngày (hoặc ngày mai) có `status = 'PENDING'`.
     - Chức năng thêm mới khách hẹn: Form nhập Tên, SĐT, Thời gian, Số khách, Ghi chú.
     - Nút hành động: "Tạo đơn trên Web".

2. **Chức năng chuyển hướng (Redirect tới Web Nội Bộ):**
   - Thêm biến môi trường `.env.local`: `NEXT_PUBLIC_WEB_NOI_BO_URL=http://localhost:3000` (dành cho DEV) và domain thực tế cho PROD.
   - Khi bấm "Tạo đơn trên Web": Tạo URL kèm parameters và mở New Tab:
     `{NEXT_PUBLIC_WEB_NOI_BO_URL}/vi/new-user/select-menu?preBookingId={id}&name={customer_name}&phone={customer_phone}&guests={guest_count}`

### 2.3. Web Nội Bộ (`wrb-noi-bo-dev`)
**Vị trí sửa đổi:** Layout hoặc Page nhận Redirect (VD: `src/app/[lang]/new-user/select-menu/page.tsx` hoặc một Client Component cấp cao).

- **Cơ chế Catch & Save:** 
  Khi trang load lên, dùng `useSearchParams()` để kiểm tra xem URL có truyền `preBookingId` và các tham số khách hàng không.
  Nếu có:
  - Tự động đóng gói và lưu vào `localStorage.setItem('contactedFirstInfo', JSON.stringify({ ... }))`.
  - Tuỳ chọn: Xoá params trên URL đi (replaceState) để URL sạch đẹp.
  - Sau đó luồng Checkout hiện tại của Web Nội Bộ sẽ tự động Auto-fill thông tin như bình thường (không cần sửa Checkout).

---

## 3. Các bước thực thi dự kiến (Execution)
- [ ] Bổ sung bảng `PreBookings` vào `TableInSupabase.md`.
- [ ] Code UI `AppointmentScheduleModal` tại Web Quản Trị (đọc/thêm data vào Supabase).
- [ ] Thêm nút vào Header của `KanbanBoard` hoặc `QuickDispatchTable` trong trang Dispatch.
- [ ] Viết hàm chuyển hướng, sử dụng `NEXT_PUBLIC_WEB_NOI_BO_URL`.
- [ ] Sang dự án `wrb-noi-bo-dev`: Viết logic bắt query parameters ở file `select-menu/page.tsx` và lưu vào localStorage.

---

> [!IMPORTANT]
> **User Review Required:**
> 1. Anh/chị có muốn đặt nút "Lịch hẹn" ở vị trí cụ thể nào trên trang Điều phối không? (Góc trên bên phải cạnh bộ lọc ngày, hay nằm bên trong AddOrderModal?)
> 2. Tab mới của Web Nội Bộ sẽ bay thẳng vào trang `select-menu` (Chọn dịch vụ) là chuẩn nhất đúng không ạ?
