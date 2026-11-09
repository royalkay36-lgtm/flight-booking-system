-- =====================================================================
-- DỮ LIỆU MẪU (môi trường phát triển). Lịch bay sinh theo ngày hiện tại
-- nên luôn có chuyến trong 14 ngày tới.
-- Tài khoản mẫu (mật khẩu: 123456): admin@flight.test, staff@flight.test, khach@flight.test
-- =====================================================================
SET client_encoding = 'UTF8';

-- password_hash = bcrypt('123456'), kiểm tra được bằng thư viện bcrypt/passlib của Python.
INSERT INTO users (email, password_hash, full_name, phone, role)
SELECT email, '$2b$10$j41ZKGT2HV/tFZ6vYiIGiOaG4uKRI1.RZX9ipk9DFsDU9PtTY6I2C', full_name, phone, role
FROM (VALUES ('admin@flight.test', 'Quản trị viên',     '0900000001', 'ADMIN'),
             ('staff@flight.test', 'Nhân viên mặt đất', '0900000002', 'STAFF'),
             ('khach@flight.test', 'Nguyễn Văn An',     '0900000003', 'PASSENGER')) AS v (email, full_name, phone, role);

-- Sân bay (toạ độ, mã ICAO theo OpenFlights; tên thành phố tiếng Việt cho chatbot/tìm kiếm)
INSERT INTO airports (iata_code, icao_code, name, city, country, latitude, longitude, timezone, image_url, description, is_featured) VALUES
    ('HAN', 'VVNB', 'Noi Bai International Airport',      'Hà Nội',          'Vietnam',     21.221201, 105.806999, 'Asia/Ho_Chi_Minh',
     '/images/destinations/HAN.jpg', 'Thủ đô nghìn năm văn hiến với phố cổ rêu phong và nền ẩm thực tinh tế.', false),
    ('SGN', 'VVTS', 'Tan Son Nhat International Airport', 'TP. Hồ Chí Minh', 'Vietnam',     10.818800, 106.652000, 'Asia/Ho_Chi_Minh',
     '/images/destinations/SGN.jpg', 'Trung tâm kinh tế năng động, sầm uất bậc nhất với nhịp sống hiện đại không ngủ.', false),
    ('DAD', 'VVDN', 'Da Nang International Airport',      'Đà Nẵng',         'Vietnam',     16.043900, 108.199000, 'Asia/Ho_Chi_Minh',
     '/images/destinations/DAD.jpg', 'Thành phố đáng sống với bãi biển Mỹ Khê tuyệt đẹp và Cầu Vàng Bà Nà Hills kỳ vĩ.', true),
    ('CXR', 'VVCR', 'Cam Ranh International Airport',     'Nha Trang',       'Vietnam',     11.998200, 109.219000, 'Asia/Ho_Chi_Minh',
     '/images/destinations/CXR.jpg', 'Thiên đường biển đảo nhiệt đới với bờ cát trắng mịn và nhiều khu nghỉ dưỡng cao cấp.', true),
    ('PQC', 'VVPQ', 'Phu Quoc International Airport',     'Phú Quốc',        'Vietnam',     10.169800, 103.993100, 'Asia/Ho_Chi_Minh',
     '/images/destinations/PQC.jpg', 'Đảo ngọc hoang sơ với làn nước trong vắt, hoàng hôn tuyệt đẹp và hải sản tươi ngon.', true),
    ('HPH', 'VVCI', 'Cat Bi International Airport',       'Hải Phòng',       'Vietnam',     20.819400, 106.725000, 'Asia/Ho_Chi_Minh',
     '/images/destinations/HPH.jpg', 'Thành phố Hoa Phượng Đỏ, cửa ngõ khám phá vịnh Lan Hạ và quần đảo Cát Bà xanh ngát.', false),
    ('VII', 'VVVH', 'Vinh International Airport',         'Vinh',            'Vietnam',     18.737600, 105.671000, 'Asia/Ho_Chi_Minh',
     '/images/destinations/VII.jpg', 'Vùng đất địa linh nhân kiệt, nổi tiếng với bãi biển Cửa Lò và làng Sen quê Bác.', false),
    ('HUI', 'VVPB', 'Phu Bai International Airport',      'Huế',             'Vietnam',     16.401500, 107.703000, 'Asia/Ho_Chi_Minh',
     '/images/destinations/HUI.jpg', 'Cố đô trầm mặc bên dòng sông Hương thơ mộng, lưu giữ di sản cung đình vàng son.', false),
    ('DLI', 'VVDL', 'Lien Khuong Airport',                'Đà Lạt',          'Vietnam',     11.750000, 108.367000, 'Asia/Ho_Chi_Minh',
     '/images/destinations/DLI.jpg', 'Thành phố ngàn hoa xứ sở sương mù với không khí se lạnh lãng mạn quanh năm.', true),
    ('VCA', 'VVCT', 'Can Tho International Airport',      'Cần Thơ',         'Vietnam',     10.085100, 105.712000, 'Asia/Ho_Chi_Minh',
     '/images/destinations/VCA.jpg', 'Thủ phủ miền Tây sông nước trù phú với nét văn hóa chợ nổi Cái Răng độc đáo.', false),
    ('BKK', 'VTBS', 'Suvarnabhumi Airport',               'Bangkok',         'Thailand',    13.681100, 100.747000, 'Asia/Bangkok',
     '/images/destinations/BKK.jpg', 'Thủ đô xứ chùa Vàng rực rỡ với các khu chợ đêm sôi động và ẩm thực đường phố phong phú.', true),
    ('SIN', 'WSSS', 'Singapore Changi Airport',           'Singapore',       'Singapore',    1.350190, 103.994000, 'Asia/Singapore',
     '/images/destinations/SIN.jpg', 'Quốc đảo sư tử xanh - sạch - đẹp, nơi hội tụ kiến trúc tương lai và giải trí đẳng cấp.', false),
    ('ICN', 'RKSI', 'Incheon International Airport',      'Seoul',           'South Korea', 37.469100, 126.451000, 'Asia/Seoul',
     '/images/destinations/ICN.jpg', 'Kinh đô thời trang và văn hóa K-Pop giao thoa hài hòa giữa hoàng cung xưa và nhịp sống số.', false),
    ('NRT', 'RJAA', 'Narita International Airport',       'Tokyo',           'Japan',       35.764700, 140.386000, 'Asia/Tokyo',
     '/images/destinations/NRT.jpg', 'Đại đô thị hiện đại bậc nhất thế giới với nền văn hóa đặc sắc và núi Phú Sĩ hùng vĩ.', true);
     
