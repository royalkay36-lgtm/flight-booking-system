# SkyBooking — Hệ thống quản lý và đặt vé máy bay

Đề tài **Xây dựng hệ thống website quản lý và đặt vé máy bay**: tìm kiếm chuyến bay, sơ đồ ghế theo
chủng loại máy bay, giữ ghế chống xung đột khi nhiều người đặt cùng lúc, đặt chỗ (PNR), vé điện tử,
thanh toán, check-in, trạng thái chuyến bay realtime, báo cáo doanh thu / tỷ lệ lấp đầy ghế.

**Công nghệ:** PostgreSQL 14+ · Python FastAPI + psycopg 3 (SQL thuần, logic giữ ghế nằm trong hàm
PostgreSQL) · React 19 + Vite + Tailwind CSS.

## Cấu trúc

```
database/                 Chạy theo thứ tự 01 → 03
  01_schema.sql           Bảng, ràng buộc toàn vẹn, khoá ngoại, index
  02_functions.sql        Trigger, hàm giữ ghế (hold_seat / confirm_booking ...), view báo cáo
  03_seed.sql             Dữ liệu mẫu: 14 sân bay, 3 hãng, 3 chủng loại máy bay, lịch bay 14 ngày tới
backend/                  API FastAPI
  app/main.py             Khởi tạo app, xử lý lỗi nghiệp vụ từ PostgreSQL
  app/auth.py             JWT, bcrypt, phân quyền theo vai trò
  app/realtime.py         SSE trạng thái chuyến bay (LISTEN/NOTIFY) + job dọn ghế giữ quá hạn
  app/routers/            auth · flights · bookings · staff · admin
  tests/test_api.py       Kiểm thử luồng đặt vé end-to-end
frontend/                 Giao diện React
  src/pages/              Trang tìm chuyến, kết quả, đặt vé, vé của tôi, trạng thái, nhân viên, quản trị
  src/components/SeatMap.jsx   Sơ đồ ghế dạng lưới
scripts/import_openflights.sql Nạp toàn bộ sân bay từ OpenFlights (tuỳ chọn)
tests/test_concurrency.py      Kiểm thử 50 người cùng giữ / cùng thanh toán một ghế
docker-compose.yml             PostgreSQL cho môi trường phát triển
```

## Chạy dự án

Cần: Python 3.11+, Node.js 20+, và PostgreSQL (qua Docker hoặc cài sẵn).

**1. Cơ sở dữ liệu**

```bash
docker compose up -d
```

Hoặc với PostgreSQL cài sẵn:

```bash
createdb flight_booking
psql -d flight_booking -v ON_ERROR_STOP=1 -f database/01_schema.sql -f database/02_functions.sql -f database/03_seed.sql
```

