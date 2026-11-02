# SkyBooking — Hệ thống quản lý và đặt vé máy bay

Đề tài **Xây dựng hệ thống website quản lý và đặt vé máy bay**: tìm kiếm chuyến bay, lịch giá rẻ, sơ đồ ghế
theo chủng loại máy bay (có phí chọn ghế theo khu), giữ ghế chống xung đột khi nhiều người đặt cùng lúc, dịch vụ
bổ trợ (hành lý, suất ăn, bảo hiểm, SIM du lịch), mã giảm giá, đặt chỗ (PNR), vé điện tử qua email, đổi / huỷ
vé và hoàn tiền, check-in có thẻ lên máy bay QR, trạng thái chuyến bay realtime, trợ lý ảo (chatbot) và báo cáo
doanh thu / tỷ lệ lấp đầy ghế.

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
  app/pricing.py          Tính giá (loại khách, phí ghế, dịch vụ, voucher), tiền hoàn, phí đổi vé
  app/mailer.py           Gửi email vé điện tử / huỷ / đổi / hãng huỷ chuyến (SMTP hoặc lưu file)
  app/chatbot.py          Trợ lý ảo theo luật: hiểu câu tìm chuyến tự nhiên + hỏi đáp chính sách
  app/routers/            auth · flights · bookings · staff · admin
  tests/                  test_api (luồng đặt vé), test_features (chức năng nâng cấp), test_chatbot
frontend/                 Giao diện React
  src/pages/              Trang chủ (mua vé / quản lý đặt chỗ / làm thủ tục), kết quả, đặt vé 4 bước,
                          chi tiết đặt chỗ, vé của tôi, trạng thái, nhân viên, quản trị
  src/components/         SeatMap (sơ đồ ghế dạng lưới) · ChatWidget (khung chat trợ lý ảo)
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

**Email vé điện tử:** chưa cấu hình SMTP thì email được lưu thành file `.html` trong `backend/outbox/`
(mở bằng trình duyệt để demo). Gửi thật qua Gmail: tạo *App password* rồi đặt biến môi trường
`SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER=<gmail>`, `SMTP_PASSWORD=<app password>`.

**Cập nhật database khi có schema mới:** trong VS Code chạy task *Nạp lại database mẫu*
(xoá dữ liệu cũ và tạo lại từ đầu).

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

## Chạy bằng VS Code

Thư mục `.vscode/` đã cấu hình sẵn: chạy cả hệ thống bằng một phím, debug backend, chạy test, nạp lại database.

### Lần đầu trên máy mới (Windows)

1. Cài **Git**, **Python 3.11+**, **Node.js 20+**, **PostgreSQL 17** (đặt mật khẩu user `postgres` là `postgres`,
   cổng 5432) và **VS Code**.
2. Clone repo và mở **đúng thư mục repo** (thư mục có file `README.md`) bằng *File → Open Folder*:
   ```bash
   git clone https://github.com/royalkay36-lgtm/flight-booking-system.git
   ```
3. VS Code hỏi *Do you trust the authors…* → **Yes**. Thông báo gợi ý extension (Python, Tailwind CSS, PostgreSQL)
   → **Install**.
