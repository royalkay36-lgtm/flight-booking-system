# SkyBooking — Báo cáo sau sửa lỗi đặt vé

**Cập nhật ngày 06/11/2026, múi giờ Asia/Bangkok (UTC+7).** Đây là kết quả sửa và kiểm tra thực tế, thay cho kết luận đánh giá trước sửa. Bản đánh giá trước sửa được lưu cục bộ. Báo cáo này cùng ảnh và bài test được đưa lên nhánh bàn giao.

## 1. Phạm vi và phiên bản

- Bản đã sửa: **`feature/dat-ve-ui`**, dựa trên commit `8d73578` cùng các thay đổi trong bản bàn giao, tại **`D:\project\flight-booking-system-booking-ui`**. Đây là worktree của cùng kho mã, có đủ thanh bước, điều hướng điện thoại, giá thu gọn, sơ đồ máy bay và thẻ dịch vụ.
- Thư mục gốc `D:\project\flight-booking-system` vẫn ở nhánh `feature/booking-stepper`; worktree `flight-booking-system-seat-map` vẫn ở `feature/so-do-ghe`. Commit và push chỉ trên `feature/dat-ve-ui` theo yêu cầu của người dùng; không merge/checkout sang nhánh cũ, không ghi đè ba thay đổi có sẵn của bản gốc (`.vscode/tasks.json`, `Booking.jsx`, `ChatWidget.jsx`).
- **Cổng `http://localhost:5174/` hiện phục vụ frontend của bản đã sửa**, thay cho bản ghế cũ. Đã xác minh mã Vite phục vụ có thẻ dịch vụ, bỏ ghế, xác thực hành khách và giá thu gọn; xem [served-fixed-5174.json](fix-evidence/2026-11-06/served-fixed-5174.json). Backend dùng khi mở thử: `http://127.0.0.1:8000`.
- Kiểm thử có ghi dữ liệu chạy ở frontend 5185/backend 8001, trên database tạm **`skybooking_review_bd533a6a1811`** tạo từ SQL mẫu. Chỉ thay thời hạn của các ghế thử để mô phỏng hết hạn; không thay thời hạn giữ ghế trong mã nghiệp vụ. SMTP tắt. Đã dọn database và tiến trình thử, giữ backend 8000/frontend 5174 chạy.
- Môi trường: React 19.3.1, Vite 8.3.5, Tailwind CSS 4.3.3; Python 3.11.9, FastAPI 0.162.0, PostgreSQL 18.6. Viewport kiểm tra: desktop 1280×720, màn hình nhỏ 390×844 và 320×740.

## 2. Lỗi, nguyên nhân và cách sửa

Các đường dẫn trong cột File thuộc `D:\project\flight-booking-system-booking-ui\frontend`.

