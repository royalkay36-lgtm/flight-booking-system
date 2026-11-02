-- =====================================================================
-- TRIGGER, HÀM NGHIỆP VỤ (GIỮ GHẾ CHỐNG XUNG ĐỘT) VÀ VIEW BÁO CÁO
-- =====================================================================
SET client_encoding = 'UTF8';

-- ---------------------------------------------------------------------
-- TRIGGER: sinh ghế từ bố cục khoang
-- shortcut: chỉ sinh khi INSERT; sửa bố cục thì xoá dòng layout + ghế rồi tạo lại.
-- ---------------------------------------------------------------------
CREATE FUNCTION trg_cabin_layout_seats() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO seats (model_code, seat_row, seat_letter, grid_col, cabin_class, seat_type, seat_fee)
    SELECT NEW.model_code, r, substr(NEW.seat_columns, i, 1), i, NEW.cabin_class,
           CASE WHEN i = 1 OR i = length(NEW.seat_columns)              THEN 'WINDOW'
                WHEN substr(NEW.seat_columns, i - 1, 1) = '-'
                  OR substr(NEW.seat_columns, i + 1, 1) = '-'            THEN 'AISLE'
                ELSE 'MIDDLE' END,
           NEW.seat_fee
    FROM generate_series(NEW.first_row, NEW.last_row) AS r,
         generate_series(1, length(NEW.seat_columns)) AS i
    WHERE substr(NEW.seat_columns, i, 1) <> '-';
    RETURN NULL;
END $$;

CREATE TRIGGER cabin_layout_seats AFTER INSERT ON cabin_layouts
    FOR EACH ROW EXECUTE FUNCTION trg_cabin_layout_seats();

-- ---------------------------------------------------------------------
-- TRIGGER: tạo tồn kho ghế cho chuyến bay mới theo chủng loại máy bay
-- shortcut: đổi tàu bay (aircraft_reg) sau khi đã tạo chuyến không sinh lại ghế.
-- ---------------------------------------------------------------------
CREATE FUNCTION trg_flight_create_seats() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO flight_seats (flight_id, seat_id)
    SELECT NEW.id, s.id
    FROM aircraft a JOIN seats s ON s.model_code = a.model_code
    WHERE a.registration = NEW.aircraft_reg;
    RETURN NULL;
END $$;

CREATE TRIGGER flight_create_seats AFTER INSERT ON flights
    FOR EACH ROW EXECUTE FUNCTION trg_flight_create_seats();

-- ---------------------------------------------------------------------
-- TRIGGER: lưu lịch sử trạng thái chuyến bay + phát NOTIFY realtime.
-- Backend chạy `SET LOCAL app.user_id = '<id>'` trước khi UPDATE để ghi người đổi;
-- server realtime (WebSocket/SSE) chạy `LISTEN flight_status` để đẩy cho client.
-- ---------------------------------------------------------------------
CREATE FUNCTION trg_flight_status_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO flight_status_history (flight_id, old_status, new_status, changed_by)
    VALUES (NEW.id, OLD.status, NEW.status, NULLIF(current_setting('app.user_id', true), '')::bigint);

    PERFORM pg_notify('flight_status', json_build_object(
        'flight_id', NEW.id, 'flight_number', NEW.flight_number,
        'status', NEW.status, 'estimated_departure', NEW.estimated_departure)::text);
    RETURN NULL;
END $$;

CREATE TRIGGER flight_status_change AFTER UPDATE OF status ON flights
    FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION trg_flight_status_change();

-- =====================================================================
-- KIỂM SOÁT TRANH CHẤP GHẾ
--
-- Vòng đời ghế:  AVAILABLE --hold_seat--> HELD --confirm_booking--> BOOKED
--                    ^                      |
--                    +--release_seat / release_expired_holds
--
-- Nguyên tắc: mọi chuyển trạng thái là MỘT câu UPDATE có điều kiện.
-- Khi 2 giao dịch cùng UPDATE một dòng, PostgreSQL khoá dòng: giao dịch
-- sau phải chờ, rồi đánh giá lại WHERE trên phiên bản mới nhất (READ
-- COMMITTED) -> điều kiện không còn đúng -> 0 dòng -> thất bại.
-- Không cần SELECT ... FOR UPDATE riêng, không có khoảng hở check-then-act.
--
-- Ghế coi là "trống với user U" khi: AVAILABLE, hoặc HELD bởi chính U,
-- hoặc HELD nhưng đã hết hạn (không phụ thuộc job dọn dẹp đã chạy hay chưa).
-- =====================================================================

-- Giữ ghế tạm thời. Trả về true nếu giữ được.
CREATE FUNCTION hold_seat(p_flight_seat_id bigint, p_user_id bigint, p_minutes int DEFAULT 10)
RETURNS boolean LANGUAGE sql AS $$
    WITH upd AS (
        UPDATE flight_seats
           SET status = 'HELD', held_by = p_user_id,
               hold_expires_at = now() + make_interval(mins => p_minutes)
         WHERE id = p_flight_seat_id
           AND (status = 'AVAILABLE'
                OR (status = 'HELD' AND (held_by = p_user_id OR hold_expires_at < now())))
        RETURNING 1)
    SELECT EXISTS (SELECT 1 FROM upd);
