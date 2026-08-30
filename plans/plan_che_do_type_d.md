# 🆕 Chế Độ KTV TYPE_D — Bản Kế Hoạch FINAL

> **Trạng thái**: Kiến trúc đã chốt ✅ — **Còn 13 câu hỏi nghiệp vụ chưa chốt** (xem §14) ⚠️
> **Cập nhật**: 2026-08-31 (rà soát đối chiếu codebase)
> **Lịch sử**: 2026-08-27 00:07 (bản gốc) → 2026-08-27 23:29 (chốt công thức giá tại `bao_cao_bang_gia_type_d.md`) → 2026-08-31 (rà soát kỹ thuật lần 1) → 2026-08-31 (rà soát lần 2: đối chiếu DB production + tên feature flag thật)

> [!IMPORTANT]
> **Đọc §14 trước khi bắt đầu code.** Phần lớn plan đã sẵn sàng triển khai, nhưng có 13 điểm nghiệp vụ chưa được định nghĩa — trong đó **câu 1 (thang 5★) sẽ gây bug ngay tua đầu tiên** nếu bỏ qua.
>
> Các mục có gắn nhãn **[BỔ SUNG]** trong tài liệu là phát hiện từ đợt rà soát 31/08, đã đối chiếu với code thật.

---

## 1. Tổng Quan & So Sánh

| Tiêu chí | Hiện tại (TYPE_A/B/C) | TYPE_D ("D") |
|---|---|---|
| **Tên hiển thị** | Cơ bản / Hợp tác / Nhập tay | **D** |
| **Xếp thứ tự tua** | Theo `turns_completed` (ít tua → ưu tiên) | Theo **tổng thời gian làm tua** (**nhiều giờ → ưu tiên gán trước**). Bận → gán người kế |
| **Reset sổ tua** | Không rõ / thủ công | **Reset cuối mỗi tháng** về 0 giờ |
| **Khung giá tua** | Milestones riêng per-type | **Hệ số phẳng theo giờ**: VIP = `(phút/60) × 180.000đ`, PT = `(phút/60) × 100.000đ`. **Floor hàng trăm** |
| **Khấu trừ theo sao** | Không có (chỉ trừ bonus) | **5★=100%, 4★=100%, 3★=75%, 2★=50%, 1★=25%** tiền tua |
| **Bonus** | Shift-based, gộp chung service | **TÁCH RIÊNG**: 20đ/tua flat nếu 4★. Chia đôi nếu 2 KTV cùng TYPE_D. 0đ nếu làm chung KTV khác chế độ |
| **Kỷ luật** | Phạt tiền + Điểm chuyên cần | **Trừ giờ tích lũy** (không phạt tiền) |
| **Giáng chức** | Tự động B→A khi điểm < 80 | **KHÔNG tự động**. Chỉ Admin thủ công + chốt sổ |
| **Lương cứng** | Tùy loại | Không lương cứng, hưởng 100% đơn giá |
| **Menu VIP** | Cờ `is_active_vip_menu` | **CÓ** — dùng cờ giống TYPE_B |
| **Ví tích lũy (Heo đất)** | TYPE_A/B có | **KHÔNG** — TYPE_D không tham gia |
| **Phí giặt đồ** | TYPE_A có (20k/ngày) | **CÓ** — áp dụng cho TYPE_D |
| **Phí bảo trì** | 50k/tháng | **CÓ** — 50k/tháng (cài đặt được) |
| **Quỹ nội bộ** | Không | **CÓ** — 250k/tháng, có toggle bật/tắt (cài đặt được) |
| **Rút tiền** | Bất kỳ lúc nào | Phải đăng ký từ sáng |

---

## 2. Quyết Định Kiến Trúc (ĐÃ DUYỆT ✅)

### 2.1 Hybrid: Dùng chung bảng DB + Service class riêng

- Dùng chung `KTVDailyLedger`, `KTVBonusLedger`, `WalletAdjustments`, `KTVWithdrawals`
- Thêm cột **`work_type_snapshot`** vào mỗi bảng (Temporal Tagging)
- **4 Service class riêng** cho TYPE_D → logic 100% tách biệt, không chạm code cũ

### 2.2 Temporal Tagging — Chống trộn dữ liệu khi chuyển chế độ

Mỗi bút toán ghi nhận `work_type_snapshot` = chế độ KTV **tại thời điểm phát sinh**:

| Query mục đích | Filter |
|---|---|
| Ví TYPE_D | `WHERE staff_id = X AND work_type_snapshot = 'TYPE_D'` |
| Ví TYPE_A | `WHERE staff_id = X AND (work_type_snapshot = 'TYPE_A' OR work_type_snapshot IS NULL)` |
| Dữ liệu cũ (NULL) | Mặc định TYPE_A (backward compat) |

**Khi Admin chuyển chế độ giữa chừng**:
1. Chốt sổ ví cũ (bút toán cũ giữ nguyên `work_type_snapshot`)
2. Bút toán mới ghi snapshot mới
3. Giờ tích lũy TYPE_D bị freeze nếu chuyển ra
4. KTV vẫn xem lại lịch sử ví cũ

> [!CAUTION]
> **[BỔ SUNG] Temporal Tagging KHÔNG tự phủ được phần "realtime" của ví.**
>
> `KtvWalletService.getBalance()` ([KtvWalletService.ts](../lib/services/KtvWalletService.ts)) tính số dư theo mô hình **lai**:
> - Phần quá khứ: đọc từ `KTVDailyLedger` → *có* stamp snapshot ✅
> - Phần từ ngày cuối có ledger đến hiện tại: **tính lại trực tiếp từ `Bookings`** bằng `work_type` **HIỆN TẠI** của KTV ❌
>
> Nghĩa là ngay khi Admin bấm chuyển A→D, toàn bộ cửa sổ realtime (thường là hôm nay, có thể vài ngày nếu cron lỗi) bị tính lại theo đơn giá D — kể cả các tua làm khi còn là TYPE_A.
>
> Thêm nữa, `KTVDailyLedger` upsert với `onConflict: 'date, staff_id'` → **mỗi KTV chỉ có 1 dòng/ngày**, nên một ngày chỉ chứa được **một** giá trị `work_type_snapshot`.
>
> **Đề xuất (cần chốt — xem §14 câu 4)**: bắt buộc **việc chuyển chế độ chỉ có hiệu lực từ 00:00 ngày hôm sau**. Admin bấm chuyển → ghi vào hàng đợi `effective_from = ngày mai`, cron `sync-daily-ledger` chốt sổ ngày hiện tại xong mới áp dụng. Cách này giữ nguyên `onConflict` hiện tại và không phải đụng vào nhánh realtime.
>
> Phương án thay thế (nặng hơn): đổi unique key thành `(date, staff_id, work_type_snapshot)` **và** sửa nhánh realtime để chia cửa sổ theo mốc đổi chế độ.

### 2.3 TYPE_D không giáng chức tự động

- Không dùng `KTVDisciplinePoints` (điểm chuyên cần)
- Chỉ Admin thủ công chuyển chế độ + hệ thống chốt sổ
- Cơ chế phạt duy nhất: Khóa tài khoản khi nghỉ không đăng ký OFF → Phí kích hoạt lại (cài đặt được)

### 2.4 Bảng `TurnQueue` — Sort DESC

- Thêm cột `accumulated_service_hours` (numeric, default 0)
- TYPE_D sort **DESC** — nhiều giờ nhất → auto gán trước
- Nếu KTV đang bận (`status = 'working'`) → gán người kế tiếp
- Nếu giờ bằng nhau → xét `check_in_order`
- TYPE_A/B/C vẫn sort theo `turns_completed` ASC như cũ

---

## 3. Database Migration

### [NEW] `supabase/migrations/20260831000000_add_type_d_support.sql`

> ⚠️ **Đặt đúng thư mục**: migration đang được apply thật nằm ở `supabase/migrations/` (mới nhất `20260830_add_dispatch_booking_guard.sql`). Thư mục `migrations/` ở gốc là folder cũ, dừng ở 20260801 — đặt vào đó sẽ **không được chạy**.

