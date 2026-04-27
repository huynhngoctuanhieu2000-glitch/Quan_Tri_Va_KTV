# Tích Hợp & Nâng Cấp Giao Diện Lịch OFF KTV

Mục tiêu: Thiết kế lại giao diện xem lịch nghỉ phép (OFF) trên KTV Hub dành cho Lễ tân, giúp theo dõi trực quan số lượng KTV đi làm và nghỉ phép theo từng ngày.

## Yêu cầu người dùng (User Review Required)
> [!IMPORTANT]
> Bạn vui lòng xem qua bản kế hoạch này. Việc cập nhật sẽ thay đổi toàn bộ cấu trúc hiển thị của tab "Lịch OFF" sang một giao diện chuyên nghiệp hơn với bộ Lịch trực quan.

## Open Questions
> [!WARNING]
> 1. Trong ảnh mẫu số 2 (giao diện tối), số lượng "21 gia hạn off 27/4", "11 off 25-27/4"... các con số 21, 11, 2... có phải là **Mã Nhân Viên (KTV ID)** không? (Ví dụ KTV mã số 21, mã số 11...)
> 2. Giao diện chi tiết ngày (popup đen) nên là một Modal nổi lên giữa màn hình khi bấm vào ngày trên Lịch, hay là một Sidebar/Khu vực hiển thị cố định ngay bên dưới quyển lịch? (Mình đề xuất làm dạng phần hiển thị liền kề bên dưới để Lễ tân thao tác nhanh không bị che khuất).

## Proposed Changes

---

### [MODIFY] `app/reception/ktv-hub/page.tsx`
Cập nhật lại component `LeaveOffTab`:
1. **Gộp "Chờ Duyệt" và "Đã Xử Lý"**: 
   - Thay vì để hai danh sách dọc dài dòng, sẽ bọc chúng trong một component Thẻ dạng Accordion (Dropdown). Mặc định nếu có đơn "Chờ duyệt" thì phần đó sẽ tự động mở.
2. **Thêm Giao Diện Lịch (Calendar View)**:
   - Sử dụng dạng lưới 7 cột (Thứ 2 đến Chủ Nhật).
   - Mỗi ô ngày sẽ có các chấm màu (indicator) biểu thị có người nghỉ hoặc đi làm.
   - Khi click vào 1 ô ngày cụ thể, mở ra Box Chi Tiết Ngày ngay bên dưới.
3. **Box Chi Tiết Ngày (Dựa trên ảnh 2)**:
   - Giao diện nền tối (dark theme).
   - Hiển thị ngày tháng (VD: ❤️ 27/4).
   - Khối 1: Hiển thị số lượng nhân viên đi làm theo ca (Ca sáng: X, Ca trưa: Y, Ca chiều: Z).
   - Khối 2: Danh sách các KTV nghỉ phép trong ngày đó (VD: "21 gia hạn off", "11 off"). 

---

### [MODIFY] `app/reception/leave-management/LeaveManagement.logic.ts`
1. Cần thêm Logic để lấy dữ liệu tổng hợp cho quyển lịch:
   - Chế độ Lịch sẽ mặc định view cả tháng.
   - Hàm `useLeaveManagement` đã hỗ trợ mode "month".
   - Sẽ ánh xạ (map) các đơn Leave "APPROVED" vào từng ngày trong tháng để đếm KTV OFF.
   - Đối với phân ca, do dữ liệu ca (`useShiftManagement`) hiện tại đang là ca cố định (Active Shifts), ta sẽ giả định các KTV có ca Active là sẽ đi làm theo ca đó mỗi ngày (Trừ những ai có đơn OFF vào ngày đó).

---

### [MODIFY] `app/ktv/schedule/page.tsx` & `app/api/ktv/leave/route.ts`
1. **Đăng ký OFF nhiều ngày cùng lúc (Multi-select)**:
   - Cập nhật giao diện Đăng ký OFF của KTV: cho phép chọn nhiều ngày trên Lịch bằng cách thay đổi logic chọn ngày (`selectedDate`) thành mảng các ngày (`selectedDates: string[]`).
   - Khi KTV submit, vòng lặp (hoặc batch insert) sẽ tạo nhiều bản ghi `KTVLeaveRequests` tương ứng với mỗi ngày được chọn.
   - Cập nhật API `POST /api/ktv/leave` để hỗ trợ nhận `dates` (mảng) thay vì `date` (đơn) và insert vào database.

## Verification Plan

### Manual Verification
1. Truy cập vào KTV Hub > Lịch OFF.
2. Kiểm tra xem phần Yêu cầu chờ duyệt có nằm gọn trong Accordion hay không.
3. Kiểm tra lưới Lịch tháng hiện tại có hiển thị chính xác các ngày không.
4. Bấm vào một ngày có KTV xin OFF, kiểm tra xem giao diện nền tối hiện lên có chia ra đúng 2 phần: Thống kê Ca làm (những người không OFF) và danh sách OFF (chứa ID KTV).