**2. Backend** (http://localhost:8000, tài liệu API tự sinh tại http://localhost:8000/docs)

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
fastapi dev app/main.py
```

Mặc định kết nối `postgresql://postgres:postgres@localhost:5432/flight_booking`; đổi bằng biến môi trường
`DATABASE_URL`, `SECRET_KEY` (xem `backend/.env.example`).

**3. Frontend** (http://localhost:5173, tự chuyển tiếp `/api` sang backend)

```bash
cd frontend
npm install
npm run dev
```

**Tài khoản mẫu** (mật khẩu `123456`): `khach@flight.test` (hành khách), `staff@flight.test` (nhân viên),
`admin@flight.test` (quản trị).

**Kiểm thử** (khi database đang chạy):

```bash
cd backend
python -m pytest -q
cd ..
python tests/test_concurrency.py
```

## Chức năng

| Vai trò | Trang | Chức năng |
|---|---|---|
| Hành khách | Tìm chuyến bay | Một chiều / khứ hồi, điểm đi, điểm đến, ngày, số khách |
| | Kết quả | Lọc theo hãng, hạng vé (Phổ thông / Thương gia), giá tối đa, khung giờ cất / hạ cánh |
| | Đặt vé | Sơ đồ ghế dạng lưới theo loại máy bay, giữ ghế 15 phút, nhập thông tin hành khách |
| | Vé của tôi | Lịch sử đặt chỗ, thanh toán (VNPAY / MoMo / ZaloPay / thẻ — mô phỏng), vé điện tử, check-in online (24h–1h trước giờ bay) |
| Mọi người | Trạng thái chuyến bay | Bảng Đúng giờ / Hoãn / Huỷ... cập nhật realtime |
| Nhân viên | Nhân viên | Cập nhật trạng thái & giờ dự kiến, danh sách hành khách, làm thủ tục, xác nhận lên máy bay, tra cứu PNR |
| Quản trị | Quản trị | Báo cáo doanh thu & tỷ lệ lấp đầy, tạo chuyến bay + giá vé, thêm sân bay / chủng loại máy bay (sinh sơ đồ ghế) / tàu bay, phân quyền & khoá tài khoản |

## API chính

| Phương thức | Đường dẫn | Quyền |
|---|---|---|
| POST | `/api/auth/register`, `/api/auth/login` · GET `/api/auth/me` | — |
| GET | `/api/airports`, `/api/flights/search?origin&destination&date&passengers` | — |
| GET | `/api/flights/{id}/seats` | — |
| POST / DELETE | `/api/seats/{flight_seat_id}/hold` | Đăng nhập |
| POST | `/api/bookings` · GET `/api/bookings`, `/api/bookings/{pnr}` | Đăng nhập |
| POST | `/api/bookings/{pnr}/pay`, `/api/tickets/{id}/check-in` | Chủ booking |
| GET | `/api/flight-status?date`, `/api/flight-status/stream` (SSE) | — |
| PATCH | `/api/staff/flights/{id}/status` · GET `/api/staff/flights/{id}/passengers` | Nhân viên, Quản trị |
| POST | `/api/staff/tickets/{id}/check-in`, `/api/staff/tickets/{id}/board` | Nhân viên, Quản trị |
| GET / POST / PATCH | `/api/admin/catalog`, `/flights`, `/airports`, `/aircraft-models`, `/aircraft`, `/reports`, `/users` | Quản trị |

## Sơ đồ quan hệ (ERD)

```mermaid
erDiagram
    USERS ||--o{ BOOKINGS : "đặt"
    USERS ||--o{ FLIGHT_SEATS : "giữ ghế"
    AIRLINES ||--o{ AIRCRAFT : "sở hữu"
    AIRLINES ||--o{ FLIGHTS : "khai thác"
    AIRCRAFT_MODELS ||--o{ AIRCRAFT : "chủng loại"
    AIRCRAFT_MODELS ||--o{ CABIN_LAYOUTS : "bố cục khoang"
    AIRCRAFT_MODELS ||--o{ SEATS : "ghế vật lý"
    AIRCRAFT ||--o{ FLIGHTS : "bay"
    AIRPORTS ||--o{ FLIGHTS : "đi / đến"
    FLIGHTS ||--o{ FLIGHT_SEATS : "tồn kho ghế"
    SEATS ||--o{ FLIGHT_SEATS : "là"
    FLIGHTS ||--o{ FLIGHT_FARES : "giá vé"
    FARE_CLASSES ||--o{ FLIGHT_FARES : "hạng vé"
    FLIGHTS ||--o{ FLIGHT_STATUS_HISTORY : "lịch sử trạng thái"
    BOOKINGS ||--o{ PASSENGERS : "gồm"
    BOOKINGS ||--o{ PAYMENTS : "thanh toán"
    PASSENGERS ||--o{ TICKETS : "có"
    FLIGHT_FARES ||--o{ TICKETS : "áp giá"
    FLIGHT_SEATS ||--o{ TICKETS : "ngồi"
```

| Nhóm | Bảng | Vai trò |
|---|---|---|
| Người dùng | `users` | Tài khoản, phân quyền `PASSENGER` / `STAFF` / `ADMIN` |
| Danh mục | `airports`, `airlines` | Sân bay theo mã IATA (OpenFlights), hãng bay |
| Đội bay & ghế | `aircraft_models`, `cabin_layouts`, `seats`, `aircraft` | Chủng loại máy bay, bố cục khoang (`'ABC-DEF'`, `'A-DG-K'`), ghế sinh tự động, tàu bay |
| Chuyến bay | `flights`, `flight_status_history` | Lịch bay, trạng thái (Đúng giờ / Hoãn / Huỷ...), nhật ký đổi trạng thái |
| Giá vé | `fare_classes`, `flight_fares` | Hạng vé + chính sách hành lý / đổi / hoàn; giá theo chuyến |
| Tồn kho ghế | `flight_seats` | Trạng thái từng ghế của từng chuyến: `AVAILABLE` / `HELD` / `BOOKED` / `BLOCKED` |
| Đặt chỗ | `bookings`, `passengers`, `tickets`, `payments` | Mã đặt chỗ PNR, hành khách, vé điện tử (1 khách × 1 chặng), giao dịch thanh toán |

**View sẵn cho backend:** `v_flight_search` (tìm & lọc chuyến), `v_seat_map` (sơ đồ ghế dạng lưới),
`v_flight_load_factor` (tỷ lệ lấp đầy), `v_revenue_daily` (doanh thu theo ngày bay, hãng).

## Kiểm soát tranh chấp ghế

```
AVAILABLE --hold_seat()--> HELD --confirm_booking()--> BOOKED
    ^                        |
    +-- release_seat() / release_expired_holds() (hết hạn giữ)
```

- **`hold_seat(seat, user, phút)`** là *một* câu `UPDATE ... WHERE status = 'AVAILABLE' OR (HELD đã hết hạn)`.
  Khi nhiều giao dịch cùng cập nhật một dòng, PostgreSQL khoá dòng: giao dịch đến sau phải chờ rồi
  đánh giá lại điều kiện trên dữ liệu mới nhất → không còn thoả → thất bại. Không có khoảng hở
  "kiểm tra rồi mới ghi" (check-then-act).
- **`confirm_booking(booking)`** chạy trong cùng transaction với việc ghi thanh toán: khoá booking
  (`FOR UPDATE`), khoá các ghế theo thứ tự id (tránh deadlock), chuyển ghế sang `BOOKED`; thiếu một
  ghế là huỷ toàn bộ. Đồng thời kiểm tra ghế đúng khoang của hạng vé đã mua.
- **Lưới an toàn cuối cùng:** unique index `uq_tickets_seat_issued` — một ghế không bao giờ có 2 vé
  đã xuất, kể cả khi code ứng dụng sai.
- **`release_expired_holds()`**: gọi định kỳ (~1 phút) để huỷ booking quá hạn thanh toán và trả ghế.
  Việc giữ ghế vẫn đúng kể cả khi job chưa chạy, vì ghế hết hạn được coi là trống.

Kết quả `tests/test_concurrency.py` (50 luồng, mỗi luồng một kết nối, xuất phát cùng lúc):

```
[Ngây thơ]         50 người được báo 'giữ ghế thành công'  -> TRÙNG GHẾ
[hold_seat]         1 người giữ được ghế
[confirm_booking]   1 booking được xác nhận, 1 vé ISSUED trên ghế
[unique index]    chặn được vé thứ 2 trên cùng ghế
```

## Luồng đặt vé

1. Tìm chuyến: `GET /api/flights/search` đọc view `v_flight_search`.
2. Sơ đồ ghế: `GET /api/flights/{id}/seats` đọc `v_seat_map`, vẽ theo `(seat_row, grid_col)`; tự làm mới mỗi 10 giây.
3. Khách bấm ghế: `POST /api/seats/{id}/hold` gọi `hold_seat()` → 409 "ghế vừa có người chọn" nếu thua.
4. `POST /api/bookings`: trong một transaction tạo `bookings` (PENDING, hạn 15 phút) + `passengers` + `tickets`
   và gia hạn giữ ghế.
5. `POST /api/bookings/{pnr}/pay`: trong **một transaction** ghi `payments` rồi `confirm_booking()`; ghế đã mất
   thì cả thanh toán bị rollback và trả 409.
6. Check-in online / tại quầy và xác nhận lên máy bay: `tickets.status` → `CHECKED_IN` → `BOARDED`.

**Trạng thái realtime:** nhân viên đổi trạng thái → backend `set_config('app.user_id', ...)` rồi `UPDATE flights`
→ trigger ghi `flight_status_history` và `NOTIFY flight_status` → luồng nền `LISTEN` đẩy qua SSE tới trình duyệt.
Luồng nền này cũng gọi `release_expired_holds()` mỗi phút.

## Ghi chú & hướng phát triển

- **Cổng thanh toán đang mô phỏng** (`backend/app/routers/bookings.py`, hàm `pay`). Tích hợp VNPAY/MoMo
  sandbox: tạo URL thanh toán, nhận IPN, kiểm tra chữ ký HMAC rồi chạy đúng transaction đó;
  `payments.provider_txn_id` unique chống xử lý IPN trùng.
- Chưa có: huỷ / đổi vé có hoàn tiền, giá riêng cho trẻ em / em bé, giới hạn số ghế giữ mỗi người,
  chatbot AI (có thể đọc `fare_classes.description` và `v_flight_search`).
- Ngày giờ hiển thị và lọc theo giờ Việt Nam.
- Bản build: `npm run build` tạo `frontend/dist/`; khi triển khai, đặt sau reverse proxy (nginx) cùng
  backend, chuyển `/api` sang FastAPI.
- Danh mục sân bay đầy đủ: tải `airports.dat` từ OpenFlights rồi chạy `scripts/import_openflights.sql`.