```sql
-- ================================================
-- PHASE 0: MỞ CHECK CONSTRAINT work_type  ⚠️ BẮT BUỘC — LÀM ĐẦU TIÊN
-- ================================================
-- Lý do: supabase/migrations/20260722000001_add_work_type_to_staff.sql đã khoá cứng
--   CHECK (work_type IN ('TYPE_A','TYPE_B','TYPE_C'))
-- ở tầng DATABASE. Nếu không mở, mọi lệnh ghi work_type = 'TYPE_D' đều bị Postgres
-- từ chối với lỗi:
--   new row for relation "Staff" violates check constraint "check_work_type"
-- → Phase 0 (seed 11 tài khoản test T001–T079) fail ngay dòng đầu tiên,
--   dù code TypeScript đã sửa đủ.
-- Postgres không cho sửa CHECK tại chỗ → phải DROP rồi ADD lại.

ALTER TABLE "Staff" DROP CONSTRAINT IF EXISTS check_work_type;
ALTER TABLE "Staff" ADD CONSTRAINT check_work_type
  CHECK (work_type IN ('TYPE_A', 'TYPE_B', 'TYPE_C', 'TYPE_D'));

-- ================================================
-- PHASE A: TEMPORAL TAGGING (4 bảng ledger)
-- ================================================
ALTER TABLE "KTVDailyLedger"    ADD COLUMN IF NOT EXISTS "work_type_snapshot" TEXT DEFAULT NULL;
ALTER TABLE "KTVBonusLedger"    ADD COLUMN IF NOT EXISTS "work_type_snapshot" TEXT DEFAULT NULL;
ALTER TABLE "WalletAdjustments" ADD COLUMN IF NOT EXISTS "work_type_snapshot" TEXT DEFAULT NULL;
ALTER TABLE "KTVWithdrawals"    ADD COLUMN IF NOT EXISTS "work_type_snapshot" TEXT DEFAULT NULL;

-- ================================================
-- PHASE B: TURNQUEUE — Cột giờ tích lũy
-- ================================================
ALTER TABLE "TurnQueue" 
  ADD COLUMN IF NOT EXISTS "accumulated_service_hours" NUMERIC DEFAULT 0;

-- ================================================
-- PHASE C: RATING DEDUCTION
-- ================================================
ALTER TABLE "KTVDailyLedger"
  ADD COLUMN IF NOT EXISTS "rating_deduction" NUMERIC DEFAULT 0;

-- ================================================
-- PHASE D: Sổ kỷ luật giờ tích lũy TYPE_D
-- ================================================
CREATE TABLE IF NOT EXISTS "KTVServiceHoursLedger" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "staff_id" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "hours_earned" NUMERIC DEFAULT 0,
  "hours_penalty" NUMERIC DEFAULT 0,
  "penalty_type" TEXT,
  "booking_id" TEXT,
  "note" TEXT,
  "created_at" TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS "idx_svc_hours_ledger_unique" 
  ON "KTVServiceHoursLedger" ("staff_id", "date", "booking_id") 
  WHERE "booking_id" IS NOT NULL;

-- Idempotency cho dòng PHẠT: các dòng phạt có booking_id = NULL nên KHÔNG rơi vào
-- index bên trên → gọi deductHours() 2 lần sẽ trừ giờ 2 lần. Cần index riêng.
CREATE UNIQUE INDEX IF NOT EXISTS "idx_svc_hours_ledger_penalty_unique"
  ON "KTVServiceHoursLedger" ("staff_id", "date", "penalty_type")
  WHERE "booking_id" IS NULL AND "penalty_type" IS NOT NULL;

-- ================================================
-- PHASE E: Tổng giờ tích lũy TYPE_D theo tháng
-- ================================================
CREATE TABLE IF NOT EXISTS "KTVMonthlyServiceHours" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "staff_id" TEXT NOT NULL,
  "month" INT NOT NULL,
  "year" INT NOT NULL,
  "total_hours_earned" NUMERIC DEFAULT 0,
  "total_hours_penalty" NUMERIC DEFAULT 0,
  "net_hours" NUMERIC DEFAULT 0,
  "synced_at" TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE("staff_id", "month", "year")
);
```

---

## 4. Constants & Types

### [MODIFY] `staff.types.ts`
```diff
-export type WorkType = 'TYPE_A' | 'TYPE_B' | 'TYPE_C';
+export type WorkType = 'TYPE_A' | 'TYPE_B' | 'TYPE_C' | 'TYPE_D';

+export interface FeatureFlagsTypeD {
+    // ⚠️ TÊN CỜ PHẢI KHỚP FEATURE_FLAG_DEFS — xem cảnh báo bên dưới
+    laundry_deduction: boolean;        // Trừ phí giặt đồ khi điểm danh
+    sudden_leave_penalty: boolean;     // TYPE_D = false (phạt bằng GIỜ, không phạt tiền)
+    allow_on_call: boolean;
+    enable_employee_tasks: boolean;
+    bonus_wallet: boolean;             // Ví Bonus
+    savings_wallet: boolean;           // TYPE_D = false (KHÔNG có Heo đất)
+    maintenance_fee: boolean;          // Trừ phí bảo trì hàng tháng
+    // Cờ MỚI riêng cho TYPE_D:
+    internal_fund_enabled: boolean;    // Quỹ nội bộ 250k — toggle bật/tắt
+    withdraw_morning_only: boolean;    // Chỉ cho đăng ký rút tiền buổi sáng
+    [key: string]: any;
+}
```

