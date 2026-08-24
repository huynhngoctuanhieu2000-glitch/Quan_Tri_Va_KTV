# 🎯 Kế hoạch sửa giao diện khách hàng & Lịch sử đơn hàng KTV

**1. Sửa Lịch sử đơn hàng (app/ktv/history/page.tsx & api)**
- Tại màn hình Lịch sử đơn hàng, mình sẽ hiển thị mã đầy đủ thay vì mã ngắn (vd: `003-24082026-A`).
- Bổ sung trường `customerName` vào API.
- Bên dưới mã đơn hàng, sẽ lấy đúng TÊN KHÁCH HÀNG THỰC TẾ từ Database để hiển thị (Ví dụ: `Quỳnh Như - Khách A`). Nếu không có tên, mới hiển thị "Khách vãng lai". Sẽ không hiển thị kiểu mặc định chung chung.

**2. Sửa giao diện Đang làm việc (app/ktv/dashboard/page.tsx)**
- Cắt chuỗi ` - Khách X` tự động chèn dư thừa ở Backend ra khỏi thẻ hiện tại để tránh việc hiển thị lặp chữ `[Khách A] Quỳnh Như - Khách A` (chỉ hiển thị gọn thành `[Khách A] Quỳnh Như`).
- Tại danh sách "Nợ bàn giao", hiển thị thêm tên khách thực tế (thay vì chỉ hiện mỗi số phòng và mã bill).

> [!IMPORTANT]
> Đây là các file Cốt lõi (Core/Stable files) của ứng dụng KTV. Theo quy định an toàn, bạn vui lòng phản hồi đúng câu lệnh: **"Duyệt sửa file ổn định"** để mình tự động chạy mã lệnh can thiệp file nhé!
