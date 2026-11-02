"""Trợ lý ảo theo luật (rule-based): nhận diện ý định bằng từ khoá, trích thông tin chuyến bay bằng biểu thức chính quy,
rồi trả lời từ dữ liệu thật trong database (chuyến bay, hạng vé, dịch vụ, khuyến mãi, đặt chỗ).
Phần phân tích câu là hàm thuần (không cần DB) để kiểm thử độc lập."""
import datetime as dt
import re
import unicodedata

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from .auth import optional_user
from .db import get_db

router = APIRouter(prefix="/api", tags=["chatbot"])

# Tên gọi thường dùng -> mã sân bay (bổ sung cho tên thành phố trong bảng airports)
ALIASES = {
    "HAN": ["ha noi", "hn", "noi bai", "thu do"],
    "SGN": ["ho chi minh", "tp hcm", "tphcm", "hcm", "sai gon", "saigon", "tan son nhat", "sg"],
    "DAD": ["da nang"], "CXR": ["nha trang", "cam ranh"], "PQC": ["phu quoc"], "HPH": ["hai phong"],
    "VII": ["vinh", "nghe an"], "HUI": ["hue"], "DLI": ["da lat"], "VCA": ["can tho"],
    "BKK": ["bangkok", "thai lan"], "SIN": ["singapore"], "ICN": ["seoul", "han quoc", "incheon"],
    "NRT": ["tokyo", "nhat ban", "narita"],
}
WEEKDAYS = {"2": 0, "hai": 0, "3": 1, "ba": 1, "4": 2, "tu": 2, "5": 3, "nam": 3, "6": 4, "sau": 4, "7": 5, "bay": 5}
SLOTS = {"sang": (5, 12), "trua": (11, 14), "chieu": (12, 18), "toi": (18, 24), "dem": (21, 24)}
SUGGESTIONS = ["Tìm chuyến Hà Nội đi Đà Nẵng sáng thứ 7 tuần sau dưới 1 triệu", "Hành lý ký gửi bao nhiêu kg?",
               "Chính sách hoàn huỷ vé", "Có mã khuyến mãi nào không?"]


def normalize(text: str) -> str:
    """'Hà Nội đi Đà Nẵng' -> 'ha noi di da nang'."""
    text = unicodedata.normalize("NFD", text.replace("đ", "d").replace("Đ", "D"))
    text = "".join(c for c in text if unicodedata.category(c) != "Mn").lower()
    return re.sub(r"\s+", " ", re.sub(r"[^\w/.,<-]", " ", text)).strip()


def find_cities(text: str, aliases: dict[str, list[str]], original: str = "") -> tuple[str | None, str | None]:
    """Trả (điểm đi, điểm đến). Ưu tiên cấu trúc 'từ X'/'đến Y'; không có thì lấy theo thứ tự xuất hiện."""
    hits = []
    for code, names in aliases.items():
        for name in names:
            for m in re.finditer(rf"\b{re.escape(name)}\b", text):
                hits.append((m.start(), m.end(), code))
    for m in re.finditer(r"\b([A-Z]{3})\b", original):  # mã IATA viết hoa: HAN, SGN...
        if m.group(1) in aliases:  # vị trí trong câu gốc ~ vị trí trong câu đã bỏ dấu (bỏ dấu không đổi số ký tự)
            hits.append((m.start(), m.end(), m.group(1)))
    hits.sort(key=lambda h: (h[0], -(h[1] - h[0])))
    picked, last_end = [], -1
    for start, end, code in hits:  # bỏ trùng lặp: "ha noi" và "noi bai" chồng lên nhau
        if start >= last_end and (not picked or picked[-1][2] != code):
            picked.append((start, end, code))
            last_end = end
    if not picked:
        return None, None
    origin = dest = None
    for start, _, code in picked:
        before = text[max(0, start - 12):start]
        if re.search(r"\b(tu|xuat phat)\s*$", before):
            origin = code
        elif re.search(r"\b(den|sang|ra|vao)\s*$", before):  # không dùng "ve"/"toi": trùng "vé"/"tối"
            dest = code
    rest = [c for _, _, c in picked if c not in (origin, dest)]
    origin = origin or (rest.pop(0) if rest else None)
    dest = dest or (rest.pop(0) if rest else None)
    return origin, dest


