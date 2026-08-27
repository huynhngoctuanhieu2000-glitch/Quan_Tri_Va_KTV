# 🆕 Chế Độ KTV TYPE_D — Bản Kế Hoạch FINAL

> **Trạng thái**: Tất cả quyết định kiến trúc & câu hỏi mở đã chốt ✅
> **Cập nhật**: 2026-08-27 00:07

---

## 1. Tổng Quan & So Sánh

| Tiêu chí | Hiện tại (TYPE_A/B/C) | TYPE_D ("D") |
|---|---|---|
| **Tên hiển thị** | Cơ bản / Hợp tác / Nhập tay | **D** |
| **Xếp thứ tự tua** | Theo `turns_completed` (ít tua → ưu tiên) | Theo **tổng thời gian làm tua** (**nhiều giờ → ưu tiên gán trước**). Bận → gán người kế |
| **Reset sổ tua** | Không rõ / thủ công | **Reset cuối mỗi tháng** về 0 giờ |
| **Khung giá tua** | Milestones riêng per-type | **Lấy theo khung giá TYPE_B** (milestones). VIP = rate B, Phổ thông = fallback A |
| **Khấu trừ theo sao** | Không có (chỉ trừ bonus) | **4★=100%, 3★=75%, 2★=50%, 1★=25%** tiền tua |
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

### [NEW] `migrations/add_type_d_support.sql`

```sql
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
+    vip_menu_enabled: boolean;
+    bonus_enabled: boolean;
+    laundry_fee_enabled: boolean;
+    internal_fund_enabled: boolean;    // Quỹ nội bộ 250k — toggle bật/tắt
+    withdraw_morning_only: boolean;
+    [key: string]: any;
+}
```

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
+    vip_menu_enabled: true,
+    bonus_enabled: true,
+    laundry_fee_enabled: true,
+    internal_fund_enabled: true,
+    withdraw_morning_only: true
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
+    4: 0,     // 4★: 100%
+    3: 0.25,  // 3★: 75%
+    2: 0.50,  // 2★: 50%
+    1: 0.75   // 1★: 25%
+} as const;

+// TYPE_D Bonus: Flat points (cài đặt được trên Admin)
+export const TYPE_D_BONUS = {
+    BASE_POINTS: 20      // 20đ/tua nếu 4★
+} as const;
```

### SystemConfigs Keys mới cho TYPE_D:

| Key | Default | Mô tả | Cài đặt được |
|---|---|---|---|
| `ktv_commission_milestones_TYPE_D` | Copy từ TYPE_B | Khung giá tua (milestones) | ✅ Nhập/Xóa/Sửa |
| `ktv_commission_per_60min_TYPE_D` | `180000` | Rate per 60min fallback | ✅ |
| `ktv_deposit_amount_TYPE_D` | `500000` | Tiền cọc ví | ✅ |
| `enable_ktv_bonus_TYPE_D` | `true` | Bật/tắt bonus | ✅ Toggle |
| `ktv_type_d_bonus_points` | `20` | Điểm bonus mỗi tua 4★ | ✅ |
| `ktv_type_d_rating_deduction` | `{4:0, 3:0.25, 2:0.5, 1:0.75}` | Bảng khấu trừ theo sao | ✅ |
| `ktv_type_d_discipline_rules` | `{ABSENT_NO_NOTICE:10,...}` | Mức trừ giờ kỷ luật | ✅ |
| `ktv_type_d_internal_fund` | `250000` | Quỹ nội bộ/tháng | ✅ |
| `ktv_type_d_internal_fund_enabled` | `true` | Toggle quỹ nội bộ | ✅ Toggle |
| `ktv_type_d_reactivation_fee` | `1000000` | Phí kích hoạt lại | ✅ |
| `laundry_fee_TYPE_D` | `20000` | Phí giặt đồ/ngày | ✅ |
| `maintenance_fee_TYPE_D` | `50000` | Phí bảo trì/tháng | ✅ |

---

## 5. Core Service Classes — 4 FILES MỚI (LOGIC ĐỘC LẬP)

### 5.1 [NEW] `KtvTypeDCommissionService.ts` — Tiền tua

> **Khung giá lấy theo TYPE_B** (milestones), NHƯNG có thêm **khấu trừ theo đánh giá sao**.

```
Flow tính tiền tua TYPE_D:
1. Lấy milestones từ SystemConfigs key `ktv_commission_milestones_TYPE_D`
   (khởi tạo = copy từ TYPE_B)
2. Xác định service type:
   - VIP (NHP/NHT): Dùng milestones TYPE_D
   - Phổ thông (NHS): Fallback milestones TYPE_A
