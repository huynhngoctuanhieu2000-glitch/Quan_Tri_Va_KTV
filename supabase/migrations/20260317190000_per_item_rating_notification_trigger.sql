-- ============================================================
-- Per-Item Rating Notification Trigger
-- Gửi notification RIÊNG cho từng KTV dựa trên itemRating
-- ============================================================

-- 1. Hàm xử lý khi BookingItem có đánh giá
CREATE OR REPLACE FUNCTION public.fn_notify_ktv_on_item_rating()
RETURNS TRIGGER AS $$
DECLARE
    v_booking RECORD;
    v_tech_code TEXT;
    v_reward_points INTEGER := 25;
    v_rating_label TEXT;
BEGIN
    -- Chỉ chạy khi itemRating thay đổi từ NULL sang có giá trị
    IF OLD."itemRating" IS NOT NULL OR NEW."itemRating" IS NULL THEN
        RETURN NEW;
    END IF;

    -- Lấy thông tin booking (billCode)
    SELECT "billCode", "technicianCode" INTO v_booking
    FROM public."Bookings"
    WHERE id = NEW."bookingId"
    LIMIT 1;

    -- Lấy technicianCode từ item hoặc fallback booking
    v_tech_code := COALESCE(NEW."technicianCode", v_booking."technicianCode");
    
    IF v_tech_code IS NULL OR v_tech_code = '' THEN
        RETURN NEW;
    END IF;

    -- Xác định label đánh giá
    CASE NEW."itemRating"
        WHEN 4 THEN v_rating_label := 'XUẤT SẮC 🤩';
        WHEN 3 THEN v_rating_label := 'TỐT 🙂';
        WHEN 2 THEN v_rating_label := 'BÌNH THƯỜNG 😐';
        WHEN 1 THEN v_rating_label := 'TỆ 😡';
        ELSE v_rating_label := 'Không xác định';
    END CASE;

    -- THƯỞNG: Rating >= 4 (Xuất sắc)
    IF NEW."itemRating" >= 4 THEN
        INSERT INTO public."StaffNotifications" (
            "bookingId", "employeeId", "type", "message", "isRead", "createdAt"
        ) VALUES (
            NEW."bookingId",
            trim(v_tech_code),
            'REWARD',
            'Bạn nhận được ' || v_reward_points || 'đ đánh giá ' || v_rating_label || ' từ đơn hàng #' || COALESCE(v_booking."billCode", '???'),
            false,
            now()
        );
    END IF;

    -- CẢNH BÁO: Rating = 1 (Tệ) → thông báo cho Admin
    IF NEW."itemRating" = 1 THEN
        INSERT INTO public."StaffNotifications" (
            "bookingId", "employeeId", "type", "message", "isRead", "createdAt"
        ) VALUES (
            NEW."bookingId",
            NULL, -- NULL = thông báo chung cho Admin/Quầy
            'COMPLAINT',
            'Khách đánh giá TỆ cho NV ' || trim(v_tech_code) || ' trong đơn #' || COALESCE(v_booking."billCode", '???') || '. ' || COALESCE(NEW."itemFeedback", ''),
            false,
            now()
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Tạo trigger trên BookingItems
DROP TRIGGER IF EXISTS tr_notify_ktv_on_item_rating ON public."BookingItems";
CREATE TRIGGER tr_notify_ktv_on_item_rating
AFTER UPDATE OF "itemRating" ON public."BookingItems"
FOR EACH ROW
EXECUTE FUNCTION public.fn_notify_ktv_on_item_rating();

-- 3. (Tùy chọn) Vô hiệu hóa trigger CŨ trên Bookings.rating để tránh gửi duplicate
-- Nếu muốn giữ cho backward-compatible, có thể bỏ dòng này:
DROP TRIGGER IF EXISTS tr_notify_ktv_on_rating ON public."Bookings";
