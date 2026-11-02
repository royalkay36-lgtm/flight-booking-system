-- =====================================================================
-- HỆ THỐNG QUẢN LÝ VÀ ĐẶT VÉ MÁY BAY - SCHEMA (PostgreSQL 14+)
-- Trạng thái dùng text + CHECK (thay vì ENUM) để Django/SQLAlchemy map dễ.
-- Tiền tệ: VND.
-- =====================================================================
SET client_encoding = 'UTF8';  -- psql trên Windows mặc định WIN125x, làm hỏng chữ tiếng Việt

-- ---------------------------------------------------------------------
-- 1. NGƯỜI DÙNG & PHÂN QUYỀN
-- ---------------------------------------------------------------------
CREATE TABLE users (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email         text        NOT NULL,
    password_hash text        NOT NULL,
    full_name     text        NOT NULL,
    phone         text,
    role          text        NOT NULL DEFAULT 'PASSENGER'
                  CHECK (role IN ('PASSENGER', 'STAFF', 'ADMIN')),
    is_active     boolean     NOT NULL DEFAULT true,
    created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_users_email ON users (lower(email));

-- ---------------------------------------------------------------------
-- 2. DANH MỤC: SÂN BAY, HÃNG BAY, MÁY BAY, SƠ ĐỒ GHẾ
-- ---------------------------------------------------------------------
CREATE TABLE airports (                       -- nguồn: OpenFlights airports.dat
    iata_code char(3) PRIMARY KEY CHECK (iata_code ~ '^[A-Z]{3}$'),
    icao_code text,
    name      text NOT NULL,
    city      text,
    country   text NOT NULL,
    latitude  numeric(9,6),
    longitude numeric(9,6),
    timezone  text                            -- IANA, ví dụ 'Asia/Ho_Chi_Minh'
);

CREATE TABLE airlines (
    iata_code char(2) PRIMARY KEY CHECK (iata_code ~ '^[A-Z0-9]{2}$'),
    name      text NOT NULL,
    logo_url  text
);

CREATE TABLE aircraft_models (                -- chủng loại: A320, A321, B787-9...
    code         text PRIMARY KEY,
    manufacturer text NOT NULL,
    name         text NOT NULL
);

-- Bố cục khoang: mỗi dòng là một dải hàng ghế có cùng cách xếp cột.
-- seat_columns dùng '-' cho lối đi: 'ABC-DEF' (3-3), 'A-DG-K' (1-2-1).
-- Thêm một dòng => trigger tự sinh ghế vào bảng seats.
CREATE TABLE cabin_layouts (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    model_code   text NOT NULL REFERENCES aircraft_models (code) ON DELETE CASCADE,
    cabin_class  text NOT NULL CHECK (cabin_class IN ('ECONOMY', 'BUSINESS')),
    first_row    int  NOT NULL CHECK (first_row > 0),
    last_row     int  NOT NULL,
    seat_columns text NOT NULL CHECK (seat_columns ~ '^[A-Z]+(-[A-Z]+)*$'),
    CHECK (last_row >= first_row)
);

-- Ghế vật lý theo chủng loại máy bay (sơ đồ ghế dạng lưới).
CREATE TABLE seats (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    model_code  text     NOT NULL REFERENCES aircraft_models (code) ON DELETE CASCADE,
    seat_row    int      NOT NULL,
    seat_letter char(1)  NOT NULL,
    seat_code   text     GENERATED ALWAYS AS (seat_row::text || seat_letter) STORED,  -- '12A'
    grid_col    smallint NOT NULL,            -- vị trí cột trên lưới (tính cả lối đi) để vẽ sơ đồ
    cabin_class text     NOT NULL CHECK (cabin_class IN ('ECONOMY', 'BUSINESS')),
    seat_type   text     NOT NULL CHECK (seat_type IN ('WINDOW', 'MIDDLE', 'AISLE')),
    UNIQUE (model_code, seat_row, seat_letter)
);

CREATE TABLE aircraft (                       -- đội bay
    registration text    PRIMARY KEY,         -- số đăng ký, ví dụ 'VN-A601'
    model_code   text    NOT NULL REFERENCES aircraft_models (code),
    airline_code char(2) NOT NULL REFERENCES airlines (iata_code),
    is_active    boolean NOT NULL DEFAULT true,
    UNIQUE (registration, airline_code)       -- cho FK kép từ flights
);

-- ---------------------------------------------------------------------
-- 3. CHUYẾN BAY, HẠNG VÉ, GIÁ VÉ
-- ---------------------------------------------------------------------
CREATE TABLE flights (
    id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    flight_number       text        NOT NULL,           -- 'VN213'
    airline_code        char(2)     NOT NULL REFERENCES airlines (iata_code),
    aircraft_reg        text        NOT NULL,
    origin              char(3)     NOT NULL REFERENCES airports (iata_code),
    destination         char(3)     NOT NULL REFERENCES airports (iata_code),
    departure_time      timestamptz NOT NULL,           -- giờ khởi hành theo lịch
    arrival_time        timestamptz NOT NULL,
    estimated_departure timestamptz,                    -- giờ dự kiến mới khi bị hoãn
    status              text        NOT NULL DEFAULT 'SCHEDULED'
                        CHECK (status IN ('SCHEDULED', 'ON_TIME', 'DELAYED', 'BOARDING',
                                          'DEPARTED', 'ARRIVED', 'CANCELLED')),
    created_at          timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (aircraft_reg, airline_code) REFERENCES aircraft (registration, airline_code),
    CHECK (origin <> destination),
    CHECK (arrival_time > departure_time)
);
CREATE UNIQUE INDEX uq_flights_number_day ON flights (flight_number, ((departure_time AT TIME ZONE 'UTC')::date));
CREATE INDEX ix_flights_search ON flights (origin, destination, departure_time);

CREATE TABLE flight_status_history (          -- ghi bởi trigger khi flights.status đổi
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    flight_id  bigint      NOT NULL REFERENCES flights (id) ON DELETE CASCADE,
    old_status text,
    new_status text        NOT NULL,
    changed_by bigint      REFERENCES users (id),       -- lấy từ SET LOCAL app.user_id
    changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_status_history_flight ON flight_status_history (flight_id);

-- Hạng vé + chính sách hành lý/đổi/hoàn (chatbot có thể đọc bảng này để trả lời).
CREATE TABLE fare_classes (
    code               text PRIMARY KEY,              -- 'ECO_SAVER'
    name               text NOT NULL,
    cabin_class        text NOT NULL CHECK (cabin_class IN ('ECONOMY', 'BUSINESS')),
    checked_baggage_kg int  NOT NULL DEFAULT 0 CHECK (checked_baggage_kg >= 0),
    carry_on_kg        int  NOT NULL DEFAULT 7 CHECK (carry_on_kg >= 0),
    change_fee         numeric(12,2) CHECK (change_fee >= 0),   -- NULL = không được đổi
    refund_fee         numeric(12,2) CHECK (refund_fee >= 0),   -- NULL = không được hoàn
    description        text
);

CREATE TABLE flight_fares (                   -- giá vé cơ bản theo chuyến & hạng vé
    flight_id  bigint        NOT NULL REFERENCES flights (id) ON DELETE CASCADE,
    fare_class text          NOT NULL REFERENCES fare_classes (code),
    price      numeric(12,2) NOT NULL CHECK (price >= 0),
    PRIMARY KEY (flight_id, fare_class)
);

-- Tồn kho ghế của từng chuyến (trigger sinh từ seats khi tạo chuyến).
-- Đây là bảng trung tâm của bài toán tranh chấp ghế.
CREATE TABLE flight_seats (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    flight_id       bigint NOT NULL REFERENCES flights (id) ON DELETE CASCADE,
    seat_id         bigint NOT NULL REFERENCES seats (id),
    status          text   NOT NULL DEFAULT 'AVAILABLE'
                    CHECK (status IN ('AVAILABLE', 'HELD', 'BOOKED', 'BLOCKED')),
    held_by         bigint REFERENCES users (id),
    hold_expires_at timestamptz,
    UNIQUE (flight_id, seat_id),
    UNIQUE (id, flight_id),                   -- cho FK kép từ tickets
    CHECK ((status = 'HELD') = (held_by IS NOT NULL AND hold_expires_at IS NOT NULL))
);
CREATE INDEX ix_flight_seats_hold ON flight_seats (hold_expires_at) WHERE status = 'HELD';

-- ---------------------------------------------------------------------
-- 4. ĐẶT CHỖ, HÀNH KHÁCH, VÉ, THANH TOÁN
-- ---------------------------------------------------------------------
-- shortcut: PNR ngẫu nhiên, trùng (xác suất ~1/10^9) sẽ lỗi unique -> app thử lại.
CREATE FUNCTION gen_pnr() RETURNS char(6) LANGUAGE sql VOLATILE AS $$
    SELECT string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
    FROM generate_series(1, 6);
$$;

CREATE TABLE bookings (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    pnr           char(6)       NOT NULL UNIQUE DEFAULT gen_pnr(),   -- mã đặt chỗ
    user_id       bigint        NOT NULL REFERENCES users (id),
    contact_email text          NOT NULL,
    contact_phone text          NOT NULL,
    status        text          NOT NULL DEFAULT 'PENDING'
                  CHECK (status IN ('PENDING', 'CONFIRMED', 'CANCELLED', 'EXPIRED')),
    total_amount  numeric(12,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    expires_at    timestamptz,                -- hạn thanh toán khi PENDING
    created_at    timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX ix_bookings_user ON bookings (user_id);
CREATE INDEX ix_bookings_pending ON bookings (expires_at) WHERE status = 'PENDING';

CREATE TABLE passengers (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    booking_id     bigint NOT NULL REFERENCES bookings (id) ON DELETE CASCADE,
    full_name      text   NOT NULL,
    gender         text   CHECK (gender IN ('M', 'F', 'X')),
    date_of_birth  date   NOT NULL,
    passenger_type text   NOT NULL DEFAULT 'ADULT' CHECK (passenger_type IN ('ADULT', 'CHILD', 'INFANT')),
    id_number      text,                      -- CCCD / hộ chiếu
    nationality    char(2)
);
CREATE INDEX ix_passengers_booking ON passengers (booking_id);

-- Mỗi vé = 1 hành khách x 1 chặng (khứ hồi = 2 vé/khách).
CREATE SEQUENCE ticket_number_seq;
CREATE TABLE tickets (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ticket_number  text          NOT NULL UNIQUE DEFAULT lpad(nextval('ticket_number_seq')::text, 13, '0'),
    passenger_id   bigint        NOT NULL REFERENCES passengers (id) ON DELETE CASCADE,
    flight_id      bigint        NOT NULL,
    fare_class     text          NOT NULL,
    flight_seat_id bigint,                    -- NULL: em bé / chưa chọn ghế
    price          numeric(12,2) NOT NULL CHECK (price >= 0),
    status         text          NOT NULL DEFAULT 'PENDING'
                   CHECK (status IN ('PENDING', 'ISSUED', 'CHECKED_IN', 'BOARDED', 'CANCELLED')),
    checked_in_at  timestamptz,
    boarded_at     timestamptz,
    FOREIGN KEY (flight_id, fare_class)     REFERENCES flight_fares (flight_id, fare_class),
    FOREIGN KEY (flight_seat_id, flight_id) REFERENCES flight_seats (id, flight_id)  -- ghế phải thuộc đúng chuyến
);
CREATE INDEX ix_tickets_passenger ON tickets (passenger_id);
CREATE INDEX ix_tickets_flight ON tickets (flight_id);
-- Lưới an toàn cuối cùng: một ghế không bao giờ có 2 vé đã xuất, kể cả khi code ứng dụng sai.
CREATE UNIQUE INDEX uq_tickets_seat_issued ON tickets (flight_seat_id)
    WHERE status IN ('ISSUED', 'CHECKED_IN', 'BOARDED');
CREATE UNIQUE INDEX uq_tickets_passenger_flight ON tickets (passenger_id, flight_id)
    WHERE status <> 'CANCELLED';

CREATE TABLE payments (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    booking_id      bigint        NOT NULL REFERENCES bookings (id),
    amount          numeric(12,2) NOT NULL CHECK (amount > 0),
    method          text          NOT NULL CHECK (method IN ('VNPAY', 'MOMO', 'ZALOPAY', 'CARD')),
    status          text          NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED', 'REFUNDED')),
    provider_txn_id text UNIQUE,              -- mã giao dịch của cổng thanh toán, chống xử lý IPN 2 lần
    created_at      timestamptz   NOT NULL DEFAULT now(),
    paid_at         timestamptz
);
CREATE INDEX ix_payments_booking ON payments (booking_id);