$$;

-- Bỏ chọn ghế (chỉ người đang giữ mới bỏ được).
CREATE FUNCTION release_seat(p_flight_seat_id bigint, p_user_id bigint)
RETURNS boolean LANGUAGE sql AS $$
    WITH upd AS (
        UPDATE flight_seats
           SET status = 'AVAILABLE', held_by = NULL, hold_expires_at = NULL
         WHERE id = p_flight_seat_id AND status = 'HELD' AND held_by = p_user_id
        RETURNING 1)
    SELECT EXISTS (SELECT 1 FROM upd);
$$;

-- Xác nhận đặt chỗ sau khi thanh toán thành công (gọi trong cùng transaction
-- với việc ghi payments). Lỗi => toàn bộ transaction rollback, không ghế nào bị đặt dở.
CREATE FUNCTION confirm_booking(p_booking_id bigint) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    v_user   bigint;
    v_needed int;
    v_got    int;
BEGIN
    SELECT user_id INTO v_user FROM bookings
     WHERE id = p_booking_id AND status = 'PENDING'
       FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking % không tồn tại hoặc không còn ở trạng thái PENDING', p_booking_id;
    END IF;

    IF EXISTS (SELECT 1
                 FROM tickets t
                 JOIN passengers p    ON p.id = t.passenger_id
                 JOIN flight_seats fs ON fs.id = t.flight_seat_id
                 JOIN seats s         ON s.id = fs.seat_id
                 JOIN fare_classes fc ON fc.code = t.fare_class
                WHERE p.booking_id = p_booking_id AND s.cabin_class <> fc.cabin_class) THEN
        RAISE EXCEPTION 'Có ghế không thuộc khoang của hạng vé đã mua';
    END IF;

    SELECT count(*) INTO v_needed
      FROM tickets t JOIN passengers p ON p.id = t.passenger_id
     WHERE p.booking_id = p_booking_id AND t.status = 'PENDING' AND t.flight_seat_id IS NOT NULL;

    -- Khoá ghế theo thứ tự id để 2 booking chéo ghế nhau không deadlock.
    PERFORM 1 FROM flight_seats
     WHERE id IN (SELECT t.flight_seat_id FROM tickets t JOIN passengers p ON p.id = t.passenger_id
                   WHERE p.booking_id = p_booking_id AND t.status = 'PENDING')
     ORDER BY id FOR UPDATE;

    UPDATE flight_seats fs
       SET status = 'BOOKED', held_by = NULL, hold_expires_at = NULL
      FROM tickets t JOIN passengers p ON p.id = t.passenger_id
     WHERE p.booking_id = p_booking_id AND t.status = 'PENDING' AND fs.id = t.flight_seat_id
       AND (fs.status = 'AVAILABLE'
            OR (fs.status = 'HELD' AND (fs.held_by = v_user OR fs.hold_expires_at < now())));
    GET DIAGNOSTICS v_got = ROW_COUNT;

    IF v_got <> v_needed THEN
        RAISE EXCEPTION 'Ghế đã bị người khác giữ/đặt (% / % ghế hợp lệ)', v_got, v_needed;
    END IF;

    UPDATE tickets SET status = 'ISSUED'
     WHERE status = 'PENDING'
       AND passenger_id IN (SELECT id FROM passengers WHERE booking_id = p_booking_id);
    UPDATE bookings SET status = 'CONFIRMED', expires_at = NULL WHERE id = p_booking_id;
END $$;

-- Xếp ghế tự động khi check-in cho vé chưa chọn ghế: ghế trống rẻ nhất đúng khoang.
-- SKIP LOCKED: nhiều khách check-in cùng lúc không chờ nhau và không bao giờ nhận trùng ghế.
CREATE FUNCTION assign_seat(p_ticket_id bigint) RETURNS text LANGUAGE plpgsql AS $$
DECLARE
    v_seat bigint;
    v_code text;
BEGIN
    SELECT fs.id, s.seat_code INTO v_seat, v_code
      FROM tickets t
      JOIN fare_classes fc ON fc.code = t.fare_class
      JOIN flight_seats fs ON fs.flight_id = t.flight_id
      JOIN seats s         ON s.id = fs.seat_id AND s.cabin_class = fc.cabin_class
     WHERE t.id = p_ticket_id AND t.flight_seat_id IS NULL
       AND (fs.status = 'AVAILABLE' OR (fs.status = 'HELD' AND fs.hold_expires_at < now()))
     ORDER BY s.seat_fee, random()
     LIMIT 1
       FOR UPDATE OF fs SKIP LOCKED;
    IF v_seat IS NULL THEN
        RAISE EXCEPTION 'Chuyến bay không còn ghế trống để xếp';
    END IF;
    UPDATE flight_seats SET status = 'BOOKED', held_by = NULL, hold_expires_at = NULL WHERE id = v_seat;
    UPDATE tickets SET flight_seat_id = v_seat WHERE id = p_ticket_id;
    RETURN v_code;
