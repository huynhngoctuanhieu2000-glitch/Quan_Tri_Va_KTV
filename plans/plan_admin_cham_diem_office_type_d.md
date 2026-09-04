# Kế hoạch: Trang Admin Chấm Điểm Office & Quản Lý Tài Khoản KTV Loại D

**Ngày lập:** 04/09/2026
**Nhánh:** `feat/bit-lo-hong-phase1`
**Trạng thái:** Chờ duyệt — chưa thực thi.
**Người dùng chính:** Quầy lễ tân + Quản lý (**không rành công nghệ** → UI phải bấm là xong, không cần suy nghĩ).

---

## 1. Vấn đề hiện tại

Hệ thống đang có **hai thang đo song song** cho KTV Loại D, và Admin không nhìn thấy được cái nào:

| Thang đo | Bảng lưu | Ảnh hưởng | Admin xem được? |
|---|---|---|---|
| **Giờ tích lũy** (±giờ) | `KTVServiceHoursLedger` | Thứ tự nhận tua trong ngày | ❌ Không có trang nào |
| **Điểm Office** (100đ/ngày) | **Chưa có bảng** | Miễn quỹ nội bộ 250k/tháng | ❌ Chưa tồn tại |

Cụ thể đang thiếu:

- **Không có màn hình nào xem lịch sử ± giờ.** `KTVServiceHoursLedger` chỉ được ghi bởi cron và service, không ai tra cứu được. KTV bị trừ 5h/10h mà không biết vì sao.
- **Điểm Office hoàn toàn chưa được số hóa.** File [public/regulations/type-d.html](public/regulations/type-d.html) có bảng 18 tiêu chí (100 điểm) nhưng chỉ là checklist tĩnh để KTV *tự soát*. Quy chế ghi rõ: *"điểm chính thức do quản lý ghi nhận trên hệ thống theo phiếu đánh giá gốc"* — phần "hệ thống" này chưa được xây.
- **Không có ảnh minh chứng.** Trừ điểm bằng miệng, không lưu bằng chứng, KTV khiếu nại thì không có căn cứ.
- **Mở khóa tài khoản không có UI.** API [app/api/admin/staff/unlock/route.ts](app/api/admin/staff/unlock/route.ts) đã viết xong và chạy được, nhưng **không màn hình nào gọi nó** — hiện phải sửa tay `Staff.status` trong Supabase.

---

## 2. Phạm vi xây dựng

Một trang admin mới: **`/admin/ktv-office`** — "Chấm Điểm & Kỷ Luật KTV Loại D".

Ba việc trong cùng một chỗ:
1. **Bảng xếp hạng** — xem điểm Office + giờ tích lũy của tất cả KTV Loại D.
2. **Chấm điểm trừ** — tích lỗi → trừ điểm → đính ảnh minh chứng → tự gửi thông báo cho đúng KTV.
3. **Mở khóa tài khoản** — ngay tại thẻ của KTV đang bị khóa.

---

## 3. Dữ liệu — 2 bảng mới

### 3.1 `KTVOfficeScoreLog` — mỗi dòng là một lần trừ điểm

| Cột | Kiểu | Mô tả |
|---|---|---|
| `id` | uuid PK | |
| `staff_id` | text FK → Staff | KTV bị trừ |
| `work_date` | date | Ngày vi phạm (không phải ngày nhập) |
| `criteria_id` | text | Mã tiêu chí, vd `TIME_APP_ON_TIME` |
| `criteria_label` | text | Tên tiêu chí (snapshot, phòng khi đổi quy chế) |
| `points_deducted` | numeric | Điểm trừ (vd 7.5) |
| `note` | text | Ghi chú của người chấm |
| `photo_urls` | jsonb | Mảng URL ảnh minh chứng |
| `created_by` | text FK → Staff | Người chấm |
| `created_by_name` | text | Snapshot tên người chấm |
| `created_at` | timestamptz | |
| `revoked_at` | timestamptz null | Thu hồi (soft delete, không xoá cứng) |
| `revoked_by` / `revoke_reason` | text null | Ai thu hồi và vì sao |