INSERT INTO airlines (iata_code, name) VALUES
    ('VN', 'Vietnam Airlines'),
    ('VJ', 'Vietjet Air'),
    ('QH', 'Bamboo Airways');

INSERT INTO aircraft_models (code, manufacturer, name) VALUES
    ('A320', 'Airbus', 'Airbus A320neo'),
    ('A321', 'Airbus', 'Airbus A321'),
    ('B789', 'Boeing', 'Boeing 787-9 Dreamliner');

-- Bố cục khoang -> trigger tự sinh bảng seats. Mỗi khoang phổ thông chia 4 khu giá chọn ghế:
-- hàng đầu 150k, khu trước 60k, hàng cửa thoát hiểm (rộng chân) 200k, khu sau 40k. Thương gia miễn phí.
INSERT INTO cabin_layouts (model_code, cabin_class, first_row, last_row, seat_columns, seat_fee) VALUES
    ('A320', 'ECONOMY',   1,  3, 'ABC-DEF',     150000),   -- A320: 180 ghế, toàn phổ thông
    ('A320', 'ECONOMY',   4, 11, 'ABC-DEF',      60000),
    ('A320', 'ECONOMY',  12, 13, 'ABC-DEF',     200000),
    ('A320', 'ECONOMY',  14, 30, 'ABC-DEF',      40000),
    ('A321', 'BUSINESS',  1,  4, 'AC-DF',            0),   -- A321: 16 thương gia 2-2 + 168 phổ thông 3-3
    ('A321', 'ECONOMY',   5,  7, 'ABC-DEF',     150000),
    ('A321', 'ECONOMY',   8, 15, 'ABC-DEF',      60000),
    ('A321', 'ECONOMY',  16, 17, 'ABC-DEF',     200000),
    ('A321', 'ECONOMY',  18, 32, 'ABC-DEF',      40000),
    ('B789', 'BUSINESS',  1,  7, 'A-DG-K',           0),   -- B787-9: 28 thương gia 1-2-1 + 261 phổ thông 3-3-3
    ('B789', 'ECONOMY',  10, 12, 'ABC-DEF-HJK', 150000),
    ('B789', 'ECONOMY',  13, 25, 'ABC-DEF-HJK',  60000),
    ('B789', 'ECONOMY',  26, 26, 'ABC-DEF-HJK', 200000),
    ('B789', 'ECONOMY',  27, 38, 'ABC-DEF-HJK',  40000);

