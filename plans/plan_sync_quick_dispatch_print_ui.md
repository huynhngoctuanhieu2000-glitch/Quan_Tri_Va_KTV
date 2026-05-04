# Kế hoạch Đồng bộ Giao diện Nút In và Phiếu In ở phần Điều Phối Nhanh

## Mục tiêu
Đồng bộ hóa nút bấm "In phiếu" và modal "Phiếu Tua KTV" trong bảng Điều phối nhanh (`QuickDispatchTable.tsx`) để giống 100% về mặt UI/UX với bên phần Chi tiết (`DispatchStaffRow.tsx`), trong khi vẫn giữ nguyên tính năng lấy đúng "Tên in phiếu" (đã custom) và "Thời gian" (đã sửa tay) của Lễ tân.

## Chi tiết các bước triển khai

### Bước 1: Đồng bộ UI nút bấm (Print Button)
- File tác động: `app/reception/dispatch/_components/QuickDispatchTable.tsx`
- Nội dung thay đổi: 
  - Đổi size của container từ `p-1.5 rounded-lg` sang `p-2.5 rounded-xl`.
  - Nâng size icon Máy In: `<Printer size={15} strokeWidth={2.5} />`.
  - Giữ nguyên tooltip `title="In phiếu"` và event `onClick`.

### Bước 2: Đồng bộ cấu trúc Phiếu In (Ticket Preview Modal)
- File tác động: `app/reception/dispatch/_components/QuickDispatchTable.tsx`
- Nội dung thay đổi:
  - Copy toàn bộ layout DOM tree của Modal in từ `DispatchStaffRow.tsx` (gồm nền đen mờ `backdrop-blur-md`, box trắng `rounded-3xl`, phần header đen `bg-slate-900` và các phần tử nội dung).
  - Bổ sung UI in "Nhiều chặng" (mặc dù Điều phối nhanh thường chỉ có 1 chặng, nhưng code render sẽ dùng chung cấu trúc mảng cho đồng bộ thiết kế).
  - Copy chuẩn xác thiết kế của block **Yêu Cầu Khách Hàng** (có các icon 💪, 🎯, 🚫, 📌).
  - Copy chuẩn xác thiết kế của block **Admin Dặn Dò** (có nền xanh lá, icon 💬).
  - Cập nhật các biến đổ dữ liệu như `tName`, `sT`, `eT`, `ticketDur`, `ticketNote` để binding vào UI mới này.

## Kết quả dự kiến
Sau khi triển khai, việc in phiếu từ cả 2 luồng (Điều phối nhanh và Chi tiết) sẽ cho ra trải nghiệm thị giác nhất quán hoàn toàn, đồng thời đảm bảo nội dung in (thời gian, tên custom) là hoàn toàn chính xác.