**Ràng buộc:** unique `(staff_id, work_date, criteria_id) WHERE revoked_at IS NULL` — quy chế ghi *"mỗi lỗi chỉ trừ 1 lần/ngày dù lặp lại nhiều lần"*. DB phải chặn, không tin vào UI.

### 3.2 `KTVOfficeCriteria` — danh mục 18 tiêu chí

Đọc từ [public/regulations/type-d.html](public/regulations/type-d.html), seed sẵn:

| Nhóm | Tiêu chí | Điểm |
|---|---|---|
| **I. Quy trình công việc (40đ)** | Trước tua (khi có đơn hàng) | 5 |
| | Nhận tua & đón khách tại sảnh | 5 |
| | Trong dịch vụ | 10 |
| | Kết thúc dịch vụ | 5 |
| | Sau dịch vụ — tại sảnh | 5 |
| | Sau dịch vụ — tại phòng, bàn giao | 10 |
| **II. Thời gian làm việc (30đ)** | Bật app đúng giờ đã đăng ký | 7.5 |
| | Trạng thái bật app — sẵn sàng nhận tua | 7.5 |
| | Tắt app kết thúc ngày làm việc | 7.5 |
| | Chuyên cần — đi làm đều | 7.5 |
| **III. Thái độ, ngoại hình, tác phong (30đ)** | Đồng phục | 3 |
| | Ngoại hình | 6 |
| | Tác phong & chuẩn mực chào hỏi | 6 |
| | Tinh thần đồng đội & hòa khí nội bộ | 3 |
| | Minh bạch kênh tương tác & báo cáo | 3 |
| | Trung thực & trách nhiệm nghề nghiệp | 3 |
| | Minh bạch tài chính & cấm thu lợi bất chính | 3 |
| | Bảo mật thông tin tuyệt đối | 3 |

Để trong bảng (không hard-code) để sau này Admin sửa điểm/thêm tiêu chí không cần deploy. Kèm cột `sort_order`, `is_active`, `requires_photo` (bool — ép phải có ảnh với lỗi nặng).

Quy tắc phạt lỗi lặp ≥3 lần/tháng: xem mục 4 — đã chốt phương án A.

---

## 4. Công thức tính (tuân đúng quy chế)

```
Điểm ngày   = 100 − Σ(points_deducted của ngày đó, chưa thu hồi)
Điểm tháng  = [Σ(điểm các ngày CÓ ĐI LÀM) ÷ Số ngày thực tế có đi làm]
              − Σ(phạt lỗi lặp)
```

### Phạt lỗi lặp — **đã chốt phương án A (04/09/2026)**

Quy chế: *"Nếu cùng 1 lỗi lặp lại từ 3 lần trở lên trong tháng, bị trừ thêm 1 lần điểm tương ứng vào điểm tháng, ngoài công thức trung bình cộng ở trên."*

- **Ngưỡng:** cùng một `criteria_id` xuất hiện **≥ 3 lần trong tháng**, tính các lần **rải rác bất kỳ**, không cần liên tiếp.
- **Mức phạt:** trừ thêm **đúng 1 lần** điểm của lỗi đó, **bất kể lặp 3 hay 10 lần**. Không cộng dồn theo số lần vượt ngưỡng.
- Trừ vào **điểm tháng**, sau khi đã lấy trung bình — không đụng vào điểm ngày.

Ví dụ: lỗi "Đồng phục" (3đ) bị trừ ngày 01, 03, 04 → trung bình ngày tính bình thường, rồi lấy kết quả **trừ thêm 3đ**. Nếu bị 5 lần thì vẫn chỉ trừ thêm 3đ.

Đây là **giá trị dẫn xuất, không lưu vào bảng** — tính ở tầng đọc từ `KTVOfficeScoreLog`, để khi sửa quy chế không phải migrate dữ liệu cũ. Ngưỡng 3 đặt thành hằng số `REPEAT_THRESHOLD` cho dễ chỉnh.

"Ngày có đi làm" = có bản ghi `KTVAttendance` với `checkType IN ('CHECK_IN','LATE_CHECKIN')`. Ngày OFF không tính vào mẫu số.

**Bậc miễn quỹ nội bộ** (gốc 250.000đ/tháng):