INSERT INTO aircraft (registration, model_code, airline_code) VALUES
    ('VN-A601', 'A321', 'VN'),
    ('VN-A861', 'B789', 'VN'),
    ('VN-A650', 'A320', 'VJ'),
    ('VN-A590', 'A321', 'QH'),
    ('VN-A602', 'A321', 'VN'),
    ('VN-A862', 'B789', 'VN'),
    ('VN-A863', 'B789', 'VN'),
    ('VN-A652', 'A320', 'VJ'),
    ('VN-A653', 'A320', 'VJ'),
    ('VN-A591', 'A321', 'QH');

INSERT INTO fare_classes (code, name, cabin_class, checked_baggage_kg, carry_on_kg, change_fee, refund_fee, description) VALUES
    ('ECO_SAVER', 'Phổ thông Tiết kiệm', 'ECONOMY',   0,  7, 500000, NULL,
     'Không gồm hành lý ký gửi. Được đổi chuyến (phí 500.000đ + chênh lệch giá). Không hoàn vé.'),
    ('ECO_FLEX',  'Phổ thông Linh hoạt', 'ECONOMY',  23, 10,      0, 300000,
     '23kg ký gửi. Đổi chuyến miễn phí (trả chênh lệch giá). Hoàn vé phí 300.000đ.'),
    ('BUS_FLEX',  'Thương gia',          'BUSINESS', 32, 18,      0,      0,
     '32kg ký gửi, phòng chờ hạng thương gia. Đổi và hoàn vé miễn phí.');

INSERT INTO ancillary_products (code, category, name, description, price, per_segment, international_only) VALUES
    ('BAG20',     'BAGGAGE',   'Hành lý ký gửi 20kg', 'Mua trước rẻ hơn mua tại sân bay', 180000, true, false),
    ('BAG30',     'BAGGAGE',   'Hành lý ký gửi 30kg', 'Mua trước rẻ hơn mua tại sân bay', 260000, true, false),
    ('BAG40',     'BAGGAGE',   'Hành lý ký gửi 40kg', 'Mua trước rẻ hơn mua tại sân bay', 340000, true, false),
    ('MEAL_CHK',  'MEAL',      'Cơm gà Hải Nam',      'Kèm nước suối',                     80000, true, false),
    ('MEAL_PHO',  'MEAL',      'Phở bò',              'Kèm nước suối',                     80000, true, false),
    ('MEAL_VEG',  'MEAL',      'Suất ăn chay',        'Cơm rau củ, đậu hũ',                70000, true, false),
    ('INS_TRIP',  'INSURANCE', 'Bảo hiểm du lịch',    'Bồi thường trễ / huỷ chuyến, thất lạc hành lý, tai nạn', 70000, false, false),
    ('SIM_KR',    'SIM',       'SIM 4G Hàn Quốc 5 ngày',   'Data không giới hạn, nhận tại quầy sân bay đến', 250000, false, true),
    ('SIM_ASIA',  'SIM',       'SIM 4G châu Á 8 ngày',     'Dùng tại 10 nước châu Á, 6GB tốc độ cao',        320000, false, true);

