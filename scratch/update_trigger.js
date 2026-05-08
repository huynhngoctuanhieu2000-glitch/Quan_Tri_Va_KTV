const { Client } = require('pg');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8');
const connStr = env.match(/DIRECT_URL="([^"]+)"/)[1];

async function updateTrigger() {
    const client = new Client({ connectionString: connStr });
    await client.connect();

    const newTrigger = `
CREATE OR REPLACE FUNCTION public.fn_notify_ktv_on_item_rating()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_booking RECORD;
    v_tech_code text;
    v_rating_label text;
    v_old_ktv_ratings jsonb;
    v_ktv_ratings jsonb;
    v_ktv_rating INTEGER;
    v_old_ktv_rating INTEGER;
BEGIN
    -- Lấy thông tin booking
    SELECT * INTO v_booking FROM public."Bookings" WHERE id = NEW."bookingId";
    IF NOT FOUND THEN RETURN NEW; END IF;

    -- ─── 1. XỬ LÝ THEO KTV RATINGS CHI TIẾT ────────────────────────────────
    IF NEW."ktvRatings" IS NOT NULL AND OLD."ktvRatings" IS DISTINCT FROM NEW."ktvRatings" AND NEW."technicianCodes" IS NOT NULL THEN
        v_ktv_ratings := NEW."ktvRatings";
        v_old_ktv_ratings := COALESCE(OLD."ktvRatings", '{}'::jsonb);

        FOREACH v_tech_code IN ARRAY NEW."technicianCodes"
        LOOP
            v_tech_code := trim(v_tech_code);
            IF v_tech_code = '' THEN CONTINUE; END IF;

            v_ktv_rating := COALESCE((v_ktv_ratings->>v_tech_code)::INTEGER, 0);
            v_old_ktv_rating := COALESCE((v_old_ktv_ratings->>v_tech_code)::INTEGER, 0);

            -- CHỈ XỬ LÝ NẾU RATING CỦA KTV NÀY MỚI ĐƯỢC CẬP NHẬT
            IF v_ktv_rating != v_old_ktv_rating AND v_ktv_rating > 0 THEN
                CASE v_ktv_rating
                    WHEN 4 THEN v_rating_label := 'XUẤT SẮC 🤩';
                    WHEN 3 THEN v_rating_label := 'TỐT 🙂';
                    WHEN 2 THEN v_rating_label := 'BÌNH THƯỜNG 😐';
                    WHEN 1 THEN v_rating_label := 'TỆ 😡';
                    ELSE v_rating_label := 'Không xác định';
                END CASE;

                IF v_ktv_rating >= 4 THEN
                    -- KTV xuất sắc → nhận thưởng
                    INSERT INTO public."StaffNotifications" (
                        "bookingId", "employeeId", "type", "message", "isRead", "createdAt"
                    ) VALUES (
                        NEW."bookingId", v_tech_code, 'REWARD',
                        'Bạn nhận được ĐIỂM THƯỞNG đánh giá ' || v_rating_label || ' từ đơn hàng #' || COALESCE(v_booking."billCode", '???'),
                        false, now()
                    );
                    -- THÊM: Báo cho Quầy
                    INSERT INTO public."StaffNotifications" (
                        "bookingId", "employeeId", "type", "message", "isRead", "createdAt"
                    ) VALUES (
                        NEW."bookingId", NULL, 'FEEDBACK',
                        'KTV ' || v_tech_code || ' nhận đánh giá ' || v_rating_label || ' từ đơn #' || COALESCE(v_booking."billCode", '???'),
                        false, now()
                    );
                ELSIF v_ktv_rating = 1 THEN
                    -- KTV bị đánh giá tệ → cảnh báo
                    INSERT INTO public."StaffNotifications" (
                        "bookingId", "employeeId", "type", "message", "isRead", "createdAt"
                    ) VALUES (
                        NEW."bookingId", v_tech_code, 'COMPLAINT',
                        'Bạn nhận được đánh giá TỆ 😡 từ đơn hàng #' || COALESCE(v_booking."billCode", '???') || '. ' || COALESCE(NEW."itemFeedback", ''),
                        false, now()
                    );
                    -- Cảnh báo Admin
                    INSERT INTO public."StaffNotifications" (
                        "bookingId", "employeeId", "type", "message", "isRead", "createdAt"
                    ) VALUES (
                        NEW."bookingId", NULL, 'COMPLAINT',
                        'Khách đánh giá TỆ cho NV ' || v_tech_code || ' trong đơn #' || COALESCE(v_booking."billCode", '???') || '. ' || COALESCE(NEW."itemFeedback", ''),
                        false, now()
                    );
                END IF;
            END IF;
        END LOOP;

        RETURN NEW;
    END IF;

    -- ─── 2. XỬ LÝ THEO ITEMRATING CHUNG (Fallback) ────────────────────────
    IF OLD."itemRating" IS DISTINCT FROM NEW."itemRating" AND NEW."itemRating" IS NOT NULL THEN
        CASE NEW."itemRating"
            WHEN 4 THEN v_rating_label := 'XUẤT SẮC 🤩';
            WHEN 3 THEN v_rating_label := 'TỐT 🙂';
            WHEN 2 THEN v_rating_label := 'BÌNH THƯỜNG 😐';
            WHEN 1 THEN v_rating_label := 'TỆ 😡';
            ELSE v_rating_label := 'Không xác định';
        END CASE;

        IF NEW."technicianCodes" IS NOT NULL AND array_length(NEW."technicianCodes", 1) > 0 THEN
            v_tech_code := trim(NEW."technicianCodes"[1]);
        ELSE
            v_tech_code := v_booking."technicianCode";
        END IF;

        IF v_tech_code IS NULL OR v_tech_code = '' THEN
            RETURN NEW;
        END IF;

        IF NEW."itemRating" >= 4 THEN
            IF NEW."technicianCodes" IS NOT NULL THEN
                FOREACH v_tech_code IN ARRAY NEW."technicianCodes"
                LOOP
                    v_tech_code := trim(v_tech_code);
                    IF v_tech_code != '' THEN
                        INSERT INTO public."StaffNotifications" (
                            "bookingId", "employeeId", "type", "message", "isRead", "createdAt"
                        ) VALUES (
                            NEW."bookingId", v_tech_code, 'REWARD',
                            'Bạn nhận được ĐIỂM THƯỞNG đánh giá ' || v_rating_label || ' từ đơn hàng #' || COALESCE(v_booking."billCode", '???'),
                            false, now()
                        );
                        -- THÊM: Báo cho Quầy
                        INSERT INTO public."StaffNotifications" (
                            "bookingId", "employeeId", "type", "message", "isRead", "createdAt"
                        ) VALUES (
                            NEW."bookingId", NULL, 'FEEDBACK',
                            'KTV ' || v_tech_code || ' nhận đánh giá ' || v_rating_label || ' từ đơn #' || COALESCE(v_booking."billCode", '???'),
                            false, now()
                        );
                    END IF;
                END LOOP;
            ELSIF v_booking."technicianCode" IS NOT NULL THEN
                INSERT INTO public."StaffNotifications" (
                    "bookingId", "employeeId", "type", "message", "isRead", "createdAt"
                ) VALUES (
                    NEW."bookingId", trim(v_booking."technicianCode"), 'REWARD',
                    'Bạn nhận được ĐIỂM THƯỞNG đánh giá ' || v_rating_label || ' từ đơn hàng #' || COALESCE(v_booking."billCode", '???'),
                    false, now()
                );
                -- THÊM: Báo cho Quầy
                INSERT INTO public."StaffNotifications" (
                    "bookingId", "employeeId", "type", "message", "isRead", "createdAt"
                ) VALUES (
                    NEW."bookingId", NULL, 'FEEDBACK',
                    'KTV ' || trim(v_booking."technicianCode") || ' nhận đánh giá ' || v_rating_label || ' từ đơn #' || COALESCE(v_booking."billCode", '???'),
                    false, now()
                );
            END IF;
        ELSIF NEW."itemRating" = 1 THEN
            INSERT INTO public."StaffNotifications" (
                "bookingId", "employeeId", "type", "message", "isRead", "createdAt"
            ) VALUES (
                NEW."bookingId", NULL, 'COMPLAINT',
                'Khách đánh giá TỆ cho NV ' || COALESCE(v_tech_code, '?') || ' trong đơn #' || COALESCE(v_booking."billCode", '???') || '. ' || COALESCE(NEW."itemFeedback", ''),
                false, now()
            );
            IF NEW."technicianCodes" IS NOT NULL THEN
                FOREACH v_tech_code IN ARRAY NEW."technicianCodes"
                LOOP
                    v_tech_code := trim(v_tech_code);
                    IF v_tech_code != '' THEN
                        INSERT INTO public."StaffNotifications" (
                            "bookingId", "employeeId", "type", "message", "isRead", "createdAt"
                        ) VALUES (
                            NEW."bookingId", v_tech_code, 'COMPLAINT',
                            'Bạn nhận được đánh giá TỆ 😡 từ đơn hàng #' || COALESCE(v_booking."billCode", '???') || '. ' || COALESCE(NEW."itemFeedback", ''),
                            false, now()
                        );
                    END IF;
                END LOOP;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$function$
    `;

    try {
        await client.query(newTrigger);
        console.log('Successfully updated fn_notify_ktv_on_item_rating');
    } catch (e) {
        console.error('Error updating trigger:', e);
    }

    await client.end();
}

updateTrigger();