| Lỗi | Nguyên nhân | Cách sửa | File liên quan | Kết quả kiểm tra |
|---|---|---|---|---|
| Ngày sinh tương lai/sai loại khách vẫn qua bước Hành khách | Form chỉ kiểm tra trường bắt buộc rồi gọi chuyển bước | Giới hạn ngày sinh đến hôm nay; xác thực hành khách bằng API quote trước khi chuyển bước, không sao chép công thức giá sang FE; bổ sung giới hạn trường theo schema | `src/pages/Booking.jsx`, `src/components/bookingData.js` | Ngày sinh 2030 bị chặn ngay tại form. Người lớn có DOB 2018 bị backend từ chối và vẫn ở bước 1. Thiếu giấy tờ bay quốc tế cũng bị chặn. Dữ liệu hợp lệ đi tiếp được. |
| Thông báo xác thực cũ còn hiện sau khi sửa dữ liệu; lỗi thao tác nằm ngoài vùng nhìn | Lỗi không được xóa khi sửa trường, không đưa focus về thông báo | Xóa lỗi khi chỉnh hành khách/liên hệ; đưa focus về vùng lỗi sau thao tác thất bại | `src/pages/Booking.jsx` | Sửa họ tên làm lỗi cũ biến mất; lỗi xác thực và lỗi nhả ghế được đưa vào vùng nhìn, có `role=alert`. |
| Không xác định được nội địa/quốc tế khi API sân bay lỗi | Lỗi tải thông tin hành trình bị bỏ qua | Có trạng thái tải/lỗi và nút thử lại; không cho qua bước 1 khi chưa xác định được phạm vi hành trình | `src/pages/Booking.jsx` | Mô phỏng `/airports` 503: ở lại bước 1 và có thông báo. Tải lại thành công vẫn giữ họ tên/ngày sinh, sau đó đi tiếp được. |
| Xác thực bước đầu có thể mắc kẹt vì voucher/dịch vụ/ghế của bước sau | Dùng toàn bộ lựa chọn hiện tại để xác thực hành khách có thể làm lỗi tùy chọn chặn quay lại | Tạo payload xác thực riêng: giữ hành khách/chuyến bay, tạm bỏ ghế/dịch vụ/voucher trong request xác thực. Payload đặt chỗ thật không bị sửa. Quote xác thực có khóa riêng, không được hiển thị như giá của lựa chọn đầy đủ | `src/components/bookingData.js`, `src/pages/Booking.jsx` | Unit test chứng minh không đổi body gốc. UI quay từ Xác nhận về Hành khách rồi đi tiếp vẫn giữ ghế, dịch vụ và voucher; tổng trở lại đúng 22.800.000đ. Trường hợp voucher thực sự hết hạn trong lúc quay lại chưa thử trực tiếp. |
| API ghế lỗi hoặc dữ liệu rỗng bị hiện thành đang tải mãi | Nuốt lỗi; dùng `seats.length===0` để suy ra loading | Tách loading/error/empty; hiện lỗi và nút thử lại ở kích thước chữ bình thường, ngoài sơ đồ thu phóng. Có thể giữ dữ liệu gần nhất nhưng khóa chọn khi chưa xác minh lại | `src/components/SeatMap.jsx`, `seatMapData.js`, `SeatMap.module.css` | API 503 có lỗi/nút thử lại, không còn spinner giả. API `[]` có thông báo chưa có dữ liệu. API phục hồi thì chọn ghế lại được. Giữ dữ liệu cũ khi tải nền lỗi được kiểm bằng unit test và đọc mã. |
| Phản hồi tải ghế cũ có thể ghi đè bản mới | Không phân biệt các yêu cầu đang chồng nhau | Loader chỉ nhận yêu cầu mới nhất; bỏ kết quả sau unmount; phiên bản tải ngăn snapshot trước thao tác hold làm mất lựa chọn mới | `seatMapData.js`, `SeatMap.jsx`, `src/pages/Booking.jsx` | Test deferred response, late success/error và unmount đều qua; chọn ghế khi POST bị làm chậm vẫn giữ đúng lựa chọn. |
| Không có cách bỏ ghế để trở về xếp khi check-in | Ghế đã chọn bị disabled, parent không có thao tác nhả riêng | Thêm nút Bỏ chọn ghế cho từng khách/chặng. Chỉ xóa seat ID sau khi DELETE hoàn tất; cập nhật quote từ backend | `src/pages/Booking.jsx` | Bỏ bằng Enter thành công, tổng 21.150.000 → 21.000.000đ. DELETE 503 giữ nguyên ghế/phí và báo lỗi; thử lại thành công mới bỏ ghế. |
| Thay ghế nhưng nhả ghế cũ lỗi bị bỏ qua, giữ thừa ghế không được báo | DELETE cũ chạy không chờ và `.catch` bỏ lỗi | Giữ mới rồi chờ nhả cũ. Nếu nhả lỗi, lưu ghế cần xử lý, báo rõ và khóa đi tiếp; có nút Thử nhả ghế cũ. Không giả vờ nhả thành công | `src/components/seatHolds.js`, `src/pages/Booking.jsx` | Mô phỏng DELETE 503: ghế mới vẫn được chọn, điều hướng bị khóa và có nút phục hồi. Hết lỗi, retry nhả đúng ghế cũ; DB chỉ còn ghế mới được giữ. |
| Ghế hết hạn/mất quyền giữ vẫn nằm trong lựa chọn và phí | State hành khách không được đối chiếu lại với `mine` từ API | Đồng bộ ghế sau tải/poll; bỏ đúng khách/chặng bị mất hold. Kiểm tra lại mọi chặng có ghế trước POST booking; nếu mất hold, không tạo đơn, quay đúng chặng/khách cần chọn lại | `seatHolds.js`, `SeatMap.jsx`, `src/pages/Booking.jsx` | Đã thử hết hạn mô phỏng khi ở bước khác và trước Đặt chỗ; cũng gặp hết hạn tự nhiên trong lượt thử dài. Ghế mất được xóa, phí tính lại. Trước khi khôi phục đầy đủ, số POST booking vẫn bằng 0. |
| Click cảm ứng `detail=0` sau kéo có thể bị coi là thao tác bàn phím | Chỉ loại click có `detail!=0` | Kiểm tra thêm `pointerType`/`nativeEvent.pointerType`; giữ click bàn phím thực sự hoạt động | `src/components/useSeatMapViewport.js` | Test touch click detail=0 sau drag bị chặn; keyboard detail=0 vẫn dùng được. Kéo/zoom bằng chuột ở desktop và viewport nhỏ không sinh thêm POST hold. Chưa thử hai ngón trên điện thoại thật. |
| Lỗi quote phải đổi lựa chọn/bước mới thử lại; hàng tổng tiền chật ở 320px | Chưa có retry quote; hàng tổng không cho xuống dòng | Thêm Thử lại báo giá; cho tổng và nút chi tiết tự xuống dòng theo không gian | `src/pages/Booking.jsx` | Quote 503 hiện Chưa có giá, lỗi và nút thử lại; Đặt chỗ bị khóa. Retry phục hồi đúng giá. Ở 320px tổng 23.000.000đ và nút chi tiết không bị đè/cắt, trang không tràn ngang. |
| Mở nhầm bản cũ ở cổng 5174 | Các task nằm ở các worktree khác nhau | Chạy frontend của `feature/dat-ve-ui` tại 5174 và ghi rõ đường dẫn nguồn, giữ nguyên các nhánh cũ | Cấu hình tiến trình chạy; không sửa mã nhánh cũ | HTTP 200; mã do Vite phục vụ xác nhận đúng worktree và các thành phần đã sửa. |