INSERT INTO vouchers (code, description, discount_type, discount_value, max_discount, min_amount, valid_to, usage_limit) VALUES
    ('CHAOBAN',   'Giảm 10% cho đơn từ 500.000đ, tối đa 200.000đ', 'PERCENT', 10, 200000,  500000, now() + interval '90 days', 1000),
    ('BAYVUI100', 'Giảm 100.000đ cho đơn từ 1.500.000đ',            'AMOUNT', 100000, NULL, 1500000, now() + interval '90 days',  500);

-- ---------------------------------------------------------------------
-- Lịch bay mẫu: 20 chuyến/ngày x 14 ngày (trigger tự sinh flight_seats).
-- Mỗi điểm đến nổi bật ở trang chủ đều có chuyến khứ hồi từ HAN hoặc SGN.
-- ---------------------------------------------------------------------
CREATE TEMP TABLE seed_routes (flight_number, airline_code, aircraft_reg, origin, destination, dep_local, duration, base_price) AS
VALUES ('VN213',  'VN', 'VN-A601', 'HAN', 'SGN', time '06:00', interval '2 hours 10 minutes', 1500000),
       ('VN214',  'VN', 'VN-A601', 'SGN', 'HAN', time '09:30', interval '2 hours 10 minutes', 1500000),
       ('VJ123',  'VJ', 'VN-A650', 'HAN', 'SGN', time '14:00', interval '2 hours 5 minutes',   990000),
       ('VJ515',  'VJ', 'VN-A650', 'HAN', 'DAD', time '07:15', interval '1 hour 20 minutes',   690000),
       ('VJ516',  'VJ', 'VN-A650', 'DAD', 'HAN', time '10:00', interval '1 hour 20 minutes',   690000),
       ('QH1021', 'QH', 'VN-A590', 'SGN', 'PQC', time '13:00', interval '1 hour',              850000),
       ('VN416',  'VN', 'VN-A861', 'HAN', 'ICN', time '23:40', interval '4 hours 30 minutes', 5200000),
       ('VN417',  'VN', 'VN-A861', 'ICN', 'HAN', time '10:30', interval '5 hours',            5200000),
       ('VN615',  'VN', 'VN-A602', 'HAN', 'BKK', time '12:10', interval '1 hour 55 minutes', 2100000),
       ('VN616',  'VN', 'VN-A602', 'BKK', 'HAN', time '15:30', interval '1 hour 50 minutes', 2100000),
       ('VJ801',  'VJ', 'VN-A652', 'SGN', 'BKK', time '08:45', interval '1 hour 35 minutes', 1590000),
       ('VJ802',  'VJ', 'VN-A652', 'BKK', 'SGN', time '11:30', interval '1 hour 40 minutes', 1590000),
       ('VN310',  'VN', 'VN-A862', 'HAN', 'NRT', time '00:05', interval '5 hours 10 minutes', 7500000),
       ('VN311',  'VN', 'VN-A862', 'NRT', 'HAN', time '09:30', interval '6 hours 30 minutes', 7500000),
       ('VN300',  'VN', 'VN-A863', 'SGN', 'NRT', time '23:55', interval '5 hours 50 minutes', 7900000),
       ('VN301',  'VN', 'VN-A863', 'NRT', 'SGN', time '09:00', interval '6 hours 45 minutes', 7900000),
       ('VJ401',  'VJ', 'VN-A653', 'HAN', 'DLI', time '09:00', interval '1 hour 50 minutes',  890000),
       ('VJ402',  'VJ', 'VN-A653', 'DLI', 'HAN', time '11:40', interval '1 hour 50 minutes',  890000),
       ('QH1041', 'QH', 'VN-A591', 'HAN', 'CXR', time '08:15', interval '1 hour 55 minutes', 1050000),
       ('QH1042', 'QH', 'VN-A591', 'CXR', 'HAN', time '11:00', interval '1 hour 55 minutes', 1050000);

INSERT INTO flights (flight_number, airline_code, aircraft_reg, origin, destination, departure_time, arrival_time)
SELECT r.flight_number, r.airline_code, r.aircraft_reg, r.origin, r.destination,
       ((current_date + d) + r.dep_local) AT TIME ZONE 'Asia/Ho_Chi_Minh',
       ((current_date + d) + r.dep_local) AT TIME ZONE 'Asia/Ho_Chi_Minh' + r.duration
