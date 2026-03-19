# 🔒 MULTI-CONVERSATION COORDINATION (CRITICAL)

## Rule: File Locking & Coordination
Before editing ANY file in this project, you MUST:

1. **READ** the file `.agents/coordination.md` to check which files are currently being edited by other conversations.
2. **If a file is listed as "in-use"** (🟢 Đang làm) by another conversation:
   - DO NOT edit that file.
   - Inform the user: "File [X] đang được conversation khác sửa. Vui lòng đợi hoặc chuyển sang file khác."
3. **Before starting work**, UPDATE `.agents/coordination.md`:
   - Add your conversation description under "Active Conversations"
   - List all files you plan to modify
   - Set status to 🟢 Đang làm
4. **When finishing work**, UPDATE `.agents/coordination.md`:
   - Change your status to 🔴 Xong
   - Or remove your entry entirely

## Example Entry Format
```markdown
### Conversation B - Sửa Admin Dashboard
- **Đang sửa**: `app/admin/dashboard/page.tsx`, `app/admin/dashboard/AdminDashboard.logic.ts`
- **Trạng thái**: 🟢 Đang làm
```

## Important Notes
- This coordination is project-wide and applies to ALL conversations working on this codebase.
- If `.agents/coordination.md` does not exist, create it using the template.
- Always check coordination BEFORE making any file edits, not after.

---

# 📊 DATABASE SCHEMA REFERENCE (CRITICAL)

## Rule: Luôn đọc schema trước khi thay đổi liên quan DB

Khi code có thay đổi liên quan đến **database** (Supabase), bạn **BẮT BUỘC** phải:

1. **ĐỌC** file [`TableInSupabase.md`](file:///c:/Users/ADMIN/OneDrive/Desktop/Ngan%20Ha/Quan_Tri_Va_KTV/TableInSupabase.md) **TRƯỚC KHI** viết code.
2. **XÁC NHẬN** tên bảng, tên cột, kiểu dữ liệu, constraints từ file này.
3. **KHÔNG** giả định cột/bảng nào tồn tại — phải kiểm tra trong file trước.

## Khi nào áp dụng rule này?
- Viết / sửa **API routes** có `.from('TableName').select(...)` hoặc `.update(...)` hoặc `.insert(...)`
- Viết / sửa **Supabase migrations** (SQL files)
- Viết / sửa **Supabase triggers / functions**
- Viết / sửa **Realtime subscriptions** (`.on('postgres_changes', ...)`）
- Thêm cột mới → phải tạo migration SQL + cập nhật `TableInSupabase.md`

## Các bảng chính (tóm tắt)
| Nhóm | Bảng |
|------|------|
| Core Booking | `Bookings`, `BookingItems`, `Services` |
| KTV Management | `TurnQueue`, `KTVAttendance`, `Staff` |
| Notification & Config | `StaffNotifications`, `SystemConfigs` |
| Infra & CRM | `Rooms`, `Beds`, `Customers` |
| Auth & Push | `Users`, `StaffPushSubscriptions` |