> [!CAUTION]
> **[BỔ SUNG] Bản gốc đặt SAI tên cờ — sẽ không có tác dụng gì.** Tên cờ phải khớp chính xác `FEATURE_FLAG_DEFS` trong [KtvFeatures.logic.ts:6](../app/admin/settings/system/KtvFeatures.logic.ts#L6), vì đây là danh sách mà cả Admin UI lẫn các route đọc/ghi.
>
> | Bản gốc ghi (SAI) | Tên thật trong code | Nơi code đọc |
> |---|---|---|
> | `laundry_fee_enabled` | **`laundry_deduction`** | `attendance/route.ts:447` |
> | `bonus_enabled` | **`bonus_wallet`** | Admin UI + ví bonus |
> | *(thiếu)* | **`maintenance_fee`** | `KtvLedgerSyncService.ts:190` |
> | *(thiếu)* | **`savings_wallet`** | Phải đặt `false` — đây mới là cách loại TYPE_D khỏi Heo đất |
> | *(thiếu)* | **`sudden_leave_penalty`** | Phải đặt `false` — TYPE_D phạt bằng giờ, không phạt tiền |
> | `vip_menu_enabled` | ❌ **không tồn tại trong FEATURE_FLAG_DEFS** | VIP menu dùng cột riêng `Staff.is_active_vip_menu`, không phải feature flag |
>
> Cờ đặt sai tên sẽ được ghi vào `feature_flags` jsonb mà **không báo lỗi**, nhưng không có đoạn code nào đọc → tính năng im lặng không hoạt động. Rất khó debug.
>
> Đồng thời phải thêm nhánh `case 'TYPE_D'` vào `getDefaultFlagsForType()` ([KtvFeatures.logic.ts:58](../app/admin/settings/system/KtvFeatures.logic.ts#L58)) — hiện `default:` trả về `{}` rỗng.

### [MODIFY] `staff.constants.ts`
```diff
 export const WORK_TYPE_LABELS = {
     TYPE_A: 'Cơ bản',
     TYPE_B: 'Hợp tác',
-    TYPE_C: 'Nhập tay'
+    TYPE_C: 'Nhập tay',
+    TYPE_D: 'D'
 };

+export const DEFAULT_FEATURE_FLAGS_TYPE_D: FeatureFlagsTypeD = {
+    laundry_deduction: true,        // CÓ trừ giặt đồ
+    sudden_leave_penalty: false,    // KHÔNG phạt tiền — phạt bằng giờ
+    allow_on_call: false,
+    enable_employee_tasks: false,
+    bonus_wallet: true,             // CÓ ví bonus (tách riêng)
+    savings_wallet: false,          // KHÔNG có Heo đất
+    maintenance_fee: true,          // CÓ phí bảo trì
+    internal_fund_enabled: true,    // CÓ quỹ nội bộ
+    withdraw_morning_only: true     // Chỉ rút buổi sáng
+};

+// TYPE_D Discipline: Penalty hours (cài đặt được trên Admin)
+export const TYPE_D_DISCIPLINE_PENALTIES = {
+    ABSENT_NO_NOTICE: 10,
+    ABSENT_EARLY_NOTICE: 5,
+    LATE_NO_UPDATE: 5,
+    ORDER_REJECT_MULTIPLIER: 3
+} as const;

+// TYPE_D Commission: Rating-based deduction (cài đặt được trên Admin)
+export const TYPE_D_RATING_DEDUCTION = {
+    5: 0,     // 5★: 100%  ⚠️ BẮT BUỘC CÓ — xem ghi chú bên dưới
+    4: 0,     // 4★: 100%
+    3: 0.25,  // 3★: 75%
+    2: 0.50,  // 2★: 50%
+    1: 0.75,  // 1★: 25%
+    0: 0      // Chưa đánh giá: tạm tính 100% (xem R2)
+} as const;

+// TYPE_D Bonus: Flat points (cài đặt được trên Admin)
+export const TYPE_D_BONUS = {
+    BASE_POINTS: 20      // 20đ/tua nếu rating >= 4★ (gồm cả 5★)
+} as const;
```

> [!CAUTION]
> **Bảng khấu trừ BẮT BUỘC phải phủ đủ 0–5 sao.** Hệ thống chấm thang **1–5 sao** (`Bookings.rating` numeric 1-5, `BookingItems.ktvRatings` jsonb). Bảng gốc chỉ định nghĩa 4/3/2/1 → khi KTV được **5★**, `deduction[5]` trả về `undefined`, phép tính `basePay × (1 - undefined)` cho ra **`NaN`** và ghi thẳng vào ví KTV. Đây là bug chắc chắn xảy ra ngay tua 5★ đầu tiên.
>
> Khi đọc bảng từ SystemConfigs cũng phải có fallback: `const d = table[rating] ?? 0;` — không được để `undefined` lọt vào phép nhân.

### SystemConfigs Keys mới cho TYPE_D:

| Key | Default | Mô tả | Cài đặt được |
|---|---|---|---|
| `ktv_type_d_vip_rate_per_hour` | `180000` | Rate VIP (đ/**giờ**) | ✅ |
| `ktv_type_d_pt_rate_per_hour` | `100000` | Rate Phổ thông (đ/**giờ**) | ✅ |
| `ktv_deposit_amount_TYPE_D` | `500000` | Tiền cọc ví | ✅ |
| `enable_ktv_bonus_TYPE_D` | `true` | Bật/tắt bonus | ✅ Toggle |
| `ktv_type_d_bonus_points` | `20` | Điểm bonus mỗi tua rating **>= 4★** (gồm 5★) | ✅ |
| `ktv_type_d_rating_deduction` | `{5:0, 4:0, 3:0.25, 2:0.5, 1:0.75, 0:0}` | Bảng khấu trừ theo sao (**phải đủ 0–5**) | ✅ |
| `ktv_bonus_rate_TYPE_D` | `1000` | Quy đổi 1 điểm bonus → VNĐ. **Đã có sẵn convention**: DB hiện có `ktv_bonus_rate` = 1000 và `ktv_bonus_rate_TYPE_A/B/C` = 1000 → chỉ cần thêm bản `_TYPE_D` | ✅ |
| `ktv_type_d_discipline_rules` | `{ABSENT_NO_NOTICE:10,...}` | Mức trừ giờ kỷ luật | ✅ |
| `ktv_type_d_internal_fund` | `250000` | Quỹ nội bộ/tháng | ✅ |
| `ktv_type_d_internal_fund_enabled` | `true` | Toggle quỹ nội bộ | ✅ Toggle |
| `ktv_type_d_reactivation_fee` | `1000000` | Phí kích hoạt lại | ✅ |
| ~~`laundry_fee_TYPE_D`~~ | — | ⚠️ **KEY NÀY KHÔNG TỒN TẠI** — xem cảnh báo bên dưới | ❌ |
| ~~`maintenance_fee_TYPE_D`~~ | — | ⚠️ **KEY NÀY KHÔNG TỒN TẠI** — xem cảnh báo bên dưới | ❌ |

> **Quy ước key `_TYPE_D` chỉ chạy được cho MỘT NHÓM key.** `KtvCommissionService.getCommissionConfig()` sinh key theo `typeSuffix = '_TYPE_' + workType.replace('TYPE_','')` ([KtvCommissionService.ts:37](../lib/services/KtvCommissionService.ts#L37)), nên `ktv_deposit_amount_TYPE_D`, `enable_ktv_bonus_TYPE_D`, `ktv_shift_*_bonus_TYPE_D`, `ktv_bonus_rate_TYPE_D` chạy được ngay, **không cần sửa gì**.

> [!CAUTION]
> **[BỔ SUNG] Phí giặt đồ & phí bảo trì KHÔNG theo quy ước `_TYPE_x`.** Bản gốc giả định sai. Đã kiểm tra cả code lẫn DB production:
>
> | Khoản | Bản gốc ghi (SAI) | Cơ chế THẬT |
> |---|---|---|
> | Giặt đồ | `laundry_fee_TYPE_D` | Số tiền: key **global `laundry_fee`** (= 20.000), đọc bằng `.eq('key','laundry_fee')` **cứng** tại [attendance/route.ts:452](../app/api/ktv/attendance/route.ts#L452). Bật/tắt: **feature flag `laundry_deduction`** trên từng Staff. **Không có bản per-type nào trong DB.** |
> | Bảo trì | `maintenance_fee_TYPE_D` | Số tiền: key global **`maintenance_fee_amount`** (= 50.000). Bật/tắt: `enable_maintenance_fee` (global) + feature flag `maintenance_fee` trên Staff. Đọc bằng `.eq()` cứng tại [KtvLedgerSyncService.ts:136-156](../lib/services/KtvLedgerSyncService.ts#L136) |
>
> **Hệ quả**: nếu chỉ insert key `laundry_fee_TYPE_D` / `maintenance_fee_TYPE_D` như bản gốc, chúng sẽ nằm chết trong DB và **không đoạn code nào đọc tới**. TYPE_D sẽ dùng chung mức phí global với A/B/C.
>
> **Chọn 1 trong 2 hướng:**
> - **(a) Đơn giản — khuyến nghị**: TYPE_D dùng chung mức phí global (20k/50k đúng như plan mong muốn), chỉ bật/tắt qua feature flag. **Không cần thêm key, không cần sửa code.**
> - **(b) Nếu muốn TYPE_D có mức phí RIÊNG**: phải sửa 2 chỗ đọc `.eq()` cứng thành resolve theo `typeSuffix` giống `getCommissionConfig()`. Đây là **sửa code dùng chung cho cả A/B/C** → rủi ro hồi quy, phải test lại phí của các loại cũ.
>
> Ghi chú thêm: DB có sẵn `enable_maintenance_fee_TYPE_A/B/C` và `maintenance_fee_deduct_deposit_TYPE_A`, nhưng `KtvLedgerSyncService` chỉ đọc bản **global**. Đây là điểm không nhất quán **có sẵn từ trước**, không phải do TYPE_D — nhưng nên biết để không đi theo vết cũ.

> **Đối chiếu giá trị DB production (31/08)**: `ktv_deposit_amount` = **1.000.000** (TYPE_A/B = 1tr, TYPE_C = 0). Plan đặt TYPE_D = 500.000 → **thấp hơn một nửa so với A/B**. Cần xác nhận đây là chủ ý, không phải nhầm lẫn.

> **[NEW] Bước seed config còn thiếu.** Plan mới chỉ *liệt kê* key, chưa có bước ghi giá trị mặc định xuống `SystemConfigs`. Nếu không seed, mọi hàm `getConfig()` sẽ rơi về fallback và Admin UI hiện ô trống. Cần thêm script `scripts/insert_type_d_configs.js` (theo mẫu `scripts/insert_maintenance_fee_configs.js` đã có).

---

## 5. Core Service Classes — 4 FILES MỚI (LOGIC ĐỘC LẬP)

### 5.1 [NEW] `KtvTypeDCommissionService.ts` — Tiền tua

> **Hệ số phẳng theo GIỜ**, KHÔNG dùng milestones. Có khấu trừ theo đánh giá sao, floor đến hàng trăm.
>
> ⚠️ **Bản này đã sync theo [`bao_cao_bang_gia_type_d.md`](./bao_cao_bang_gia_type_d.md) (27/08 23:29 — chốt sau plan gốc).** Phiên bản cũ của mục này ghi `phút × 1.667đ, không làm tròn` là **SAI** — cho ra 60p PT 3★ = 75.015đ thay vì 75.000đ.

```
Công thức chốt (FINAL — khớp báo cáo giá):
┌──────────────────────────────────────────────────────────────┐
│ VIP_RATE_PER_HOUR = 180,000 đ/giờ  (cài đặt được)           │
│ PT_RATE_PER_HOUR  = 100,000 đ/giờ  (cài đặt được)           │
│                                                               │
│ giá_gốc    = (phút / 60) × RATE_PER_HOUR                     │
│ giá_sau_sao = giá_gốc × (1 - deduction[rating])              │
│ finalPay    = Math.floor(giá_sau_sao / 100) × 100  ← floor   │
│                                                               │
│ VD: 90p VIP 4★ = 90/60 × 180,000       = 270,000đ           │
│ VD: 60p PT  3★ = 60/60 × 100,000 × 0.75 =  75,000đ           │
│ VD: 40p PT  4★ = 40/60 × 100,000 = 66,666.67 → 66,600đ       │
└──────────────────────────────────────────────────────────────┘
```

**Vì sao floor hàng trăm, không phải round?** Rate VIP 180k/h chia hết cho mọi mốc phút thông dụng nên không bao giờ lẻ. Rate PT 100k/h lẻ ở 3 mốc (40p, 70p, 100p) — floor cắt tối đa **67đ**, đổi lại KTV không bao giờ thấy số lẻ hàng chục trong ví.

```
Flow tính tiền tua TYPE_D:
1. Đọc rate từ SystemConfigs:
   - `ktv_type_d_vip_rate_per_hour` (default 180000)
   - `ktv_type_d_pt_rate_per_hour`  (default 100000)
2. Xác định service type:
   - VIP (NHP/NHT): dùng VIP_RATE_PER_HOUR
   - Phổ thông (NHS): dùng PT_RATE_PER_HOUR
3. giá_gốc = (phút / 60) × rate
4. Lấy rating KTV cho item này (xem quy tắc phân giải bên dưới)
5. finalPay = Math.floor(giá_gốc × (1 - deduction[rating]) / 100) × 100
```

**Quy tắc phân giải rating — tái dùng logic 3 tầng đã có** (`calculateBookingBonus`, [KtvCommissionService.ts:349](../lib/services/KtvCommissionService.ts#L349)):

```
Ưu tiên 1: item.ktvRatings[techCode]   (sao chấm riêng cho KTV này)
Ưu tiên 2: item.itemRating              (sao của item)
Ưu tiên 3: booking.rating               (sao của cả đơn)
Không có  : 0 → tạm tính 100% (xem R2)
```

> ⚠️ **Khác biệt so với bonus A/B/C**: hàm bonus cũ lấy `maxKtvRating` — **sao CAO NHẤT** trong các item của KTV. TYPE_D **không được** dùng max, vì đây là khấu trừ tiền chứ không phải điều kiện nhận thưởng: KTV làm 2 item (4★ và 1★) mà lấy max thì được hưởng 100% cả hai. → **Khấu trừ tính riêng cho từng `BookingItem`.**

**Methods:**
- `getConfig(supabase)`: Đọc VIP rate, PT rate, rating deduction table từ SystemConfigs
- `calcCommission(durationMins, serviceId, ktvRating, config)`: Tính tiền tua sau khấu trừ
- `calcItemCommission(item, techCode, config)`: Tính cho 1 BookingItem cụ thể

---

### 5.2 [NEW] `KtvTypeDBonusService.ts` — Bonus ĐỘC LẬP ⭐

> **Hoàn toàn tách biệt** với `calculateBookingBonus` trong `KtvCommissionService.ts`.

```
Quy tắc Bonus TYPE_D:
┌─────────────────────────────────────────────────┐
│ 1. Rating < 4★ → 0đ  (tức >= 4★ mới có, gồm 5★) │
│ 2. Solo (1 KTV TYPE_D, 1 khách) → 20đ          │
│    (kể cả tua 30 phút!)                        │
│ 3. 2 KTV cùng TYPE_D → chia đôi (10đ mỗi)     │
│ 4. Có KTV khác chế độ tham gia → 0đ            │
│ 5. Điểm cơ bản (20đ) cài đặt được trên Admin   │
└─────────────────────────────────────────────────┘
```

**Methods:**
- `calcBonus(booking, techCode, staffWorkTypeMap, config)`: Tính bonus 1 booking
- `getConfig(supabase)`: Đọc `ktv_type_d_bonus_points`, `enable_ktv_bonus_TYPE_D`

**Khác biệt so với bonus A/B/C:**
| | TYPE_A/B/C | TYPE_D |
|---|---|---|
| Điểm theo Ca | Ca 1=20đ, Ca 2=20đ, Ca 3=30đ | **Flat 20đ** (không phân ca) |
| Tua < 60 phút | Mất trắng (0đ) | **Vẫn được 20đ** nếu >= 4★ |
| Làm chung khác chế độ | Tính bình thường (chia quỹ) | **0đ** cho TYPE_D |
| Làm chung cùng chế độ | Chia theo guest/KTV ratio | Chia đôi đơn giản (÷2) |
| Service class | `KtvCommissionService.calculateBookingBonus()` | **`KtvTypeDBonusService.calcBonus()`** |

---

### 5.3 [NEW] `KtvTypeDDisciplineService.ts` — Kỷ luật trừ giờ

```
Bảng phạt TYPE_D (cài đặt được trên Admin):
┌──────────────────────────────────────────────────────┐
│ Bỏ lịch đã đăng ký (không báo / báo trễ)  → -10 giờ │
│ Báo vắng đúng hạn (trước 7h sáng)         → -5 giờ  │
│ Đến trễ không cập nhật nhóm                → -5 giờ  │
│ Từ chối tua đã gán                         → -3× giờ │
│   (VD: gói 60p → -3h, gói 90p → -4.5h)              │
└──────────────────────────────────────────────────────┘
```

**Methods:**
- `deductHours(supabase, staffId, penaltyType, bookingDurationMins?)`: Ghi `KTVServiceHoursLedger`
- `getMonthlyNetHours(supabase, staffId)`: Tổng (earned - penalty) tháng hiện tại
- `monthlyReset(supabase)`: Chốt sổ + reset về 0

**KHÔNG dùng**: `KTVDisciplinePoints`, `WalletAdjustments`, cơ chế giáng chức tự động.

---

### 5.4 [NEW] `KtvTypeDTurnService.ts` — Xếp tua theo giờ

```
Thuật toán ưu tiên TYPE_D:
1. Lấy tất cả KTV TYPE_D có status = 'waiting' trong TurnQueue
2. Sort theo accumulated_service_hours DESC
   (nhiều giờ nhất → đứng đầu → auto gán trước)
3. Nếu KTV #1 đang bận (working) → gán KTV #2
4. Tie-breaker: check_in_order (ai điểm danh trước)
```

**Methods:**
- `syncServiceHoursForDate(date)`: Quét BookingItems tháng hiện tại → cập nhật `TurnQueue.accumulated_service_hours`
- `getTurnOrder(supabase, date)`: Trả về danh sách KTV TYPE_D đã sort

---

## 6. API Routes

### Routes cần MODIFY:

| Route | Thay đổi cho TYPE_D |
|---|---|
| `POST /api/ktv/attendance` | CHECK_IN: **CÓ** trừ phí giặt đồ. Nghỉ ĐX: gọi `KtvTypeDDisciplineService.deductHours()` thay vì phạt tiền |
| `GET /api/ktv/wallet/balance` | Branch: Gọi `KtvTypeDCommissionService`, filter `work_type_snapshot = 'TYPE_D'`, include rating deduction |
| `GET /api/ktv/wallet/bonus/balance` | Branch: Gọi `KtvTypeDBonusService`, filter `work_type_snapshot = 'TYPE_D'` |
| `GET /api/turns` | Branch: TYPE_D sort `accumulated_service_hours` DESC |
| `POST /api/finance/adjustment` | Hỗ trợ `wallet_type: 'HOURS'` để admin điều chỉnh giờ tích lũy. Luôn stamp `work_type_snapshot` |
| `GET /api/finance/ktv-summary` | Thêm cột: giờ tích lũy, rating deduction, quỹ nội bộ cho TYPE_D |

### Routes MỚI:

| Route | Mục đích |
|---|---|
| `GET /api/ktv/type-d/service-hours` | Xem tổng giờ tích lũy + lịch sử phạt giờ trong tháng |
| `POST /api/cron/reset-type-d-hours` | Cron cuối tháng: Chốt sổ + reset giờ về 0 |

---

## 7. UI Changes

### Admin Settings — Tab "Loại D"

| Section | Nội dung |
|---|---|
| **Khung giá tua** | ❌ **KHÔNG dùng Milestones editor.** Chỉ **2 ô input**: Rate VIP (đ/giờ) + Rate Phổ thông (đ/giờ). Cộng bảng khấu trừ theo sao — **6 dòng (0★–5★)**, cài đặt được |
| **Bonus** | Điểm cơ bản (input số), Toggle bật/tắt, Tỷ lệ quy đổi điểm→VNĐ |
| **Kỷ luật** | 4 dòng mức trừ giờ (input số, cài đặt/nhập/xóa) |
| **Phí & Quỹ** | Quỹ nội bộ (input + **toggle bật/tắt**), Phí bảo trì (50k, input), Phí giặt đồ (20k, input), Phí kích hoạt lại (input), Tiền cọc ví (input) |

### Reception — Turns Board
- KTV TYPE_D: Cột "Giờ tích lũy" thay "Số tua"
- Sort DESC — nhiều giờ đứng đầu
- Badge 🟣 **D**

### KTV App — Wallet
- Ví tua: Số dư sau khấu trừ rating
- Ví bonus: Điểm bonus TYPE_D (tách riêng, không lẫn với bonus A/B)
- **KHÔNG** hiển thị tab Heo đất cho TYPE_D
- Giờ tích lũy tháng này

### KTV App — Dashboard
- Instant reward: Tiền sau khấu trừ rating
- Tổng giờ tích lũy tháng

---

## 8. Cron Jobs

| Cron | Thay đổi |
|---|---|
| `sync-daily-ledger` (hàng đêm) | TYPE_D: Ghi `rating_deduction`, `work_type_snapshot = 'TYPE_D'`. Trừ quỹ nội bộ nếu toggle = ON. Trừ phí bảo trì cuối tháng |
| **[NEW]** `reset-type-d-hours` (00:00 ngày 1 hàng tháng) | Chốt sổ → `KTVMonthlyServiceHours`, Reset `accumulated_service_hours` = 0 |

### ⚠️ [BỔ SUNG] Đăng ký cron trong `vercel.json`

Cron mới **sẽ không tự chạy** nếu chưa khai báo. File hiện có đúng 3 entry (`sync-daily-ledger`, `piggy-bank-deduct`, `cleanup-online`). Cần thêm:

```json
{
  "path": "/api/cron/reset-type-d-hours",
  "schedule": "0 17 1 * *"
}
```

> Giờ Vercel cron là **UTC**. `0 17 1 * *` = 00:00 ngày 2 giờ VN. Muốn đúng 00:00 ngày 1 giờ VN thì phải để `0 17 L * *` (ngày cuối tháng) — Vercel cron **không hỗ trợ `L`**, nên phương án thực tế là chạy `0 17 1 * *` (tức 00:00 ngày 2 VN) hoặc để cron chạy hằng ngày và tự kiểm tra "hôm nay có phải ngày 1 không". Cách thứ hai giống mẫu đã dùng trong `sync-daily-ledger` (§7 của route đó tự phát hiện ngày cuối tháng). **Đề xuất dùng cách thứ hai** để tránh lệch múi giờ.

Route cũng cần bảo vệ bằng `CRON_SECRET` giống các cron hiện có:
```ts
const authHeader = request.headers.get('authorization');
if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
}
```

---

## 9. Tổng Hợp Files

### Files MỚI (7 files):

| # | File | Mô tả |
|---|---|---|
| 1 | `migrations/add_type_d_support.sql` | Migration DB (5 phase) |
| 2 | `lib/services/KtvTypeDCommissionService.ts` | Tiền tua: **hệ số phẳng đ/giờ + floor 100** + rating deduction (KHÔNG milestones) |
| 3 | `lib/services/KtvTypeDBonusService.ts` | **Bonus TÁCH RIÊNG**: 20đ flat, luật chia riêng |
| 4 | `lib/services/KtvTypeDDisciplineService.ts` | Kỷ luật: trừ giờ tích lũy |
| 5 | `lib/services/KtvTypeDTurnService.ts` | Xếp tua: DESC theo giờ |
| 6 | `app/api/ktv/type-d/service-hours/route.ts` | API giờ tích lũy |
| 7 | `app/api/cron/reset-type-d-hours/route.ts` | Cron reset tháng |
| 8 | `scripts/insert_type_d_configs.js` | **[BỔ SUNG]** Seed giá trị mặc định cho 14 key SystemConfigs (mẫu: `insert_maintenance_fee_configs.js`) |
| 9 | `scripts/seed_type_d_test_accounts.js` | Tạo 11 tài khoản test T001–T079 (đã mô tả ở §11.2) |
| 10 | `scripts/cleanup_type_d_test_accounts.js` | Dọn tài khoản test trước khi merge (đã mô tả ở §11.3) |

### Files SỬA (~15-20 files):

| Nhóm | Files | Ghi chú |
|---|---|---|
| Types & Constants | `lib/types/staff.types.ts`, `lib/constants/staff.constants.ts` | |
| Turn Sync | `lib/turn-sync.ts` | Thêm branch TYPE_D |
| **Service (logic thật)** | **`lib/services/KtvWalletService.ts`** | ⚠️ **[BỔ SUNG]** Route `wallet/balance` chỉ 31 dòng, gọi thẳng service này. Logic ví nằm ở đây, không phải ở route |
| **Service (logic thật)** | **`lib/services/KtvLedgerSyncService.ts`** | ⚠️ **[BỔ SUNG]** Nơi trừ phí bảo trì cuối tháng (`processMonthlyMaintenanceFee`) |
| API Routes | `ktv/attendance/route.ts`, `ktv/wallet/balance/route.ts`, `ktv/wallet/bonus/balance/route.ts`, `turns/route.ts`, `finance/ktv-summary/route.ts`, `finance/adjustment/route.ts` | |
| **API Routes** | **`ktv/wallet/timeline/route.ts`**, **`ktv/wallet/bonus/timeline/route.ts`** | ⚠️ **[BỔ SUNG]** Cũng đọc `KTVDailyLedger` → cũng cần filter `work_type_snapshot` |
| **API Routes** | **`ktv/wallet/withdraw/route.ts`** | ⚠️ **[BỔ SUNG]** Chặn rút ngoài buổi sáng (R5 có nêu nhưng bảng file gốc bỏ sót) |
| ~~Cron piggy-bank~~ | ~~`cron/piggy-bank-deduct/route.ts`~~ | ✅ **KHÔNG cần sửa** — xem ghi chú Heo đất bên dưới |
| Cron | `cron/sync-daily-ledger/route.ts` | |
| **Config** | **`vercel.json`** | ⚠️ **[BỔ SUNG]** Đăng ký cron mới. Hiện chỉ có 3 cron, thiếu entry cho `reset-type-d-hours` |
| **Types gen** | **`supabase_types.ts`** | ⚠️ **[BỔ SUNG]** Regenerate sau migration (2 bảng mới + 5 cột mới) |
| Admin UI | `admin/settings/system/page.tsx` (tab D), `KtvFeatures.logic.ts`, `KtvFeaturesTable.tsx`, employees dropdown | ❌ **KHÔNG** cần `MilestonesEditor.tsx` — D không dùng milestones |
| KTV UI | `ktv/wallet/page.tsx`, `KTVWallet.logic.ts`, `ktv/dashboard/page.tsx` | |
| Reception UI | `reception/turns/page.tsx`, `turns.logic.ts` | |
| **Reception Dispatch** | **`reception/dispatch/useDispatchBoard.logic.ts`**, **`actions.ts`**, **`_components/QuickDispatchTable.tsx`**, **`_components/DispatchStaffRow.tsx`**, **`_components/KanbanBoard.tsx`**, **`components/shared/TurnQueueBoard/*`** (3 files), `reception/ktv-hub/page.tsx`, `api/ktv/booking/_shared/utils.ts` | ⚠️ **[BỔ SUNG]** Xem cảnh báo phạm vi bên dưới |

> [!NOTE]
> **Loại TYPE_D khỏi Heo đất — không cần sửa cron.** Đã kiểm tra `PiggyBank.service.ts`: cron chỉ quét bảng `KTVPiggyBank` với `status = 'ACTIVE'`, tức **chỉ động tới KTV đã có sổ Heo đất**. Sổ này do Admin tạo tay qua `/api/admin/piggy-bank`, không tự sinh.
>
> → Việc cần làm chỉ là: **(1)** không tạo sổ Heo đất cho KTV TYPE_D, **(2)** đặt feature flag `savings_wallet = false`, **(3)** ẩn tab Heo đất trên app KTV. Cron tự khắc không đụng tới.
>
> *(Ghi chú rà soát: bản 31/08 lần đầu ghi cron này "sẽ trừ nhầm TYPE_D" — nhận định đó SAI, đã kiểm tra lại service và sửa.)*

> [!WARNING]
> **Phạm vi dispatch bị đánh giá thấp trong bản gốc.** Bản gốc chỉ ghi mơ hồ *"dispatch files"*. Thực tế có **23 file** đụng tới `turns_completed`. Riêng [QuickDispatchTable.tsx:1142](../app/reception/dispatch/_components/QuickDispatchTable.tsx#L1142) đang sort **trộn chung mọi loại KTV** theo `turns_completed` ASC — đúng như rủi ro R1 đã cảnh báo. Ước lượng "2-3 ngày" ở §13 nên được xem lại.

> [!NOTE]
> **Thứ tự tua là GỢI Ý, không phải cưỡng chế.** Đã kiểm chứng: hệ thống **không có auto-assign KTV** ở bất kỳ đâu. Lễ tân chọn tay từ danh sách có ô tìm kiếm ([QuickDispatchTable.tsx:1131](../app/reception/dispatch/_components/QuickDispatchTable.tsx#L1131)); sort chỉ quyết định thứ tự hiển thị.
>
> **Hệ quả tích cực**: KTV D đứng cuối bảng vẫn nhận được tua qua kênh khách yêu cầu đích danh hoặc lễ tân chủ động chọn → không có bẫy chết đói.
>
> **Hệ quả cần lưu ý**: cơ chế sort DESC của chế độ D chỉ phát huy tác dụng nếu lễ tân tuân theo thứ tự hiển thị. Vì vậy việc **tách 2 danh sách riêng biệt (R1) là bắt buộc**, không phải tùy chọn — nếu để lẫn, KTV D nằm sai vị trí và toàn bộ luật xếp tua của chế độ D mất hiệu lực trên thực tế.

---

## 10. Verification Plan

### Automated Tests
- `simulate_type_d_commission.mjs`: Test hệ số phẳng + floor 100 + rating deduction (**6 mức sao 0★–5★** × VIP/Phổ thông × 10 mốc phút). Đối chiếu trực tiếp với bảng A2/B2 trong `bao_cao_bang_gia_type_d.md` — phải khớp 100%. Bắt buộc có case **5★** và case **40p/70p/100p PT** (3 mốc bị floor)
- `simulate_type_d_bonus.mjs`: Test bonus riêng (solo, 2 KTV cùng D, KTV khác chế độ, tua < 60p)
- `simulate_type_d_discipline.mjs`: Test trừ giờ (4 loại vi phạm)
- `simulate_type_d_turn_order.mjs`: Test sort DESC, busy fallback, tie-breaker

### Manual Verification (Dùng tài khoản T001-T011)
1. Admin tạo KTV TYPE_D → Kiểm tra badge & sổ tua
2. Dispatch đơn VIP cho TYPE_D → Tiền tua theo hệ số 180k/giờ + khấu trừ sao + floor 100
3. Đánh giá 3★ → Trừ 25% tiền tua
4. Đánh giá 4★ → Bonus cộng 20đ
5. 2 KTV TYPE_D cùng 1 khách → Bonus chia đôi (10đ)
6. 1 KTV TYPE_D + 1 KTV TYPE_A → Bonus TYPE_D = 0đ
7. Phạt TYPE_D bỏ lịch → Trừ 10 giờ tích lũy
8. Chuyển TYPE_A → TYPE_D giữa tháng → Ví không trộn (Temporal Tagging)
9. Reset cuối tháng → Giờ tích lũy = 0
10. Admin tab D → Sửa 2 rate (VIP/PT), bảng khấu trừ sao, bonus, phí → Lưu thành công

---

## 11. Phase 0 — Test Branch & Test Accounts (LÀM ĐẦU TIÊN)

### 11.1 Git Branch

```bash
git checkout -b feature/type-d-regime
```

Tất cả code TYPE_D sẽ được phát triển trên nhánh `feature/type-d-regime`. Chỉ merge vào `main` sau khi test đầy đủ.

### 11.2 Test Accounts — Clone từ KTV thật

Tạo **11 tài khoản test** (ID prefix `T`) clone từ nhân viên thật (NH). Giữ nguyên `avatar_url`, `skills`, `feature_flags` để đảm bảo VIP menu hoạt động.

| Test ID | Clone từ | Tên gốc | Work Type | VIP | Avatar |
|---|---|---|---|---|---|
| `T001` | `NH001` | Phát | **TYPE_D** | ✅ bật | ✅ `NH001.jpg` |
| `T002` | `NH002` | NHI | **TYPE_D** | ✅ giữ | ✅ `NH002.jpg` |
| `T011` | `NH011` | Yully | **TYPE_D** | ✅ giữ | ✅ `NH011.jpg` |
| `T014` | `NH014` | Tea | **TYPE_D** | ✅ giữ | ✅ `NH014.jpg` |
| `T016` | `NH016` | Tieu Kim Nghi | **TYPE_D** | ✅ bật | ✅ `NH016.jpg` |
| `T018` | `NH018` | Cherry | **TYPE_D** | ✅ giữ | ✅ `NH018.jpg` |
| `T021` | `NH021` | Ua | **TYPE_D** | ✅ giữ | ✅ `NH021.jpg` |
| `T025` | `NH025` | Rose | **TYPE_D** | ✅ giữ | ✅ `NH025.jpg` |
| `T027` | `NH027` | Sunny | **TYPE_D** | ✅ giữ | ✅ `NH027.png` |
| `T069` | `NH069` | JK | **TYPE_D** | ✅ bật | ✅ external |
| `T079` | `NH079` | Hiếu | **TYPE_D** | ✅ giữ | ✅ external |

**Script tạo**: `scripts/seed_type_d_test_accounts.js`

```javascript
// Flow:
// 1. Đọc Staff NH001, NH002, ... (select *)
// 2. Clone sang T001, T002, ... với:
//    - id: thay NH → T
//    - full_name: giữ nguyên + " (Test D)"
//    - work_type: 'TYPE_D'
//    - is_active_vip_menu: true (tất cả đều bật VIP)
//    - status: 'ĐANG LÀM'
//    - avatar_url: giữ nguyên URL gốc (ảnh NH)
//    - skills: giữ nguyên
//    - feature_flags: merge với TYPE_D defaults
//    - Không clone: phone, id_card, bank_account (bảo mật)
// 3. Upsert vào Staff table (conflict on id → update)
```

### 11.3 Dọn dẹp sau test

Script `scripts/cleanup_type_d_test_accounts.js`:
- Xóa tất cả Staff có `id LIKE 'T%'`
- Xóa TurnQueue, KTVServiceHoursLedger, KTVDailyLedger, KTVBonusLedger có `staff_id LIKE 'T%'`
- Chạy trước khi merge vào `main`

---

## 12. ⚠️ Phản Biện & Phân Tích Rủi Ro

### 🔴 RỦI RO CAO

#### R1: Dispatch Board lẫn TYPE_D với TYPE_A/B/C

**Vấn đề**: `TurnQueue` chứa MỌI loại KTV. Nếu không filter đúng, dispatch sẽ sort lẫn (TYPE_A theo `turns_completed` ASC, TYPE_D theo `accumulated_service_hours` DESC) → gán sai người.

**Giải pháp**: Dispatch Board phải JOIN `Staff.work_type` và **tách 2 danh sách riêng biệt**:
- List A/B/C: Sort `turns_completed` ASC (logic cũ)
- List D: Sort `accumulated_service_hours` DESC (logic mới)

Lễ tân nhìn 2 tab riêng hoặc 2 section riêng trên cùng board.

---

#### R2: Tiền tua bị tính sai khi rating chưa có

**Vấn đề**: TYPE_D khấu trừ tiền tua theo rating. Nhưng rating thường được nhập **sau khi đơn hoàn tất** (khách đánh giá sau). Lúc đơn vừa DONE, rating = 0 → hệ thống tính sao?

**Giải pháp 2 bước**:
1. **Tạm tính 100%**: Khi đơn DONE mà chưa có rating → tạm ghi nhận 100% tiền tua (giả định 4★)
2. **Truy thu/hoàn**: Khi rating được nhập → Cron hoặc webhook recalculate → ghi `rating_deduction` chênh lệch vào `KTVDailyLedger`

> [!WARNING]
> Nếu khách KHÔNG đánh giá (rating = 0 mãi), cần policy: Mặc định tính 4★? Hay 0★? → **Đề xuất: Mặc định 4★ (100%)** — giống hệ thống hiện tại cho bonus.

---

#### R3: Tính giờ tích lũy bị trôi khi BookingItems bị sửa sau

**Vấn đề**: `syncServiceHoursForDate()` quét BookingItems để tổng hợp giờ. Nhưng Admin có thể sửa `segments`, thay đổi `duration`, hoặc cancel đơn cũ → giờ tích lũy bị lệch mà KTV không biết.

**Giải pháp**:
- `syncServiceHoursForDate()` luôn **tính lại từ đầu** (full re-scan) mỗi lần gọi, không dùng incremental
- Lưu `KTVServiceHoursLedger` chỉ ghi `hours_earned` từ scan gần nhất (idempotent upsert)
- Admin log khi sửa đơn cũ → notification cho KTV bị ảnh hưởng

---

### 🟡 RỦI RO TRUNG BÌNH

#### R4: `work_type_snapshot` quên stamp khi tạo bút toán

**Vấn đề**: Nếu bất kỳ API nào tạo record vào `KTVDailyLedger` / `KTVBonusLedger` mà quên ghi `work_type_snapshot`, record đó sẽ là `NULL` → fallback vào TYPE_A → TYPE_D mất tiền.

**Giải pháp**:
- Tạo helper function `getWorkTypeSnapshot(supabase, staffId)` → dùng ở MỌI nơi tạo ledger record
- Thêm DB trigger (optional): `BEFORE INSERT ON KTVDailyLedger → SET work_type_snapshot = (SELECT work_type FROM Staff WHERE id = NEW.staff_id)` — phòng trường hợp code quên

---

#### R5: KTV TYPE_D bấm rút tiền ngoài buổi sáng

**Vấn đề**: PDF nói "yêu cầu rút tiền phải đăng ký buổi sáng". Nếu hệ thống không enforce → KTV bấm bất kỳ lúc nào → vi phạm quy chế.

**Giải pháp**: 
- Feature flag `withdraw_morning_only = true` trên Staff
- API `/api/ktv/wallet/withdraw` kiểm tra: Nếu TYPE_D + flag ON + giờ hiện tại > 12:00 VN → reject với message "Vui lòng đăng ký rút tiền vào buổi sáng"
- Admin có thể tắt flag cho từng KTV nếu cần linh hoạt

---

#### R6: Bonus 0đ khi làm chung KTV khác chế độ — KTV phản đối

**Vấn đề**: Luật TYPE_D: "Tua có sự tham gia của nhân sự KHÔNG cùng chế độ → không cộng bonus". Nếu KTV TYPE_D bị dispatch chung với TYPE_A (do thiếu người), TYPE_D mất bonus → bất mãn.

**Giải pháp**:
- Dispatch Board nên **ưu tiên ghép KTV cùng chế độ** khi cần 2 KTV
- Nếu buộc phải ghép khác chế độ → hiện cảnh báo cho lễ tân: "⚠️ Ghép khác chế độ: KTV TYPE_D sẽ không nhận bonus"
- KTV thấy lý do trên timeline ví: "Không nhận bonus — tua ghép với KTV khác chế độ"

---

### 🟢 RỦI RO THẤP

#### R7: Reset giờ cuối tháng bị lỡ (Cron fail)

**Vấn đề**: Nếu cron `reset-type-d-hours` fail vào ngày 1 → KTV mang giờ tháng cũ sang tháng mới → ưu tiên sai.

**Giải pháp**:
- Cron retry 3 lần nếu fail
- API manual trigger cho Admin: "Reset giờ tích lũy TYPE_D" (nút trên Admin tab D)
- Cron ghi log chi tiết → notification Admin nếu fail

---

#### R8: Test accounts T001-T011 lọt vào production data

**Vấn đề**: Nếu quên cleanup, tài khoản test xuất hiện trên báo cáo tài chính, dispatch board thật.

**Giải pháp**:
- Tên hiển thị có suffix `(Test D)` → dễ nhận biết
- Script cleanup chạy trước merge
- Báo cáo tài chính có thể filter `WHERE staff_id NOT LIKE 'T%'` (optional)

---

## 13. Ước Lượng & Phân Chia

| Phase | Effort | Ưu tiên |
|---|---|---|
| **Phase 0: Branch + Test Accounts** | 🟢 Nhỏ | **P0 — LÀM ĐẦU TIÊN** |
| Phase 1: DB Migration | 🟢 Nhỏ | P0 |
| Phase 2: Types & Constants | 🟢 Nhỏ | P0 |
| Phase 3: 4 Service Classes | 🔴 Lớn (~400-600 LOC) | P0 — Core logic |
| Phase 4: API Routes | 🟡 Trung bình | P1 |
| Phase 5: Admin UI (Tab D) | 🟡 Trung bình | P1 |
| Phase 6: Reception UI | 🟡 Trung bình | P2 |
| Phase 7: KTV App | 🟡 Trung bình | P2 |
| Phase 8: Cron Jobs | 🟢 Nhỏ | P2 |

**Tổng**: ~2-3 ngày, nên chia 3-4 Executor windows.

**Gợi ý chia team**:
- **Executor 1**: Phase 0-3 (Branch + DB + Types + 4 Services) — Backend core
- **Executor 2**: Phase 4-5 (API Routes + Admin UI) — Backend + Admin
- **Executor 3**: Phase 6-8 (Reception + KTV App + Cron) — Frontend + Jobs

---

## 14. ⏳ Câu Hỏi Nghiệp Vụ Chưa Chốt (BỔ SUNG 31/08)

> Đây là những điểm **không thể suy ra từ code hay từ plan** — cần quyết định của chủ doanh nghiệp. Cột "Hậu quả nếu bỏ qua" mô tả điều gì xảy ra nếu executor tự đoán.

### 🔴 Bắt buộc chốt trước khi code

| # | Câu hỏi | Hậu quả nếu bỏ qua | Đề xuất |
|---|---|---|---|
| **1** | **5★ khấu trừ bao nhiêu %?** Bảng gốc chỉ có 4/3/2/1, nhưng hệ thống chấm thang 1–5 | `deduction[5]` = `undefined` → `basePay × (1 - undefined)` = **`NaN`** ghi thẳng vào ví KTV, ngay tua 5★ đầu tiên | **5★ = 100%** (bằng 4★). Đã tạm ghi vào §4, cần bạn xác nhận |
| **2** | **Khấu trừ theo từng item hay theo cả booking?** | Nếu lấy max như code bonus cũ: KTV làm 2 item (4★ + 1★) được hưởng 100% cả hai → thất thoát | **Theo từng `BookingItem`** (đã ghi vào §5.1) |
| **3** | **Chính sách khi ví ÂM.** Chi phí cố định ~820k/tháng (quỹ 250k + bảo trì 50k + giặt đồ 20k×26 ngày). KTV ít tua sẽ âm ví | Chưa có định nghĩa → hệ thống trừ thẳng vào cọc 500k, cọc cạn thì hành vi **không xác định** | Cần chốt: trừ vào cọc → cạn thì khoá? cho nợ? tạm ngưng trừ quỹ? |
| **4** | **Chuyển chế độ có hiệu lực ngay hay từ ngày hôm sau?** (xem cảnh báo §2.2) | Ví bị tính lại sai toàn bộ cửa sổ realtime khi Admin đổi chế độ giữa ngày | **Hiệu lực từ 00:00 hôm sau** — đơn giản nhất, không phải sửa nhánh realtime |

### 🟡 Cần chốt trước khi làm UI/Bonus

| # | Câu hỏi | Ghi chú |
|---|---|---|
| **5** | ~~1 điểm bonus = bao nhiêu VNĐ?~~ **ĐÃ CÓ ĐÁP ÁN** ✅ | Hệ thống đã có sẵn `ktv_bonus_rate` = **1000** (1 điểm = 1.000đ), và cả 3 bản per-type `ktv_bonus_rate_TYPE_A/B/C` = 1000 (kiểm tra DB production 31/08). → Chỉ cần thêm `ktv_bonus_rate_TYPE_D = 1000`. **Bonus TYPE_D 20đ/tua = 20.000đ/tua** — tương đương ~11% một tua VIP 60p (180k) hoặc 20% một tua PT 60p (100k). Đây là khoản đáng kể, **cần bạn xác nhận có đúng ý không** trước khi chốt |
| **6** | **Luật "ghép khác chế độ → bonus 0đ"** (xem R6) | Điều khoản này phạt KTV vì quyết định của **lễ tân**, không phải của họ. 3 hướng: (a) chặn cứng ở dispatch không cho ghép khác chế độ, (b) vẫn trả 20đ/2 như ghép cùng chế độ, (c) giữ nguyên luật và chấp nhận rủi ro bất mãn |
| **7** | **Hàng rào quản trị cho rating.** Ở A/B/C rating chỉ ảnh hưởng bonus 20đ; ở D nó cắt **25–75% lương** (một tua 90p VIP tụt 4★→3★ mất 67.500đ) | Cần chốt: ai được quyền nhập/sửa? Có khoá sau X giờ không? Có audit log ai sửa không? Quy trình khiếu nại? Đây là nguồn tranh chấp lao động lớn nhất của chế độ D |
| **8** | **Phạt giờ có carry-over sang tháng sau không?** | Do reset về 0 mỗi đầu tháng, cùng một mức phạt có sức nặng chênh nhau ~10 lần tùy phạm lỗi ngày 3 hay ngày 28. Đây là vấn đề của **cơ chế reset**, độc lập với con số phạt (con số đã xác nhận là chỉnh được ở Admin) |

### 🟢 Định nghĩa kỹ thuật cần làm rõ (ảnh hưởng số liệu, không chặn)

| # | Câu hỏi | Chi tiết |
|---|---|---|
| **9** | **Giờ dự kiến hay giờ thực tế?** | Code có **2 hàm khác nhau**: `calculateItemExpectedDuration()` ([KtvCommissionService.ts:248](../lib/services/KtvCommissionService.ts#L248)) và `calculateItemDuration()` (`:265`). Chúng cho kết quả khác nhau khi khách về sớm hoặc KTV làm quá giờ. **Tiền tua D** dùng cái nào? **Giờ tích lũy** dùng cái nào? (Có thể khác nhau — ví dụ tiền theo dự kiến, giờ xếp hạng theo thực tế) |
| **10** | **Tua ghép 2 KTV: giờ tích lũy tính sao?** | Mỗi người cộng **đủ** giờ, hay **chia đôi**? Ảnh hưởng trực tiếp tới thứ hạng hàng đợi — cộng đủ thì KTV hay được ghép sẽ leo top rất nhanh |
| **11** | **Dịch vụ tiện ích (`is_utility`) có tính không?** | Hệ thống hiện xử lý riêng nhóm này (`svcUtilityMap` trong `sync-daily-ledger`). D có tính tiền tua + giờ tích lũy cho dịch vụ tiện ích không? |
| **12** | **Chuyển ra rồi chuyển vào lại chế độ D** | §2.2 nói giờ bị "freeze" khi chuyển ra. Khi vào lại: nhận lại giờ đã freeze, hay bắt đầu từ 0? Nếu nhận lại thì có kẽ hở chuyển ra/vào để né phạt hoặc giữ hạng |
| **13** | **Tiền cọc ví TYPE_D: 500k hay 1 triệu?** | Plan ghi 500.000. Nhưng DB production đang là `ktv_deposit_amount_TYPE_A` = **1.000.000**, `_TYPE_B` = **1.000.000**, `_TYPE_C` = 0. Đặt D = 500k tức **thấp hơn một nửa so với A/B** — cần xác nhận là chủ ý |
| **14** | **Phí giặt đồ & bảo trì: dùng chung mức global hay đặt mức riêng cho D?** | Hiện code đọc key global bằng `.eq()` cứng, không hỗ trợ per-type (xem cảnh báo §4). Hướng (a) dùng chung 20k/50k → **không phải sửa code**. Hướng (b) mức riêng → phải sửa code dùng chung của A/B/C, có rủi ro hồi quy |

---

## 15. ✅ Checklist Trước Khi Bắt Đầu Phase 0

- [ ] Trả lời xong câu 1–4 ở §14 (bắt buộc)
- [x] ~~Xác nhận CHECK constraint `check_work_type` trên DB thật~~ — **ĐÃ KIỂM TRA 31/08 trên production**:
      `CHECK (work_type = ANY (ARRAY['TYPE_A','TYPE_B','TYPE_C']))` — constraint **đang sống thật**, khớp file migration,
      không ai sửa qua dashboard. → **PHASE 0 của migration là bắt buộc.**
      Phân bố hiện tại: TYPE_C 127 NV · TYPE_A 16 NV · TYPE_B 2 NV.
- [ ] **Sửa `.env.local`**: host pooler còn là `aws-0-ap-southeast-1...` (đã cũ), phải đổi thành `aws-1-...`
      ở cả `DATABASE_URL` và `DIRECT_URL`. Hiện mọi script node chạy local đều fail với lỗi
      `(ENOTFOUND) tenant/user postgres.xxx not found`. Không ảnh hưởng app trên Vercel.
- [ ] Xác nhận công thức giá lấy theo `bao_cao_bang_gia_type_d.md`, **không** theo bản plan gốc
- [ ] Tạo nhánh `feature/type-d-regime`
- [ ] Migration đặt tại `supabase/migrations/`, **không** phải `migrations/`
- [ ] Có script seed SystemConfigs, không chỉ liệt kê key