4. Mở terminal (`` Ctrl+` ``) và cài thư viện:
   ```bash
   cd backend; python -m venv .venv; .venv\Scripts\python -m pip install -r requirements.txt; cd ..
   ```
   ```bash
   cd frontend; npm install; cd ..
   ```
5. Tạo database: `Ctrl+Shift+P` → **Tasks: Run Task** → **Nạp lại database mẫu**.

### Hằng ngày

| Muốn làm | Thao tác |
|---|---|
| Chạy hệ thống | **`Ctrl+Shift+B`** → mở 2 terminal *Backend* và *Frontend*; khi Frontend hiện `Local: http://localhost:5173/` thì `Ctrl` + bấm vào link |
| Tắt hệ thống | Bấm 🗑 trên từng terminal *Backend* và *Frontend* |
| Lấy code mới của nhóm | `Ctrl+Shift+G` → **Sync Changes** (hoặc `git pull`); nếu có thay đổi ở `database/` hoặc `package.json` thì chạy lại `npm install` và task **Nạp lại database mẫu** |
| Commit & push | `Ctrl+Shift+G` → nhập mô tả → **Commit** → **Sync Changes** |
| Debug backend | Tắt terminal *Backend* trước (trùng cổng 8000), đặt breakpoint (chấm đỏ ở lề trái file `.py`) → **`F5`** |
| Chạy test | Biểu tượng **Testing** (bình thí nghiệm) ở thanh bên trái → ▶ (cần database đang chạy) |
| Nạp lại dữ liệu mẫu | `Ctrl+Shift+P` → **Tasks: Run Task** → **Nạp lại database mẫu** (xoá toàn bộ dữ liệu thử) |
| Xem email vé điện tử | Thư mục `backend/outbox/` → chuột phải file `.html` → *Reveal in File Explorer* → mở bằng trình duyệt |
| Xem / thử API | http://localhost:8000/docs |

Sửa code xong chỉ cần lưu (`Ctrl+S`): giao diện tự cập nhật, backend tự khởi động lại.

### Lỗi thường gặp

| Hiện tượng | Cách xử lý |
|---|---|
| Báo cổng 5173 / 8000 đang được dùng | Hệ thống đang chạy ở cửa sổ / terminal khác — tắt chỗ đó rồi chạy lại |
| Web trắng, lỗi 500 hoặc thiếu cột / bảng sau khi lấy code mới | Chạy task **Nạp lại database mẫu** |
| Không tìm thấy chuyến bay nào | Lịch bay mẫu chỉ có 14 ngày kể từ lúc nạp — chạy task **Nạp lại database mẫu** |
| Frontend báo không tìm thấy module (vd. `qrcode`) | Trong thư mục `frontend` chạy `npm install` |
| Task nạp database báo không tìm thấy `psql.exe` | Máy cài PostgreSQL khác bản 17 — sửa số `17` trong `.vscode/tasks.json` cho đúng phiên bản |
| Backend báo không kết nối được database | Kiểm tra dịch vụ `postgresql-x64-17` đang chạy (Windows → Services) và mật khẩu `postgres` |

## Làm việc nhóm trên GitHub

| Nhánh | Vai trò | Ai được sửa |
|---|---|---|
| `main` | **Bản gốc ổn định** (bản nộp / demo). Không sửa trực tiếp | Chỉ trưởng nhóm gộp `develop` vào khi cả nhóm đã chạy thử ổn |
| `develop` | **Bản làm việc chung của nhóm** | Chỉ nhận code qua Pull Request |
| `feature/<việc>` | Nhánh riêng của từng người cho từng việc | Người làm việc đó |

**Bắt đầu một việc mới:**
```bash
git checkout develop
```
```bash
git pull
```
```bash
git checkout -b feature/hinh-anh-diem-den
```

**Làm xong:** commit (`Ctrl+Shift+G` → **Commit**), đẩy nhánh lên rồi tạo Pull Request:
```bash
git push -u origin feature/hinh-anh-diem-den
```
Trên GitHub bấm **Compare & pull request** → ở ô **base** chọn **`develop`** (không chọn `main`) → chọn một người
review → người review duyệt thì bấm **Merge**.

**Mỗi ngày lấy code mới của nhóm về nhánh của mình:**
```bash
git pull origin develop
```
Bị xung đột (conflict) thì mở file bị đánh dấu trong VS Code → **Resolve in Merge Editor** → chọn phần giữ lại → commit.

**Quy tắc:**
- Không push thẳng vào `develop` hay `main`; mỗi Pull Request một việc, càng nhỏ càng dễ review.
- Trước khi tạo Pull Request: chạy test (biểu tượng **Testing**) và `npm run build` trong `frontend` không lỗi.
- Sửa `database/*.sql` thì ghi rõ trong Pull Request: *"Sau khi pull cần chạy task Nạp lại database mẫu"*.
- Không commit `node_modules/`, `.venv/`, `backend/outbox/` (đã có trong `.gitignore`).
- Ảnh dùng ảnh tự chụp hoặc ảnh miễn phí bản quyền (Unsplash, Pexels), tải về để trong `frontend/public/images/`
  (không dùng link ảnh trang khác) và ghi nguồn ảnh.

## Chức năng

| Vai trò | Trang | Chức năng |
|---|---|---|
| Hành khách | Trang chủ | 3 tab *Mua vé / Quản lý đặt chỗ / Làm thủ tục*; một chiều / khứ hồi; người lớn, trẻ em (2–11), em bé (<2); khuyến mãi đang có |
| | Kết quả | Lịch giá rẻ 7 ngày; lọc theo hãng, hạng vé, giá tối đa, khung giờ cất / hạ cánh |
| | Đặt vé (4 bước) | Hành khách → chọn ghế (tuỳ chọn, phí theo khu: hàng đầu / cửa thoát hiểm / thường) → dịch vụ bổ trợ (hành lý 20–40kg, suất ăn, bảo hiểm, **SIM du lịch** cho chặng quốc tế) → mã giảm giá & xác nhận; bảng giá do backend tính |
| | Quản lý đặt chỗ | Tra cứu bằng **PNR + họ** (không cần đăng nhập); thanh toán (VNPAY / MoMo / ZaloPay / thẻ — mô phỏng); **đổi chuyến** (phí đổi + chênh lệch giá); **huỷ vé, hoàn tiền** theo hạng vé; email vé điện tử |
| | Làm thủ tục | Check-in 24h–1h trước giờ bay, **tự xếp ghế** nếu chưa chọn, **thẻ lên máy bay có mã QR** |
| Mọi người | Trạng thái chuyến bay | Bảng Đúng giờ / Hoãn / Huỷ... cập nhật realtime |
| | Trợ lý ảo | Nút 💬 mọi trang: tìm chuyến bằng câu tự nhiên, hỏi hành lý / hoàn đổi / check-in / khuyến mãi / SIM, tra trạng thái chuyến |
| Nhân viên | Nhân viên | Cập nhật trạng thái (chặn chuyển ngược, tự email khách khi hoãn / huỷ), danh sách hành khách, làm thủ tục (tự xếp ghế), xác nhận lên máy bay, tra cứu PNR |
| Quản trị | Quản trị | Báo cáo doanh thu vé / thực thu / dịch vụ / giảm giá / tỷ lệ lấp đầy; lịch bay: tạo, **sửa giờ & giá** (tự email khách khi đổi giờ); **mã giảm giá**; sân bay, chủng loại máy bay (sinh sơ đồ ghế + phí ghế), tàu bay; phân quyền & khoá tài khoản |

**Quy tắc nghiệp vụ chính** (đều kiểm tra ở backend):
- Giá vé: trẻ em 90%, em bé 10% giá người lớn; em bé không có ghế riêng, mỗi người lớn kèm tối đa 1 em bé;
  loại khách phải khớp tuổi tại ngày bay.
- Mỗi tài khoản giữ tối đa 9 ghế / chuyến (chống giữ hết ghế); ghế giữ 15 phút.
- Voucher: theo % (có trần) hoặc số tiền, đơn tối thiểu, hạn dùng, số lượt (tăng lượt an toàn khi nhiều người
  áp cùng lúc; booking hết hạn thanh toán được trả lại lượt).
- Huỷ vé: hoàn giá vé trừ phí hoàn của hạng vé (hạng không hoàn thì 0đ); phí ghế và dịch vụ không hoàn.
  **Hãng huỷ chuyến: hoàn 100%** (cả phí ghế, dịch vụ) hoặc **đổi chuyến miễn phí**.
- Đổi chuyến: cùng chặng, cùng hạng, trước giờ bay ≥ 3 tiếng; phí đổi theo hạng + chênh lệch giá.
- Trạng thái chuyến bay chỉ đi tới: Theo lịch → Đúng giờ / Hoãn → Lên máy bay → Cất cánh → Hạ cánh (hoặc Huỷ).

## Trợ lý ảo (chatbot theo luật)

Không dùng mô hình AI bên ngoài: `backend/app/chatbot.py` nhận diện **ý định** bằng từ khoá và **trích thông tin**
bằng biểu thức chính quy, rồi trả lời từ dữ liệu thật trong database.

- Tìm chuyến: *"Tìm chuyến từ Hà Nội đi Đà Nẵng sáng thứ 7 tuần sau, giá dưới 1 triệu"* → hiểu điểm đi / đến
  (tên thành phố, tên gọi khác như Sài Gòn / HCM, mã IATA), ngày (hôm nay, ngày mai, thứ 2…CN, tuần sau, dd/mm),
  khung giờ (sáng / chiều / tối), giá (800k, 1.5tr, 1 triệu…), số khách, hạng vé.
- Hỏi đáp: hành lý, hoàn / huỷ, đổi vé, check-in, chọn ghế, khuyến mãi, dịch vụ / SIM, thanh toán, vé trẻ em.
- Tra trạng thái theo số hiệu chuyến (VJ515); tra đặt chỗ theo PNR (chỉ chủ booking đã đăng nhập).
- Xử lý nhập nhằng khi bỏ dấu tiếng Việt: *tối/tôi*, *hoàn/hoãn*, *sáng/sang*, *vé/về* (có test riêng).

## API chính

| Phương thức | Đường dẫn | Quyền |
|---|---|---|
| POST | `/api/auth/register`, `/api/auth/login` · GET `/api/auth/me` | — |
| GET | `/api/airports`, `/api/flights/search?origin&destination&date&passengers`, `/api/flights/fare-calendar` | — |
| GET | `/api/flights/{id}/seats`, `/api/ancillaries`, `/api/vouchers/public` | — |
| POST | `/api/bookings/quote` (bảng giá chi tiết), `/api/chat` (trợ lý ảo) | — |
| POST / DELETE | `/api/seats/{flight_seat_id}/hold` | Đăng nhập |
| POST | `/api/bookings` · GET `/api/bookings` | Đăng nhập |
| GET / POST | `/api/bookings/{pnr}`, `/pay`, `/cancel`, `/change` · `/api/tickets/{id}/check-in` | Chủ booking, hoặc `?last_name=` (PNR + họ) |
| GET | `/api/flight-status?date`, `/api/flight-status/stream` (SSE) | — |
| PATCH | `/api/staff/flights/{id}/status` · GET `/api/staff/flights/{id}/passengers` | Nhân viên, Quản trị |
| POST | `/api/staff/tickets/{id}/check-in`, `/api/staff/tickets/{id}/board` | Nhân viên, Quản trị |
| GET / POST / PATCH | `/api/admin/catalog`, `/flights`, `/vouchers`, `/airports`, `/aircraft-models`, `/aircraft`, `/reports`, `/users` | Quản trị |

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
    VOUCHERS ||--o{ BOOKINGS : "giảm giá"
    BOOKINGS ||--o{ BOOKING_ANCILLARIES : "mua thêm"
    PASSENGERS ||--o{ BOOKING_ANCILLARIES : "cho khách"
    ANCILLARY_PRODUCTS ||--o{ BOOKING_ANCILLARIES : "dịch vụ"
```

| Nhóm | Bảng | Vai trò |
|---|---|---|
| Người dùng | `users` | Tài khoản, phân quyền `PASSENGER` / `STAFF` / `ADMIN` |
| Danh mục | `airports`, `airlines` | Sân bay theo mã IATA (OpenFlights), hãng bay |
| Đội bay & ghế | `aircraft_models`, `cabin_layouts`, `seats`, `aircraft` | Chủng loại máy bay, bố cục khoang (`'ABC-DEF'`, `'A-DG-K'`) kèm phí chọn ghế theo khu, ghế sinh tự động, tàu bay |
| Chuyến bay | `flights`, `flight_status_history` | Lịch bay, trạng thái (Đúng giờ / Hoãn / Huỷ...), nhật ký đổi trạng thái |
| Giá vé | `fare_classes`, `flight_fares` | Hạng vé + chính sách hành lý / đổi / hoàn; giá theo chuyến |
| Tồn kho ghế | `flight_seats` | Trạng thái từng ghế của từng chuyến: `AVAILABLE` / `HELD` / `BOOKED` / `BLOCKED` |
| Đặt chỗ | `bookings`, `passengers`, `tickets`, `payments` | Mã đặt chỗ PNR, hành khách, vé điện tử (1 khách × 1 chặng, có phí ghế), thanh toán / hoàn tiền |
| Bán thêm | `ancillary_products`, `booking_ancillaries`, `vouchers` | Hành lý, suất ăn, bảo hiểm, SIM (theo chặng / cả hành trình); mã giảm giá |

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
- **`release_expired_holds()`**: gọi định kỳ (~1 phút) để huỷ booking quá hạn thanh toán, trả ghế và trả
  lượt dùng voucher. Việc giữ ghế vẫn đúng kể cả khi job chưa chạy, vì ghế hết hạn được coi là trống.
- **`assign_seat(ticket)`**: xếp ghế tự động khi check-in bằng `SELECT … FOR UPDATE SKIP LOCKED` — nhiều khách
  check-in cùng lúc không chờ nhau và không bao giờ nhận trùng ghế.

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
- Chưa có: huỷ một phần (một khách / một chặng), đổi tên hành khách, thẻ thành viên / tích điểm, đa ngôn ngữ,
  hành trình nhiều chặng.
- Ngày giờ hiển thị và lọc theo giờ Việt Nam (giờ hạ cánh chặng quốc tế cũng hiển thị theo giờ Việt Nam).
- Triển khai thật: đặt `APP_ENV=production` và `SECRET_KEY` riêng (server từ chối chạy nếu thiếu).
- Bản build: `npm run build` tạo `frontend/dist/`; khi triển khai, đặt sau reverse proxy (nginx) cùng
  backend, chuyển `/api` sang FastAPI.
- Danh mục sân bay đầy đủ: tải `airports.dat` từ OpenFlights rồi chạy `scripts/import_openflights.sql`.