| Điểm tháng | Miễn | Tiền |
|---|---|---|
| ≥ 98 | 100% | 250.000đ |
| 96 – 97,9 | 50% | 125.000đ |
| 90 – 95,9 | 30% | 75.000đ |
| 85 – 89,9 | 10% | 25.000đ |
| < 85 | 0% | 0đ |

---

## 5. Thiết kế UI — ưu tiên người không rành công nghệ

Nguyên tắc xuyên suốt: **mỗi màn hình chỉ hỏi một câu**. Không form dài, không thuật ngữ kỹ thuật, chữ to, nút to, màu phân biệt rõ.

### Màn A — Danh sách KTV (màn chính)

```
┌──────────────────────────────────────────────┐
│  Chấm Điểm KTV Loại D        [Tháng 9 ▾]     │
│  🔍 [ Tìm tên hoặc mã KTV............... ]   │
│  [ Tất cả ] [ 🔒 Đang bị khóa (2) ]          │
├──────────────────────────────────────────────┤
│ 🥇 T016  Tieu Kim Nghi          ⋯            │
│    Điểm tháng      Giờ tích lũy              │
│      97,5đ            18h                    │
│    ▓▓▓▓▓▓▓▓▓░  Miễn quỹ 50% (125.000đ)      │
│                      [ ➖ Trừ điểm ]          │
├──────────────────────────────────────────────┤
│ 🔒 T069  JK (Test D)            ⋯            │
│    ĐANG BỊ KHÓA — nghỉ không phép 04/09      │
│         [ 🔓 Mở khóa ]  [ ➖ Trừ điểm ]       │
└──────────────────────────────────────────────┘
```

- Xếp hạng theo **giờ tích lũy** (đúng quy chế: *"KTV có tổng giờ phục vụ cao hơn được ưu tiên xếp tua đầu"*), huy chương 🥇🥈🥉 cho top 3.
- Thanh màu điểm tháng: xanh ≥98, xanh lá 90–97, vàng 85–89, đỏ <85 — nhìn màu biết ngay, không cần đọc số.
- Thẻ bị khóa đẩy lên đầu, viền đỏ, không thể bỏ sót.

### Màn B — Trừ điểm (bottom sheet, 3 bước)

Chia bước để không dội một màn dài vào mặt người dùng:

**Bước 1 — Chọn ngày vi phạm.** Mặc định hôm nay. 3 nút to: `Hôm nay` / `Hôm qua` / `Chọn ngày khác`.

**Bước 2 — Tích lỗi.** 18 tiêu chí gom theo 3 nhóm, mỗi nhóm một accordion mở sẵn:

```
┌────────────────────────────────────────┐
│  T016 · Thứ Năm 04/09          [ ✕ ]   │
│  Điểm còn lại hôm nay:  100 → 85,0     │  ← cập nhật realtime
├────────────────────────────────────────┤
│ ▼ II. Thời gian làm việc               │
│   ☑ Bật app đúng giờ đã đăng ký  −7,5đ │  ← tích là trừ ngay
│   ☐ Sẵn sàng nhận tua trong ca   −7,5đ │
│ ▼ III. Thái độ, ngoại hình             │
│   ☑ Đồng phục                     −3đ  │
│   ☐ Ngoại hình                    −6đ  │
├────────────────────────────────────────┤
│  📷 Ảnh minh chứng (bắt buộc)          │
│  [ 📸 Chụp ảnh ]  [ 🖼 Chọn từ máy ]   │
│  [ảnh1] [ảnh2] [+]                     │
│  ✏️ Ghi chú: [....................]     │
│              [  Xác nhận trừ điểm  ]   │
└────────────────────────────────────────┘
```

- Ô đã tích trong ngày → hiện **xám + khóa** kèm chữ *"Đã trừ lúc 14:20 bởi Lễ tân Hoa"*. Không cho trừ trùng (khớp ràng buộc DB).
- Số "Điểm còn lại" nhảy realtime khi tích/bỏ tích — người chấm thấy ngay hậu quả.
- Nút xác nhận **disable** nếu lỗi có `requires_photo` mà chưa có ảnh.

