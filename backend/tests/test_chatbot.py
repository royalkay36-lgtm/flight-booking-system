"""Kiểm thử phần phân tích câu của chatbot (không cần database)."""
import datetime as dt

from app.chatbot import ALIASES, ChatContext, detect_intent, parse_max_price, parse_search, parse_slot, single_city, normalize, with_context

TODAY = dt.date(2026, 11, 2)  # thứ Hai


def search(msg):
    return parse_search(msg, TODAY, ALIASES)


def follow(msg, **ctx):
    return with_context(search(msg), ChatContext(**ctx), msg, ALIASES)


def test_mot_thanh_pho_va_vai_tro():
    assert single_city(normalize("Tôi muốn đi Đà Nẵng"), ALIASES) == ("DAD", "destination")
    assert single_city(normalize("từ Huế"), ALIASES) == ("HUI", "origin")
    assert single_city(normalize("Hà Nội"), ALIASES) == ("HAN", None)
    assert single_city(normalize("Hà Nội đi Huế"), ALIASES) is None


def test_cau_hoi_noi_tiep_dung_lai_dieu_kien_truoc():
    base = dict(origin="HAN", destination="DAD", date=dt.date(2026, 11, 14), passengers=2, slot=(5, 12))
    q = follow("Ngày 15/11 thì sao?", **base)  # đổi ngày, giữ tuyến, số khách, khung giờ
    assert (q["origin"], q["destination"], q["date"], q["passengers"], q["slot"]) == ("HAN", "DAD", dt.date(2026, 11, 15), 2, (5, 12))
    q = follow("Chuyến về", **base)  # đảo chiều, không dùng lại ngày đi
    assert (q["origin"], q["destination"], q["date"]) == ("DAD", "HAN", None)
    q = follow("Còn Phú Quốc thì sao?", **base)  # đổi điểm đến
    assert (q["origin"], q["destination"], q["date"]) == ("HAN", "PQC", dt.date(2026, 11, 14))
    q = follow("Chỉ chuyến buổi tối", **base)
    assert (q["origin"], q["slot"]) == ("HAN", (18, 24))
    q = follow("Sài Gòn đi Huế", **base)  # câu tìm mới đầy đủ: không kéo điều kiện cũ
    assert (q["origin"], q["destination"], q["date"], q["passengers"]) == ("SGN", "HUI", None, 1)


def test_tra_loi_cau_hoi_thieu_thanh_pho():
    q = follow("Hà Nội", destination="DAD")  # bot vừa hỏi "Bạn bay từ đâu?"
    assert (q["origin"], q["destination"]) == ("HAN", "DAD")
    q = follow("Từ TP.HCM", destination="DAD")
    assert (q["origin"], q["destination"]) == ("SGN", "DAD")
    q = follow("cảm ơn", destination="DAD")
    assert q["origin"] is None


def test_cau_vi_du_trong_de_cuong():
    q = search("Tìm chuyến từ Hà Nội đi Đà Nẵng sáng thứ 7 tuần sau, giá dưới 1 triệu")
    assert (q["origin"], q["destination"]) == ("HAN", "DAD")
    assert q["date"] == dt.date(2026, 11, 14)  # thứ 7 của tuần kế tiếp
    assert q["slot"] == (5, 12)
    assert q["max_price"] == 1_000_000


def test_thanh_pho_va_ma_san_bay():
    assert (search("vé sài gòn phú quốc")["origin"], search("vé sài gòn phú quốc")["destination"]) == ("SGN", "PQC")
    q = search("đi Đà Nẵng từ Hà Nội")
    assert (q["origin"], q["destination"]) == ("HAN", "DAD")
    q = search("HAN đi Đà Nẵng")
    assert (q["origin"], q["destination"]) == ("HAN", "DAD")
    q = search("SGN PQC ngày 20/11")
    assert (q["origin"], q["destination"], q["date"]) == ("SGN", "PQC", dt.date(2026, 11, 20))
    q = search("vé Hà Nội Sài Gòn")  # "vé" không bị hiểu là "về"
    assert (q["origin"], q["destination"]) == ("HAN", "SGN")


def test_ngay():
    assert search("hà nội đi hcm ngày mai")["date"] == TODAY + dt.timedelta(days=1)
    assert search("hà nội đi hcm hôm nay")["date"] == TODAY
    assert search("hà nội đi hcm chủ nhật")["date"] == dt.date(2026, 11, 8)
    assert search("hà nội đi hcm thứ 2")["date"] == TODAY
    assert search("hà nội đi hcm ngày 5/1")["date"] == dt.date(2027, 1, 5)  # đã qua trong năm -> năm sau
    assert search("hà nội đi hcm")["date"] is None


def test_gia_va_so_khach():
    assert parse_max_price("duoi 800k") == 800_000
    assert parse_max_price("toi da 1.5tr") == 1_500_000
    assert parse_max_price("khong qua 1,2 trieu") == 1_200_000
    assert parse_max_price("duoi 1.200.000d") == 1_200_000
    assert parse_max_price("re nhat") is None
    assert search("2 người hà nội đi đà nẵng")["passengers"] == 2
    assert search("hà nội đi đà nẵng")["passengers"] is None  # không nói số khách: để lượt trước quyết định
    assert search("hà nội đi đà nẵng hạng thương gia")["cabin"] == "BUSINESS"


def test_khung_gio_khong_nham_tu_dong_nghia():
    assert parse_slot("chiều mai") == (12, 18)
    assert parse_slot("Tôi muốn bay đi Đà Nẵng") is None      # "tôi" không phải "tối"
    assert parse_slot("chuyến tối thứ 6") == (18, 24)
    assert parse_slot("bay sang Hàn Quốc") is None           # "sang" = đi sang, không phải buổi sáng


def test_y_dinh():
    assert detect_intent("Hành lý ký gửi bao nhiêu kg?") == "baggage"
    assert detect_intent("Chính sách hoàn huỷ vé") == "refund"
    assert detect_intent("chuyến bay bị hoãn thì sao") is None  # "hoãn" khác "hoàn"
    assert detect_intent("muốn đổi chuyến sang ngày khác") == "change"
    assert detect_intent("có mã khuyến mãi không") == "promo"
    assert detect_intent("mua sim ở đâu") == "extras"
    assert detect_intent("gửi vé về email abc@gmail.com") is None  # "com" không kích hoạt suất ăn
    assert detect_intent("xin chào") == "greet"