def parse_date(text: str, today: dt.date) -> dt.date | None:
    if re.search(r"\bhom nay\b", text):
        return today
    if re.search(r"\b(ngay kia|ngay mot)\b", text):
        return today + dt.timedelta(days=2)
    if re.search(r"\b(ngay mai|mai)\b", text):
        return today + dt.timedelta(days=1)
    m = re.search(r"\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b", text)
    if m:
        day, month = int(m.group(1)), int(m.group(2))
        year = int(m.group(3)) if m.group(3) else today.year
        year += 2000 if year < 100 else 0
        try:
            d = dt.date(year, month, day)
        except ValueError:
            return None
        return d if m.group(3) or d >= today else d.replace(year=year + 1)
    m = re.search(r"\b(thu (2|3|4|5|6|7|hai|ba|tu|nam|sau|bay)|chu nhat|cn)\b(\s*(tuan sau|tuan toi))?", text)
    if m:
        weekday = 6 if m.group(1) in ("chu nhat", "cn") else WEEKDAYS[m.group(2)]
        if m.group(3):  # "thứ 7 tuần sau" = thứ 7 của tuần lịch kế tiếp
            return today - dt.timedelta(days=today.weekday()) + dt.timedelta(days=7 + weekday)
        return today + dt.timedelta(days=(weekday - today.weekday()) % 7)
    return None


def parse_max_price(text: str) -> int | None:
    m = re.search(r"(duoi|toi da|khong qua|re hon|it hon|<)\s*([\d.,]+)\s*(trieu|tr|k|nghin|ngan|d|dong|vnd)?\b", text)
    if not m:
        return None
    num, unit = m.group(2).rstrip(".,"), m.group(3)
    if unit in ("trieu", "tr"):
        return int(float(num.replace(",", ".")) * 1_000_000)
    if unit in ("k", "nghin", "ngan"):
        return int(float(num.replace(",", ".")) * 1_000)
    value = int(re.sub(r"[.,]", "", num))
    return value * 1_000_000 if value < 100 else value  # "dưới 2" -> hiểu là 2 triệu


def parse_slot(message: str) -> tuple[int, int] | None:
    """Xét câu gốc còn dấu trước ("tối" khác "tôi", "sáng" khác "sang"); câu gõ không dấu chỉ nhận từ không nhập nhằng."""
    low = message.lower()
    for word, key in (("sáng", "sang"), ("trưa", "trua"), ("chiều", "chieu"), ("tối", "toi"), ("đêm", "dem")):
        if re.search(rf"\b{word}\b", low):
            return SLOTS[key]
    text = normalize(message)
    for key in ("trua", "chieu", "dem"):
        if re.search(rf"\b{key}\b", text):
            return SLOTS[key]
    if re.search(r"\bbuoi toi\b", text):
        return SLOTS["toi"]
    if re.search(r"\bsang\b", text) and not re.search(r"\b(di|bay|qua)\s+sang\b", text):
        return SLOTS["sang"]
    return None


def parse_search(message: str, today: dt.date, aliases: dict[str, list[str]]) -> dict:
    text = normalize(message)
    origin, dest = find_cities(text, aliases, message)
    pax = re.search(r"\b(\d)\s*(nguoi|khach|ve|ghe)\b", text)
    cabin = "BUSINESS" if re.search(r"\b(thuong gia|business)\b", text) else \
        "ECONOMY" if re.search(r"\bpho thong\b", text) else None
    return {"origin": origin, "destination": dest, "date": parse_date(text, today), "max_price": parse_max_price(text),
            "slot": parse_slot(message), "passengers": int(pax.group(1)) if pax else 1, "cabin": cabin,
            "cheapest": bool(re.search(r"\b(re nhat|gia thap|tiet kiem)\b", text))}