**Bước 3 — Xác nhận.** Màn tóm tắt: trừ ai, ngày nào, mấy lỗi, tổng bao nhiêu điểm, mấy ảnh. Nút `Xác nhận` màu đỏ. Sau khi bấm: toast xanh *"Đã trừ 10,5 điểm cho T016. KTV đã nhận được thông báo."*

### Màn C — Lịch sử của một KTV

Mở khi bấm vào tên KTV. Hai tab:

- **Tab "Điểm Office"** — timeline theo ngày, mỗi dòng: ngày, điểm còn lại, các lỗi bị trừ, ảnh thumbnail bấm xem to, người chấm. Có nút `Thu hồi` (nhập lý do bắt buộc) cho Admin nếu chấm nhầm.
- **Tab "Giờ tích lũy"** — đọc `KTVServiceHoursLedger`: ngày, +giờ làm khách, −giờ phạt, loại phạt (dịch sang tiếng Việt dễ hiểu: `ABSENT_NO_NOTICE` → *"Nghỉ đột xuất không báo"*), ghi chú, số dư lũy kế. **Đây là phần đang thiếu hoàn toàn mà bạn hỏi.**

### Màn D — Mở khóa

Dialog gọn: hiện lý do bị khóa + thời điểm (đọc từ `SecurityAuditLogs`), ô nhập lý do mở khóa (bắt buộc), nút `Xác nhận mở khóa`. Gọi API [unlock](app/api/admin/staff/unlock/route.ts) đã có sẵn — không phải viết mới.

---

## 6. API cần xây

| Endpoint | Việc | Ghi chú |
|---|---|---|
| `GET /api/admin/ktv-office/summary?month=YYYY-MM` | Danh sách KTV Loại D + điểm tháng + giờ tích lũy + trạng thái khóa | Gộp 1 request cho màn A, tránh N+1 |
| `GET /api/admin/ktv-office/criteria` | 18 tiêu chí đang active | |
| `GET /api/admin/ktv-office/staff/[id]?month=` | Lịch sử điểm + lịch sử giờ của 1 KTV | Cho màn C |
| `POST /api/admin/ktv-office/deduct` | Ghi các dòng trừ điểm + upload ảnh + gửi notification | Transaction |
| `POST /api/admin/ktv-office/revoke` | Thu hồi một dòng đã trừ | Chỉ Admin, không cho lễ tân |
| *(dùng lại)* `POST /api/admin/staff/unlock` | Mở khóa | **Đã có** |

**Ảnh minh chứng:** dùng lại bucket `attendance` đang có (pattern y hệt [attendance/route.ts:253](app/api/ktv/attendance/route.ts:253)), thư mục `office-evidence/{staff_id}/{date}/`. Nén ảnh phía client trước khi gửi như luồng chấm công đang làm.

**Thông báo:** gọi `createNotification({ type, message, employeeId })` — hạ tầng đã có. Nội dung: *"Bạn bị trừ 10,5 điểm Office ngày 04/09: Bật app đúng giờ (−7,5đ), Đồng phục (−3đ). Xem chi tiết trong mục Hiệu Suất."*

---

## 7. Phân quyền

Thêm ModuleId mới `ktv_office_scoring` vào [lib/types.ts](lib/types.ts:1) và [lib/constants.ts](lib/constants.ts:5), nhóm "Kỹ Thuật Viên".

| Vai trò | Xem bảng | Trừ điểm | Thu hồi | Mở khóa |
|---|---|---|---|---|
| Admin / Manager | ✅ | ✅ | ✅ | ✅ |
| Lễ tân | ✅ | ✅ | ❌ | ❌ |
| KTV | Chỉ điểm của mình | ❌ | ❌ | ❌ |

Lý do tách: lễ tân là người chứng kiến vi phạm nên phải trừ được ngay, nhưng thu hồi và mở khóa là quyết định quản lý.

---

## 8. Bổ sung tôi đề xuất thêm (ngoài yêu cầu gốc)