Không sửa backend, schema, API endpoint/payload nghiệp vụ hoặc cách tính tiền. `SeatMap` giữ các props/callback cũ; chỉ thêm callback tùy chọn để thông báo dữ liệu tải thành công. Thẻ dịch vụ và `ChatWidget` đã có ở bản tổng hợp được giữ lại, không viết lại.

## 3. Yêu cầu còn thiếu đã hoàn thiện và phần được giữ

- **Thanh 4 bước:** giữ số, đường nối, thứ tự và trạng thái; bổ sung chặn dữ liệu không hợp lệ trước khi đánh dấu hoàn thành Hành khách. Quay lại không làm mất dữ liệu.
- **Điều hướng:** đúng nút ở bước đầu/giữa/cuối, giữ khóa thao tác khi chờ; chặn đi tiếp khi còn ghế cũ chưa nhả. Có thể xử lý lỗi rồi tiếp tục, không phải tải lại toàn bộ trang.
- **Giá thu gọn:** vẫn lấy tổng/chi tiết từ backend; retry được khi API lỗi, bố cục 320px không đè nút. Không tính tổng bằng công thức FE.
- **Ghế:** hoàn thiện bỏ ghế, lỗi/empty/retry, đồng bộ hết hạn và kiểm tra trước đặt chỗ. Giữ hình máy bay, khu giá, nhãn hàng/lối đi, giới hạn zoom và vị trí thoát hiểm theo bố cục mẫu đã được người dùng cho phép.
- **Thẻ dịch vụ:** giữ bốn nhóm, icon, giá/đơn vị thật, trạng thái và thao tác bàn phím. Đã thử phạm vi riêng theo khách và hai chặng; không thêm trường số lượng vì API hiện chỉ có một gói/loại/phạm vi, cấu trúc `{code, segment}`.

## 4. Xác minh sau sửa

### Build, test và dữ liệu

| Kiểm tra đã chạy | Kết quả |
|---|---|
| `npm.cmd run build` tại frontend bản sửa | Thành công, Vite 8.3.5. |
| `node --test tests/*.test.js` | **32/32 đạt**, không fail/skip: 19 test có sẵn và 13 test mới về tải ghế, hold/recovery, payload xác thực và chặn click sau kéo. |
| Runner backend `fix_backend.py tests D:\project\flight-booking-system-booking-ui` | **12/12 pytest đạt**, database tạm được dọn. SMTP tắt. |
| `git diff --check` | Không báo lỗi khoảng trắng. |
| Console ở các trang thử đã quan sát | Không có mục lỗi JavaScript do công cụ trả về. API có các 422/503 chủ ý trong tình huống thử, không được hiểu là mọi request đều thành công. |