INTENTS = [  # (ý định, từ khoá trên câu đã bỏ dấu) — xét theo thứ tự
    ("baggage", r"\b(hanh ly|ky gui|xach tay|kg|vali)\b"),
    ("refund", r"\b(hoan tien|hoan ve|hoan huy|huy ve|huy dat|huy booking|huy chuyen)\b"),
    ("change", r"\b(doi chuyen|doi ve|doi ngay|doi gio|doi lich)\b"),
    ("checkin", r"\b(check ?in|lam thu tuc|the len may bay|boarding)\b"),
    ("seat", r"\b(chon ghe|ghe ngoi|cho ngoi|phi ghe)\b"),
    ("promo", r"\b(khuyen mai|giam gia|voucher|ma giam|uu dai)\b"),
    ("extras", r"\b(sim|bao hiem|suat an|do an|an uong|bua an)\b"),
    ("payment", r"\b(thanh toan|tra tien|vnpay|momo|zalopay|the tin dung)\b"),
    ("kids", r"\b(tre em|em be|tre so sinh|con nho)\b"),
    ("greet", r"^(xin chao|chao|hello|hi|alo)\b"),
]


def detect_intent(message: str) -> str | None:
    if re.search(r"\b(hoàn|huỷ|hủy)\b", message.lower()):  # "hoàn" khác "hoãn" — chỉ phân biệt được khi còn dấu
        return "refund"
    text = normalize(message)
    return next((name for name, pattern in INTENTS if re.search(pattern, text)), None)


def money(v) -> str:
    return f"{v:,.0f}đ".replace(",", ".")


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=500)