1. **KTV phải xem được điểm của mình.** Trừ điểm mà KTV không tra cứu được thì sẽ khiếu nại liên tục. Thêm một khối vào trang [/ktv/performance](app/ktv/performance/page.tsx) đang có sẵn: điểm tháng, mức miễn quỹ dự kiến, danh sách lỗi kèm ảnh. Minh bạch đúng tinh thần quy chế mục 08.

2. **Cảnh báo sớm mốc miễn quỹ.** Khi điểm tháng rơi xuống sát ngưỡng (98 / 96 / 90 / 85), bắn notification cho KTV: *"Điểm tháng của bạn còn 96,2 — giảm thêm 0,3 điểm sẽ mất mức miễn 50%."* Tạo động lực thay vì chỉ phạt.

3. **Trừ điểm hàng loạt.** Lỗi kiểu "cả ca không mặc đồng phục" xảy ra với nhiều người cùng lúc. Cho chọn nhiều KTV rồi tích một lỗi chung, dùng chung một bộ ảnh. Tiết kiệm rất nhiều thao tác cho lễ tân.

4. **Nối tự động từ dữ liệu hệ thống.** Vài tiêu chí hệ thống tự biết mà không cần người chấm:
   - *"Bật app đúng giờ đã đăng ký"* → so `KTVAttendance.checkedAt` với `KTVTypeDDailyRegistration.expected_time`.
   - *"Chuyên cần — đi làm đều"* → đếm ngày OFF trong tháng.

   Đề xuất: hệ thống **gợi ý sẵn** (tích mờ + nhãn *"Hệ thống phát hiện"*), người chấm xác nhận hoặc bỏ. Không tự trừ để tránh oan.

5. **Xuất Excel cuối tháng.** Bảng điểm + mức miễn quỹ để bàn giao kế toán. Dự án đã có sẵn skill xử lý xlsx.

6. **Nhật ký thao tác.** Ghi `SecurityAuditLogs` cho cả trừ điểm và thu hồi, để truy vết khi có tranh chấp giữa lễ tân và KTV.

---

## 9. Thứ tự thi công

| Đợt | Nội dung | Kết quả dùng được |
|---|---|---|
| **1** | 2 bảng mới + seed 18 tiêu chí + API `summary` & `staff/[id]` + Màn A (danh sách) + Màn C tab "Giờ tích lũy" | Admin **xem được lịch sử ± giờ** — giải quyết ngay câu hỏi gốc của bạn |
| **2** | API `deduct` + upload ảnh + Màn B (3 bước) + notification | Lễ tân trừ điểm được kèm ảnh |
| **3** | Màn D mở khóa (nối API có sẵn) + Màn C tab "Điểm Office" + thu hồi | Hết phải sửa tay DB khi khóa nhầm |
| **4** | Bổ sung mục 8: khối điểm cho KTV, cảnh báo mốc, trừ hàng loạt, gợi ý tự động, xuất Excel | Hoàn thiện |

Đợt 1 độc lập và giá trị nhất — làm xong là đã hết cảnh "không biết vì sao bị trừ giờ".

---

## 10. Cần bạn quyết trước khi code

1. **Điểm Office chấm theo ngày hay theo ca?** Quy chế ghi "điểm ngày" nên tôi thiết kế theo ngày. Nếu một KTV làm 2 ca/ngày mà vi phạm ở ca sau, vẫn tính là 1 ngày — đúng ý bạn chứ?

2. **Lễ tân có được trừ điểm ngày cũ không?** Nếu cho tự do thì dễ bị lạm dụng (trừ bù cho cả tuần trước). Đề xuất: lễ tân chỉ trừ được **hôm nay và hôm qua**, Admin trừ được mọi ngày. Bạn thấy hợp lý không?

3. **Ảnh minh chứng bắt buộc với lỗi nào?** Đề xuất bắt buộc với nhóm III (thái độ, ngoại hình — dễ tranh cãi nhất), tùy chọn với nhóm I và II. Hay bắt buộc hết?

4. ~~Quy tắc "lỗi lặp ≥3 lần/tháng bị trừ thêm"~~ — **đã chốt 04/09/2026: phương án A**, trừ thêm đúng 1 lần điểm của lỗi đó, đếm 3 lần rải rác bất kỳ trong tháng. Chi tiết ở mục 4.