Lệnh build/test cuối từng bị hệ thống duyệt tự động chặn vì hạn mức, **chưa thực thi lúc đó**. Sau khi tiếp tục, đã chạy lại thành công; kết quả 32/32 và build ở đây là của lần chạy thực tế sau cùng, lưu trong `tests-final.log` và `build-final.log`.

### Các luồng đã chạy trực tiếp

1. **Khứ hồi:** HAN → ICN ngày 07/11/2026, ICN → HAN ngày 09/11/2026; một người lớn, một trẻ em, một em bé. Thử form trống, DOB tương lai, sai loại khách và thiếu giấy tờ quốc tế; sau đó sửa đúng và đi tiếp.
2. **Ghế:** chọn nhiều khách/hai chặng, đổi ghế, bỏ ghế bằng bàn phím, lỗi DELETE, retry nhả cũ, mất hold và quay lại chọn. Không chọn ghế riêng cho em bé. Luồng riêng Thương gia đã chọn/bỏ ghế 1A bằng Space/Enter thành công; ghế khác khoang vẫn bị khóa.
3. **Kéo/zoom:** kéo bằng chuột trong viewport desktop và 390px, nút + bằng Enter, reset; trong khoảng đo, POST hold **9 trước / 9 sau**. Pinch được kiểm ở logic bằng test sự kiện, không tuyên bố đã thử cảm ứng thật.
4. **Dịch vụ:** chọn/bỏ gói riêng từng chặng/khách; chuyển bước, quay về Hành khách rồi đi tiếp vẫn giữ lựa chọn. Bỏ BAG40 chặng về làm tổng sau voucher **22.800.000 → 22.460.000đ**, chọn lại trả về **22.800.000đ**. Em bé chỉ mở bảo hiểm theo quy tắc UI có sẵn; SIM nội địa bị khóa đúng lý do.
5. **Quote trả sai thứ tự:** mô phỏng phản hồi gói BAG20 chậm. Log cho thấy quote mới **23.000.000đ** trả lúc **10:59:22**, quote cũ **22.920.000đ** về sau lúc **11:00:07** (UTC+7). Giao diện vẫn theo lựa chọn BAG30 và các cập nhật mới; không lấy giá cũ làm kết quả hiện hành. Có thêm thử quote 503 và retry thành công.
6. **Nhấp nhanh:** nhấp đôi chọn ghế khi POST bị làm chậm 2,5 giây: UI khóa khi chờ, một POST trước lần nhả ghế đầu. Nhấp đôi Đặt chỗ với phản hồi chậm cũng chỉ có **một POST `/api/bookings`**, HTTP 201.
7. **Đơn thử `GDXSYB`:** ba khách, hai chặng, bốn ghế và tám lựa chọn dịch vụ đúng phạm vi. Subtotal **23.000.000đ**, voucher `CHAOBAN` giảm **200.000đ**, tổng **22.800.000đ** khớp quote, request và chi tiết đơn. Không bấm thanh toán. Đơn tạo ở trạng thái Chờ thanh toán; sau thời gian gián đoạn nó đã hết hạn, rồi được dọn cùng database thử. Log UI có **0 POST thanh toán**.
8. **Bố cục:** viewport 390px và 320px không tràn trang (`scrollWidth/clientWidth` tương ứng 375/375 và 305/305). Thanh nút nằm dưới cùng; nút bỏ ghế/nội dung dài tự xuống dòng. Giá đóng/mở bằng bàn phím; chatbot mở có đáy y=748, thanh nút bắt đầu y≈775, không chồng nhau.
9. **Phục hồi dữ liệu:** lỗi API thông tin hành trình chặn bước đầu; retry giữ dữ liệu và đi tiếp được. Danh mục dịch vụ 503 có lỗi/retry; phục hồi vẫn giữ tên khách và mở đúng dịch vụ, SIM nội địa tiếp tục bị khóa.

Các API lỗi, độ trễ và hết hạn mô phỏng chỉ áp dụng ở backend 8001/database tạm, không trên dữ liệu đang dùng ở 8000. Không tạo đơn mới trên database gốc trong lượt này. Không chạy lại kiểm thử tranh chấp 50 luồng trong lượt sửa frontend; kết quả cũ nằm ở báo cáo trước và không được gán thành kết quả mới.