@router.post("/chat")
def chat(body: ChatIn, user=Depends(optional_user), db=Depends(get_db)):
    msg = body.message.strip()
    text = normalize(msg)
    today = dt.datetime.now(dt.timezone(dt.timedelta(hours=7))).date()

    # 1. Mã đặt chỗ (6 ký tự) / số hiệu chuyến bay viết hoa trong câu
    pnr = re.search(r"\b([A-HJ-NP-Z2-9]{6})\b", msg)
    asks_booking = re.search(r"\b(ma dat cho|pnr|booking|dat cho)\b", text)
    if pnr and re.search(r"\d", pnr.group(1)) and (asks_booking or len(text) < 12):
        b = db.execute("SELECT pnr, status, user_id, total_amount FROM bookings WHERE pnr = %s", (pnr.group(1),)).fetchone()
        if b and user and (b["user_id"] == user["id"] or user["role"] != "PASSENGER"):
            status = {"PENDING": "chờ thanh toán", "CONFIRMED": "đã xác nhận", "CANCELLED": "đã huỷ", "EXPIRED": "hết hạn"}
            return {"reply": f"Đặt chỗ {b['pnr']} đang ở trạng thái {status[b['status']]}, tổng tiền {money(b['total_amount'])}.",
                    "link": {"label": "Xem chi tiết đặt chỗ", "url": f"/bookings/{b['pnr']}"}}
        if b or asks_booking:  # không có booking thì có thể là số hiệu chuyến bay (QH1021) -> xét tiếp bên dưới
            return {"reply": "Để bảo mật, bạn vui lòng tra cứu đặt chỗ tại mục Quản lý đặt chỗ bằng mã đặt chỗ và "
                             "họ của hành khách.", "link": {"label": "Quản lý đặt chỗ", "url": "/?tab=manage"}}
    flight_no = re.search(r"\b([A-Z][A-Z0-9])\s?(\d{2,4})\b", msg)
    if flight_no and not re.search(r"\b(tu|di|den)\b", text):
        f = db.execute("""
            SELECT flight_number, origin, destination, departure_time, estimated_departure, status FROM flights
            WHERE flight_number = %s AND coalesce(estimated_departure, departure_time) > now() - interval '3 hours'
            ORDER BY departure_time LIMIT 1""", (flight_no.group(1) + flight_no.group(2),)).fetchone()
        if f:
            status = {"SCHEDULED": "theo lịch", "ON_TIME": "đúng giờ", "DELAYED": "bị hoãn", "BOARDING": "đang lên máy bay",
                      "DEPARTED": "đã cất cánh", "ARRIVED": "đã hạ cánh", "CANCELLED": "đã bị huỷ"}[f["status"]]
            when = (f["estimated_departure"] or f["departure_time"]).astimezone(dt.timezone(dt.timedelta(hours=7)))
            return {"reply": f"Chuyến {f['flight_number']} {f['origin']} → {f['destination']} khởi hành "
                             f"{when:%H:%M ngày %d/%m}, hiện {status}.",
                    "link": {"label": "Bảng trạng thái chuyến bay", "url": "/status"}}

    # 2. Tìm chuyến bay bằng ngôn ngữ tự nhiên
    aliases = {code: list(names) for code, names in ALIASES.items()}
    for a in db.execute("SELECT iata_code, city FROM airports WHERE city IS NOT NULL").fetchall():
        aliases.setdefault(a["iata_code"], []).append(normalize(a["city"]))
    q = parse_search(msg, today, aliases)
    intent = detect_intent(msg)
    if q["origin"] and q["destination"] and intent not in ("baggage", "refund", "change", "checkin"):
        return search_reply(db, q, today)
    if (q["origin"] or q["destination"]) and re.search(r"\b(chuyen|ve may bay|bay|tim|di)\b", text):
        missing = "điểm đi" if not q["origin"] else "điểm đến"
        return {"reply": f"Bạn muốn bay {('từ đâu' if missing == 'điểm đi' else 'đến đâu')}? Hãy nói đủ cả điểm đi và "
                         f"điểm đến, ví dụ: \"Hà Nội đi Đà Nẵng ngày mai\".", "suggestions": SUGGESTIONS[:1]}

    # 3. Hỏi đáp chính sách — trả lời từ dữ liệu thật
    if intent == "baggage":
        fares = db.execute("SELECT name, checked_baggage_kg, carry_on_kg FROM fare_classes ORDER BY checked_baggage_kg").fetchall()
        bags = db.execute("SELECT name, price FROM ancillary_products WHERE category = 'BAGGAGE' AND is_active ORDER BY price").fetchall()
        lines = [f"• {f['name']}: xách tay {f['carry_on_kg']}kg, ký gửi " +
                 (f"{f['checked_baggage_kg']}kg" if f["checked_baggage_kg"] else "không bao gồm") for f in fares]
        lines += ["Mua thêm hành lý ký gửi khi đặt vé (rẻ hơn tại sân bay):"] + [f"• {b['name']}: {money(b['price'])}/chặng" for b in bags]
        return {"reply": "Hành lý theo hạng vé:\n" + "\n".join(lines)}
    if intent in ("refund", "change"):
        fares = db.execute("SELECT name, change_fee, refund_fee FROM fare_classes ORDER BY name").fetchall()
        lines = [f"• {f['name']}: đổi " + ("không được" if f["change_fee"] is None else
                 ("miễn phí" if not f["change_fee"] else f"phí {money(f['change_fee'])}")) +
                 " (+ chênh lệch giá); hoàn " + ("không được" if f["refund_fee"] is None else
                 ("miễn phí" if not f["refund_fee"] else f"phí {money(f['refund_fee'])}/vé")) for f in fares]
        return {"reply": "Chính sách đổi / hoàn vé:\n" + "\n".join(lines) +
                "\nNếu hãng huỷ chuyến, bạn được hoàn 100% hoặc đổi chuyến miễn phí. Thao tác tại mục Quản lý đặt chỗ.",
                "link": {"label": "Quản lý đặt chỗ", "url": "/?tab=manage"}}
    if intent == "checkin":
        return {"reply": "Check-in trực tuyến mở từ 24 giờ đến 1 giờ trước giờ khởi hành. Nhập mã đặt chỗ và họ tại mục "
                         "Làm thủ tục; nếu chưa chọn ghế, hệ thống tự xếp ghế miễn phí. Sau khi check-in bạn nhận thẻ lên "
                         "máy bay có mã QR.", "link": {"label": "Làm thủ tục", "url": "/?tab=checkin"}}
    if intent == "seat":
        fees = db.execute("SELECT DISTINCT seat_fee FROM seats WHERE cabin_class = 'ECONOMY' ORDER BY seat_fee").fetchall()
        return {"reply": "Phí chọn trước ghế phổ thông từ " + " đến ".join(money(f["seat_fee"]) for f in fees[::max(1, len(fees) - 1)]) +
                         " tuỳ khu (hàng đầu, cửa thoát hiểm rộng chân, khu sau). Hạng thương gia chọn ghế miễn phí. "
                         "Không chọn trước thì ghế được xếp miễn phí khi check-in."}
    if intent == "promo":
        vs = db.execute("""SELECT code, description FROM vouchers WHERE is_public AND now() BETWEEN valid_from AND valid_to
                           AND used_count < usage_limit ORDER BY valid_to""").fetchall()
        if not vs:
            return {"reply": "Hiện chưa có chương trình khuyến mãi, bạn quay lại sau nhé!"}
        return {"reply": "Mã khuyến mãi đang có (nhập ở bước thanh toán):\n" +
                         "\n".join(f"• {v['code']}: {v['description']}" for v in vs)}
    if intent == "extras":
        items = db.execute("""SELECT name, price, per_segment, international_only FROM ancillary_products
                              WHERE is_active AND category <> 'BAGGAGE' ORDER BY category, price""").fetchall()
        return {"reply": "Dịch vụ bổ trợ mua kèm khi đặt vé:\n" + "\n".join(
            f"• {i['name']}: {money(i['price'])}{'/chặng' if i['per_segment'] else '/khách'}"
            f"{' (chỉ chặng quốc tế)' if i['international_only'] else ''}" for i in items)}
    if intent == "payment":
        return {"reply": "Bạn có thể thanh toán qua VNPAY, ví MoMo, ZaloPay hoặc thẻ quốc tế. Đặt chỗ được giữ 15 phút "
                         "để thanh toán; quá hạn hệ thống tự huỷ và trả ghế."}
    if intent == "kids":
        return {"reply": "Giá vé trẻ em (2–11 tuổi) bằng 90% giá người lớn, có ghế riêng. Em bé dưới 2 tuổi trả 10% giá vé, "
                         "ngồi cùng người lớn; mỗi người lớn đi kèm tối đa 1 em bé."}
    if intent == "greet":
        return {"reply": "Xin chào! Mình là trợ lý ảo SkyBooking. Mình có thể tìm chuyến bay, giải đáp hành lý, hoàn đổi vé, "
                         "khuyến mãi, check-in... Bạn cần gì nào?", "suggestions": SUGGESTIONS}
    return {"reply": "Xin lỗi, mình chưa hiểu câu hỏi. Bạn thử hỏi theo các gợi ý dưới đây nhé.", "suggestions": SUGGESTIONS}