END $$;

-- Dọn dẹp định kỳ (cron/APScheduler/Celery beat ~1 phút/lần):
-- huỷ booking quá hạn thanh toán và trả các ghế giữ quá hạn về AVAILABLE.
CREATE FUNCTION release_expired_holds() RETURNS int LANGUAGE plpgsql AS $$
DECLARE
    v_count int;
BEGIN
    WITH expired AS (
        UPDATE bookings SET status = 'EXPIRED'
         WHERE status = 'PENDING' AND expires_at < now()
        RETURNING id, voucher_code),
    voucher_back AS (                         -- trả lại lượt dùng mã của booking không thanh toán
        UPDATE vouchers v SET used_count = v.used_count - x.n
          FROM (SELECT voucher_code, count(*) AS n FROM expired
                 WHERE voucher_code IS NOT NULL GROUP BY voucher_code) x
         WHERE v.code = x.voucher_code)
    UPDATE tickets SET status = 'CANCELLED'
     WHERE status = 'PENDING'
       AND passenger_id IN (SELECT p.id FROM passengers p JOIN expired e ON e.id = p.booking_id);

    UPDATE flight_seats SET status = 'AVAILABLE', held_by = NULL, hold_expires_at = NULL
     WHERE status = 'HELD' AND hold_expires_at < now();
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END $$;

-- =====================================================================
-- VIEW
-- =====================================================================

-- Tìm kiếm & lọc chuyến bay: mỗi dòng = 1 chuyến x 1 hạng vé.
-- Ví dụ: WHERE origin='HAN' AND destination='DAD' AND departure_time::date = '2026-11-09'
--          AND cabin_class='ECONOMY' AND price <= 1000000 AND seats_available >= 2
CREATE VIEW v_flight_search AS
SELECT f.id AS flight_id, f.flight_number, f.airline_code, al.name AS airline_name,
       f.origin, o.city AS origin_city, f.destination, d.city AS destination_city,
       f.departure_time, f.arrival_time, f.estimated_departure, f.status,
       ff.fare_class, fc.name AS fare_name, fc.cabin_class, ff.price,
       fc.checked_baggage_kg, fc.carry_on_kg,
       (SELECT count(*)
          FROM flight_seats fs JOIN seats s ON s.id = fs.seat_id
         WHERE fs.flight_id = f.id AND s.cabin_class = fc.cabin_class
           AND (fs.status = 'AVAILABLE' OR (fs.status = 'HELD' AND fs.hold_expires_at < now()))
       ) AS seats_available
FROM flights f
JOIN airlines al     ON al.iata_code = f.airline_code
JOIN airports o      ON o.iata_code = f.origin
JOIN airports d      ON d.iata_code = f.destination
JOIN flight_fares ff ON ff.flight_id = f.id
JOIN fare_classes fc ON fc.code = ff.fare_class;

-- Sơ đồ ghế dạng lưới cho 1 chuyến: vẽ theo (seat_row, grid_col).
-- Ghế HELD đã hết hạn hiển thị là AVAILABLE.
CREATE VIEW v_seat_map AS
SELECT fs.id AS flight_seat_id, fs.flight_id, s.seat_code, s.seat_row, s.seat_letter,
       s.grid_col, s.cabin_class, s.seat_type, s.seat_fee,
       CASE WHEN fs.status = 'HELD' AND fs.hold_expires_at < now() THEN 'AVAILABLE'
            ELSE fs.status END AS status,
       fs.held_by, fs.hold_expires_at
FROM flight_seats fs JOIN seats s ON s.id = fs.seat_id;

-- Tỷ lệ lấp đầy ghế (Load Factor) theo chuyến.
CREATE VIEW v_flight_load_factor AS
SELECT f.id AS flight_id, f.flight_number, f.origin, f.destination, f.departure_time, f.status,
       count(*) FILTER (WHERE fs.status <> 'BLOCKED') AS capacity,
       count(*) FILTER (WHERE fs.status = 'BOOKED')   AS booked,
       round(100.0 * count(*) FILTER (WHERE fs.status = 'BOOKED')
             / NULLIF(count(*) FILTER (WHERE fs.status <> 'BLOCKED'), 0), 2) AS load_factor_pct
FROM flights f JOIN flight_seats fs ON fs.flight_id = f.id
GROUP BY f.id;

-- Doanh thu vé (giá vé + phí chọn ghế) theo ngày bay (giờ Việt Nam) và hãng.
CREATE VIEW v_revenue_daily AS
SELECT (f.departure_time AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS flight_date,
       f.airline_code,
       count(*)                  AS tickets_sold,
       sum(t.price + t.seat_fee) AS revenue
FROM tickets t JOIN flights f ON f.id = t.flight_id
WHERE t.status IN ('ISSUED', 'CHECKED_IN', 'BOARDED')
GROUP BY 1, 2;