### Bằng chứng

Ảnh, log và công cụ thử: [fix-evidence/2026-11-06](fix-evidence/2026-11-06).

| Tệp | Nội dung |
|---|---|
| `01-passenger-validation.jpg` | Chặn sai loại hành khách ngay tại bước 1. |
| `02-seat-error.jpg`, `03-seat-empty.jpg` | Lỗi/empty ghế được phân biệt, có cách phục hồi. |
| `04-pending-release.jpg`, `05-release-error-keeps-seat.jpg` | Không bỏ qua lỗi nhả ghế cũ; không xóa lựa chọn khi DELETE lỗi. |
| `06-expired-hold.jpg`, `10-submit-rechecks-holds.jpg` | Mất hold được phát hiện, quay đúng luồng chọn lại và báo giá lại. |
| `07-mobile-seat-controls.jpg`, `08-mobile-320-summary.jpg` | Nút bỏ ghế, thanh cố định và giá thu gọn trên màn hình nhỏ. |
| `09-quote-retry.jpg`, `11-mobile-service-card.jpg`, `12-mobile-chat.jpg` | Retry quote, thẻ và chatbot. |
| `13-booking-created-once.jpg` | Đơn thử đúng tổng, chờ thanh toán. |
| `14-itinerary-data-error.jpg`, `15-service-load-error.jpg`, `16-recovery-complete.jpg` | Chặn/khôi phục lỗi dữ liệu và trở lại giao diện bình thường. |
| `fix-summary.json`, `gestures.json` | Số liệu tổng hợp của lượt thử; log request/response thô được giữ cục bộ. |
| `tests-final.log`, `build-final.log`, `backend-tests.log` | Kết quả lệnh kiểm tra. |

## 5. Phần còn lại và mức sẵn sàng demo

**Có thể demo các luồng đã kiểm tra trên `feature/dat-ve-ui` ở cổng 5174**, gồm luồng thuận, lỗi xác thực, bỏ/đổi ghế, hết hạn, lỗi API/retry và khứ hồi. Không còn ba lỗi chính của báo cáo cũ trong các lần thử lại tương ứng. Build thành công không phải căn cứ duy nhất cho kết luận này.

Chưa xác minh đầy đủ:

- Pinch thật, vùng an toàn, bàn phím ảo trên iOS/Android và các trình duyệt khác. Cần thử trực tiếp trên điện thoại; viewport và unit test không thay thế phần này.
- Mạng đứt sau khi server đã ghi thành công nhưng client chưa nhận response. Chống nhấp nhanh đã thử; không tuyên bố có cơ chế idempotency mới ở backend.
- Tranh chấp giữa hai phiên UI khác nhau và mọi trường hợp dữ liệu quản trị thay đổi giữa lúc chọn/đặt. Backend có kiểm thử nghiệp vụ hiện có, nhưng chưa mô phỏng đầy đủ các phiên UI này.
- Sơ đồ ở mức fit 100% còn nhỏ trên màn hình hẹp, cần zoom để đọc/bấm rõ. Đây là cải tiến tương tác cần đánh giá trên thiết bị thật; không thay đổi mức zoom/giới hạn chỉ để che vấn đề.
- Bản sửa được bàn giao trên `feature/dat-ve-ui`, chưa được tích hợp sang các nhánh cũ. Không nên mở frontend ở thư mục gốc rồi mặc định nó chứa toàn bộ bản sửa. Cần dùng đúng worktree đã ghi ở mục 1.

**Cách thử:** mở [http://localhost:5174/](http://localhost:5174/), đăng nhập tài khoản mẫu Hành khách, chọn chuyến tương lai → nhập hành khách → chọn/đổi/bỏ ghế → chọn dịch vụ → xem xác nhận và mở/thu gọn giá. Có thể kiểm tra validation bằng ngày sinh tương lai hoặc sai loại khách. Không reset database để thử.

Nếu cần chạy lại frontend thủ công: tại `D:\project\flight-booking-system-booking-ui\frontend`, dùng `npm.cmd run dev -- --host localhost --port 5174 --strictPort` sau khi dừng tiến trình đang chiếm cổng. Backend dùng môi trường `.env` hiện có tại `D:\project\flight-booking-system\backend`.