def search_reply(db, q: dict, today: dt.date) -> dict:
    date_from = q["date"] or today
    date_to = q["date"] or today + dt.timedelta(days=6)
    hours = q["slot"] or (0, 24)
    rows = db.execute("""
        SELECT flight_id, flight_number, airline_name, origin, destination, origin_city, destination_city,
               departure_time, arrival_time,
               fare_class, fare_name, cabin_class, price
        FROM v_flight_search f
        WHERE origin = %s AND destination = %s
          AND (departure_time AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN %s AND %s
          AND extract(hour FROM departure_time AT TIME ZONE 'Asia/Ho_Chi_Minh') >= %s
          AND extract(hour FROM departure_time AT TIME ZONE 'Asia/Ho_Chi_Minh') < %s
          AND departure_time > now() AND status <> 'CANCELLED' AND seats_available >= %s
          AND (%s::numeric IS NULL OR price <= %s) AND (%s::text IS NULL OR cabin_class = %s)
        ORDER BY """ + ("price, departure_time" if q["cheapest"] or not q["date"] else "departure_time, price") + " LIMIT 5",
        (q["origin"], q["destination"], date_from, date_to, hours[0], hours[1], q["passengers"],
         q["max_price"], q["max_price"], q["cabin"], q["cabin"])).fetchall()
    when = f"ngày {q['date']:%d/%m}" if q["date"] else "7 ngày tới"
    conditions = [when] + ([f"dưới {money(q['max_price'])}"] if q["max_price"] else []) + \
                 ([f"khung {q['slot'][0]}h–{q['slot'][1]}h"] if q["slot"] else [])
    search_url = f"/search?origin={q['origin']}&destination={q['destination']}&date={date_from}&adults={q['passengers']}"
    if not rows:
        return {"reply": f"Không tìm thấy chuyến {q['origin']} → {q['destination']} ({', '.join(conditions)}). "
                         "Bạn thử đổi ngày hoặc tăng mức giá nhé.", "link": {"label": "Xem lịch bay", "url": search_url}}
    return {"reply": f"Mình tìm được các chuyến {rows[0]['origin_city']} → {rows[0]['destination_city']} "
                     f"({', '.join(conditions)}):",
            "flights": rows, "link": {"label": "Xem tất cả & đặt vé", "url": search_url}}