3. Tra mốc milestones → basePay
4. Lấy rating KTV cho đơn này
5. Áp dụng khấu trừ: finalPay = basePay × (1 - deduction[rating])
```

**Methods:**
- `getConfig(supabase)`: Đọc milestones TYPE_D, rating deduction table từ SystemConfigs
- `calcCommission(durationMins, serviceId, ktvRating, config)`: Tính tiền tua sau khấu trừ
- `calcItemCommission(item, techCode, config)`: Tính cho 1 BookingItem cụ thể

---

### 5.2 [NEW] `KtvTypeDBonusService.ts` — Bonus ĐỘC LẬP ⭐

> **Hoàn toàn tách biệt** với `calculateBookingBonus` trong `KtvCommissionService.ts`.

```
Quy tắc Bonus TYPE_D:
┌─────────────────────────────────────────────────┐
│ 1. Rating < 4★ → 0đ                            │
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
| Tua < 60 phút | Mất trắng (0đ) | **Vẫn được 20đ** nếu 4★ |
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
| **Khung giá tua** | Milestones editor (copy giao diện từ tab TYPE_B), Rate per 60min, Bảng khấu trừ theo sao (4 dòng, cài đặt được) |
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

---

## 9. Tổng Hợp Files

### Files MỚI (7 files):

| # | File | Mô tả |
|---|---|---|
| 1 | `migrations/add_type_d_support.sql` | Migration DB (5 phase) |
| 2 | `lib/services/KtvTypeDCommissionService.ts` | Tiền tua: milestones TYPE_B + rating deduction |
| 3 | `lib/services/KtvTypeDBonusService.ts` | **Bonus TÁCH RIÊNG**: 20đ flat, luật chia riêng |
| 4 | `lib/services/KtvTypeDDisciplineService.ts` | Kỷ luật: trừ giờ tích lũy |
| 5 | `lib/services/KtvTypeDTurnService.ts` | Xếp tua: DESC theo giờ |
| 6 | `app/api/ktv/type-d/service-hours/route.ts` | API giờ tích lũy |
| 7 | `app/api/cron/reset-type-d-hours/route.ts` | Cron reset tháng |

### Files SỬA (~15-20 files):

| Nhóm | Files |
|---|---|
| Types & Constants | `staff.types.ts`, `staff.constants.ts` |
| Turn Sync | `turn-sync.ts` (thêm branch TYPE_D) |
| API Routes | `attendance/route.ts`, `wallet/balance/route.ts`, `wallet/bonus/balance/route.ts`, `turns/route.ts`, `finance/ktv-summary/route.ts`, `finance/adjustment/route.ts` |
| Admin UI | `system/page.tsx` (tab D), `KtvFeaturesTable.tsx`, `MilestonesEditor.tsx`, employees dropdown |
| KTV UI | `wallet/page.tsx`, `KTVWallet.logic.ts`, `dashboard/page.tsx` |
| Reception UI | `turns/page.tsx`, `turns.logic.ts`, dispatch files |
| Cron | `sync-daily-ledger/route.ts` |

---

## 10. Verification Plan

### Automated Tests
- `simulate_type_d_commission.mjs`: Test milestones TYPE_B + rating deduction (4 mức sao × VIP/Phổ thông)
- `simulate_type_d_bonus.mjs`: Test bonus riêng (solo, 2 KTV cùng D, KTV khác chế độ, tua < 60p)
- `simulate_type_d_discipline.mjs`: Test trừ giờ (4 loại vi phạm)
- `simulate_type_d_turn_order.mjs`: Test sort DESC, busy fallback, tie-breaker

### Manual Verification (Dùng tài khoản T001-T011)
1. Admin tạo KTV TYPE_D → Kiểm tra badge & sổ tua
2. Dispatch đơn VIP cho TYPE_D → Tiền tua theo milestones B + khấu trừ
3. Đánh giá 3★ → Trừ 25% tiền tua
4. Đánh giá 4★ → Bonus cộng 20đ
5. 2 KTV TYPE_D cùng 1 khách → Bonus chia đôi (10đ)
6. 1 KTV TYPE_D + 1 KTV TYPE_A → Bonus TYPE_D = 0đ
7. Phạt TYPE_D bỏ lịch → Trừ 10 giờ tích lũy
8. Chuyển TYPE_A → TYPE_D giữa tháng → Ví không trộn (Temporal Tagging)
9. Reset cuối tháng → Giờ tích lũy = 0
10. Admin tab D → Sửa milestones, bonus, phí → Lưu thành công

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