FROM seed_routes r CROSS JOIN generate_series(0, 13) AS d;

-- Giá vé: chỉ mở hạng vé mà máy bay có khoang tương ứng; dao động nhẹ theo ngày.
INSERT INTO flight_fares (flight_id, fare_class, price)
SELECT f.id, fc.code,
       r.base_price * CASE fc.code WHEN 'ECO_SAVER' THEN 1 WHEN 'ECO_FLEX' THEN 1.4 ELSE 3 END
       + (extract(day FROM f.departure_time)::int % 3) * 100000
FROM flights f
JOIN seed_routes r   ON r.flight_number = f.flight_number
JOIN aircraft a      ON a.registration = f.aircraft_reg
JOIN fare_classes fc ON EXISTS (SELECT 1 FROM cabin_layouts l
                                 WHERE l.model_code = a.model_code AND l.cabin_class = fc.cabin_class);

DROP TABLE seed_routes;

-- Trạng thái realtime mẫu (trigger ghi flight_status_history)
UPDATE flights SET status = 'DELAYED', estimated_departure = departure_time + interval '45 minutes'
 WHERE flight_number = 'VN213' AND (departure_time AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = current_date + 1;
UPDATE flights SET status = 'CANCELLED'
 WHERE flight_number = 'VJ516' AND (departure_time AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = current_date + 2;

-- ---------------------------------------------------------------------
-- Một booking mẫu đi qua đúng luồng nghiệp vụ: giữ ghế -> tạo booking -> thanh toán -> xác nhận
-- ---------------------------------------------------------------------
DO $$
DECLARE
    v_user    bigint := (SELECT id FROM users WHERE email = 'khach@flight.test');
    v_flight  bigint := (SELECT id FROM flights WHERE flight_number = 'VN214'
                          AND (departure_time AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = current_date + 3);
    v_price   numeric := (SELECT price FROM flight_fares WHERE flight_id = v_flight AND fare_class = 'ECO_FLEX');
    v_seat1   bigint := (SELECT flight_seat_id FROM v_seat_map WHERE flight_id = v_flight AND seat_code = '12A');
    v_seat2   bigint := (SELECT flight_seat_id FROM v_seat_map WHERE flight_id = v_flight AND seat_code = '12B');
    v_fee     numeric := (SELECT seat_fee FROM v_seat_map WHERE flight_seat_id = v_seat1);  -- 12A, 12B cùng khu
    v_booking bigint;
    v_p1      bigint;
    v_p2      bigint;
BEGIN
    ASSERT hold_seat(v_seat1, v_user) AND hold_seat(v_seat2, v_user), 'Không giữ được ghế mẫu';

    INSERT INTO bookings (user_id, contact_email, contact_phone, total_amount, expires_at)
    VALUES (v_user, 'khach@flight.test', '0900000003', (v_price + v_fee) * 2, now() + interval '10 minutes')
    RETURNING id INTO v_booking;

    INSERT INTO passengers (booking_id, full_name, gender, date_of_birth, id_number, nationality)
    VALUES (v_booking, 'NGUYEN VAN AN', 'M', '1995-03-12', '001095001234', 'VN') RETURNING id INTO v_p1;
    INSERT INTO passengers (booking_id, full_name, gender, date_of_birth, id_number, nationality)
    VALUES (v_booking, 'TRAN THI BINH', 'F', '1997-08-25', '001197005678', 'VN') RETURNING id INTO v_p2;

    INSERT INTO tickets (passenger_id, flight_id, fare_class, flight_seat_id, price, seat_fee) VALUES
        (v_p1, v_flight, 'ECO_FLEX', v_seat1, v_price, v_fee),
        (v_p2, v_flight, 'ECO_FLEX', v_seat2, v_price, v_fee);

    INSERT INTO payments (booking_id, amount, method, status, provider_txn_id, paid_at)
    VALUES (v_booking, (v_price + v_fee) * 2, 'VNPAY', 'SUCCESS', 'VNP-SEED-0001', now());

    PERFORM confirm_booking(v_booking);
END $$;
