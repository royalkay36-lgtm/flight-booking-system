"""Tính tiền cho đặt chỗ: dùng chung cho xem trước (quote), tạo booking, huỷ và đổi vé,
để mọi con số do backend quyết định, frontend chỉ hiển thị."""
import datetime as dt
from decimal import Decimal
from typing import Literal

from fastapi import HTTPException
from pydantic import BaseModel, Field

VND = Decimal(1)
PAX_FACTOR = {"ADULT": Decimal("1"), "CHILD": Decimal("0.9"), "INFANT": Decimal("0.1")}  # % giá vé người lớn
PAX_LABEL = {"ADULT": "người lớn", "CHILD": "trẻ em", "INFANT": "em bé"}
LOCAL_TZ = dt.timezone(dt.timedelta(hours=7))


class SegmentIn(BaseModel):
    flight_id: int
    fare_class: str


class AncillaryIn(BaseModel):
    code: str
    segment: int | None = None  # chỉ số chặng (0, 1) với dịch vụ theo chặng; None với dịch vụ cả hành trình


class PassengerIn(BaseModel):
    full_name: str = Field(min_length=1, max_length=100)
    gender: Literal["M", "F", "X"] | None = None
    date_of_birth: dt.date
    passenger_type: Literal["ADULT", "CHILD", "INFANT"] = "ADULT"
    id_number: str | None = Field(None, max_length=20)
    nationality: str | None = Field(None, pattern="^[A-Z]{2}$")
    seat_ids: list[int | None]  # flight_seat_id cho từng chặng; None = để hệ thống xếp khi check-in
    ancillaries: list[AncillaryIn] = []


class QuoteIn(BaseModel):
    flights: list[SegmentIn] = Field(min_length=1, max_length=2)  # 1 = một chiều, 2 = khứ hồi
    passengers: list[PassengerIn] = Field(min_length=1, max_length=9)
    voucher_code: str | None = None


class BookingIn(QuoteIn):
    contact_email: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    contact_phone: str = Field(min_length=8, max_length=20)


def vnd(x) -> Decimal:
    return Decimal(x).quantize(VND)


def age_on(born: dt.date, day: dt.date) -> int:
    return day.year - born.year - ((day.month, day.day) < (born.month, born.day))


def expected_type(born: dt.date, day: dt.date) -> str:
    age = age_on(born, day)
    return "INFANT" if age < 2 else "CHILD" if age < 12 else "ADULT"


def voucher_discount(db, code: str | None, subtotal: Decimal) -> tuple[str | None, Decimal]:
    if not code:
        return None, Decimal(0)
    v = db.execute("""
        SELECT * FROM vouchers
        WHERE code = %s AND now() BETWEEN valid_from AND valid_to AND used_count < usage_limit""",
        (code.strip().upper(),)).fetchone()
    if v is None:
        raise HTTPException(400, "Mã giảm giá không tồn tại, đã hết hạn hoặc hết lượt dùng")
    if subtotal < v["min_amount"]:
        raise HTTPException(400, f"Mã {v['code']} áp dụng cho đơn từ {v['min_amount']:,.0f}đ".replace(",", "."))
    if v["discount_type"] == "PERCENT":
        discount = subtotal * v["discount_value"] / 100
        if v["max_discount"] is not None:
            discount = min(discount, v["max_discount"])
    else:
        discount = v["discount_value"]
    return v["code"], vnd(min(discount, subtotal))


def quote(db, body: QuoteIn) -> dict:
    """Kiểm tra toàn bộ lựa chọn và trả về bảng giá chi tiết + dữ liệu để ghi vé / dịch vụ."""
    n_seg = len(body.flights)
    segments = []
    for s in body.flights:
        row = db.execute("""
            SELECT f.id, f.flight_number, f.departure_time, ff.price, fc.name AS fare_name, fc.cabin_class,
                   (o.country <> 'Vietnam' OR d.country <> 'Vietnam') AS international
            FROM flights f
            JOIN flight_fares ff ON ff.flight_id = f.id AND ff.fare_class = %s
            JOIN fare_classes fc ON fc.code = ff.fare_class
            JOIN airports o ON o.iata_code = f.origin
            JOIN airports d ON d.iata_code = f.destination
            WHERE f.id = %s AND f.departure_time > now() AND f.status <> 'CANCELLED'""",
            (s.fare_class, s.flight_id)).fetchone()
        if row is None:
            raise HTTPException(400, "Chuyến bay hoặc hạng vé không còn mở bán")
        segments.append(row | {"fare_class": s.fare_class})

    first_day = segments[0]["departure_time"].astimezone(LOCAL_TZ).date()
    types = [p.passenger_type for p in body.passengers]
    if "ADULT" not in types:
        raise HTTPException(422, "Mỗi đặt chỗ cần ít nhất một người lớn")
    if types.count("INFANT") > types.count("ADULT"):
        raise HTTPException(422, "Mỗi người lớn chỉ được đi kèm một em bé")

    products = {p["code"]: p for p in db.execute("SELECT * FROM ancillary_products WHERE is_active").fetchall()}
    seat_ids = [sid for p in body.passengers for sid in p.seat_ids if sid is not None]
    seats = {s["flight_seat_id"]: s for s in db.execute(
        "SELECT flight_seat_id, flight_id, seat_code, cabin_class, seat_fee FROM v_seat_map WHERE flight_seat_id = ANY(%s)",
        (seat_ids,)).fetchall()}
    if len(set(seat_ids)) != len(seat_ids):
        raise HTTPException(422, "Hai hành khách không thể ngồi cùng một ghế")

    tickets, ancillaries = [], []
    fare_total, seat_total, extra_lines = Decimal(0), Decimal(0), {}
    for p in body.passengers:
        if p.date_of_birth > dt.date.today():
            raise HTTPException(422, f"{p.full_name}: ngày sinh không hợp lệ")
        if expected_type(p.date_of_birth, first_day) != p.passenger_type:
            raise HTTPException(422, f"{p.full_name}: theo ngày sinh là {PAX_LABEL[expected_type(p.date_of_birth, first_day)]}, "
                                     f"vui lòng chọn đúng loại hành khách")
        if len(p.seat_ids) != n_seg:
            raise HTTPException(422, "Mỗi hành khách cần một lựa chọn ghế cho từng chặng")
        pax_tickets = []
        for seg, sid in zip(segments, p.seat_ids):
            fee = Decimal(0)
            if sid is not None:
                seat = seats.get(sid)
                if p.passenger_type == "INFANT":
                    raise HTTPException(422, "Em bé ngồi cùng người lớn, không chọn ghế riêng")
                if seat is None or seat["flight_id"] != seg["id"] or seat["cabin_class"] != seg["cabin_class"]:
                    raise HTTPException(422, "Ghế không thuộc chuyến bay hoặc khoang của hạng vé đã chọn")
                fee = seat["seat_fee"]
            price = vnd(seg["price"] * PAX_FACTOR[p.passenger_type])
            pax_tickets.append({"flight_id": seg["id"], "fare_class": seg["fare_class"], "seat_id": sid,
                                "price": price, "seat_fee": fee})
            fare_total += price
            seat_total += fee
        tickets.append(pax_tickets)

        pax_extras, used = [], set()
        for a in p.ancillaries:
            prod = products.get(a.code)
            if prod is None:
                raise HTTPException(422, f"Dịch vụ {a.code} không tồn tại")
            if prod["per_segment"] != (a.segment is not None) or (a.segment is not None and not 0 <= a.segment < n_seg):
                raise HTTPException(422, f"{prod['name']}: chặng bay không hợp lệ")
            if prod["international_only"] and not any(s["international"] for s in segments):
                raise HTTPException(422, f"{prod['name']} chỉ bán cho hành trình quốc tế")
            key = (prod["category"], a.segment)
            if key in used:
                raise HTTPException(422, f"{p.full_name}: mỗi loại dịch vụ chỉ chọn một gói cho mỗi chặng")
            used.add(key)
            flight_id = segments[a.segment]["id"] if a.segment is not None else None
            pax_extras.append({"code": prod["code"], "flight_id": flight_id, "price": prod["price"]})
            extra_lines[prod["name"]] = extra_lines.get(prod["name"], Decimal(0)) + prod["price"]
        ancillaries.append(pax_extras)

    lines = []
    for i, seg in enumerate(segments):
        for t in ("ADULT", "CHILD", "INFANT"):
            n = types.count(t)
            if n:
                lines.append({"label": f"{seg['flight_number']} · {seg['fare_name']} · {n} {PAX_LABEL[t]}",
                              "amount": vnd(seg["price"] * PAX_FACTOR[t]) * n})
    if seat_total:
        lines.append({"label": "Phí chọn ghế", "amount": seat_total})
    lines += [{"label": name, "amount": amount} for name, amount in extra_lines.items()]
    subtotal = fare_total + seat_total + sum(extra_lines.values(), Decimal(0))
    code, discount = voucher_discount(db, body.voucher_code, subtotal)
    if discount:
        lines.append({"label": f"Mã giảm giá {code}", "amount": -discount})
    return {"lines": lines, "subtotal": subtotal, "voucher_code": code, "discount": discount,
            "total": subtotal - discount, "tickets": tickets, "ancillaries": ancillaries}


def refund_quote(db, booking_id: int) -> dict:
    """Số tiền được hoàn khi huỷ booking đã xác nhận, theo chính sách hạng vé.
    Chuyến bị hãng huỷ: hoàn toàn bộ vé, phí ghế và dịch vụ của chặng đó."""
    tickets = db.execute("""
        SELECT t.id, t.price, t.seat_fee, t.status, t.flight_id, fc.refund_fee, fc.name AS fare_name,
               f.status AS flight_status, f.departure_time, f.flight_number
        FROM tickets t JOIN passengers p ON p.id = t.passenger_id
        JOIN fare_classes fc ON fc.code = t.fare_class
        JOIN flights f ON f.id = t.flight_id
        WHERE p.booking_id = %s AND t.status <> 'CANCELLED'""", (booking_id,)).fetchall()
    if any(t["status"] in ("CHECKED_IN", "BOARDED") for t in tickets):
        raise HTTPException(409, "Booking đã có hành khách làm thủ tục, không thể huỷ trực tuyến")
    if any(t["flight_status"] != "CANCELLED" and t["departure_time"] <= dt.datetime.now(dt.timezone.utc) for t in tickets):
        raise HTTPException(409, "Có chặng bay đã khởi hành, không thể huỷ trực tuyến")

    cancelled = {t["flight_id"] for t in tickets if t["flight_status"] == "CANCELLED"}
    amount, notes = Decimal(0), []
    for t in tickets:
        if t["flight_id"] in cancelled:
            amount += t["price"] + t["seat_fee"]
        elif t["refund_fee"] is not None:
            amount += max(Decimal(0), t["price"] - t["refund_fee"])
    for f in {(t["flight_number"], t["fare_name"], t["refund_fee"], t["flight_id"] in cancelled) for t in tickets}:
        number, fare, fee, by_airline = f
        notes.append(f"{number}: hãng huỷ chuyến, hoàn 100% vé, phí ghế và dịch vụ" if by_airline
                     else f"{number} ({fare}): không được hoàn tiền vé" if fee is None
                     else f"{number} ({fare}): hoàn tiền vé trừ phí {fee:,.0f}đ/vé".replace(",", "."))
    extras = db.execute("""
        SELECT ba.flight_id, ba.price FROM booking_ancillaries ba WHERE ba.booking_id = %s""", (booking_id,)).fetchall()
    all_cancelled = bool(tickets) and cancelled == {t["flight_id"] for t in tickets}
    amount += sum((e["price"] for e in extras if e["flight_id"] in cancelled or (e["flight_id"] is None and all_cancelled)),
                  Decimal(0))
    if not cancelled:
        notes.append("Phí chọn ghế và dịch vụ bổ trợ không được hoàn")
    paid = db.execute("""
        SELECT coalesce(sum(amount) FILTER (WHERE status = 'SUCCESS'), 0)
             - coalesce(sum(amount) FILTER (WHERE status = 'REFUNDED'), 0) AS net
        FROM payments WHERE booking_id = %s""", (booking_id,)).fetchone()["net"]
    return {"amount": vnd(min(amount, paid)), "notes": sorted(notes)}


def change_quote(db, booking_id: int, old_flight_id: int, new_flight_id: int) -> dict:
    """Phí đổi sang chuyến khác cùng chặng: phí đổi theo hạng vé + chênh lệch giá (nếu chuyến mới đắt hơn).
    Chuyến cũ bị hãng huỷ thì đổi miễn phí."""
    tickets = db.execute("""
        SELECT t.id, t.passenger_id, t.price, t.status, t.fare_class, t.flight_seat_id, p.passenger_type,
               fc.change_fee, f.status AS flight_status, f.departure_time, f.origin, f.destination
        FROM tickets t JOIN passengers p ON p.id = t.passenger_id
        JOIN fare_classes fc ON fc.code = t.fare_class
        JOIN flights f ON f.id = t.flight_id
        WHERE p.booking_id = %s AND t.flight_id = %s AND t.status <> 'CANCELLED'""",
        (booking_id, old_flight_id)).fetchall()
    if not tickets:
        raise HTTPException(404, "Booking không có vé trên chặng này")
    old = tickets[0]
    if any(t["status"] != "ISSUED" for t in tickets):
        raise HTTPException(409, "Chỉ đổi được vé đã xuất và chưa làm thủ tục")
    by_airline = old["flight_status"] == "CANCELLED"
    if not by_airline and old["departure_time"] <= dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=3):
        raise HTTPException(409, "Chỉ đổi chuyến trước giờ khởi hành ít nhất 3 tiếng")
    if not by_airline and old["change_fee"] is None:
        raise HTTPException(409, "Hạng vé của bạn không cho phép đổi chuyến")

    new = db.execute("""
        SELECT f.id, f.flight_number, f.departure_time, f.origin, f.destination, ff.price
        FROM flights f JOIN flight_fares ff ON ff.flight_id = f.id AND ff.fare_class = %s
        WHERE f.id = %s AND f.status <> 'CANCELLED' AND f.departure_time > now() + interval '3 hours'""",
        (old["fare_class"], new_flight_id)).fetchone()
    if new is None or (new["origin"], new["destination"]) != (old["origin"], old["destination"]) or new_flight_id == old_flight_id:
        raise HTTPException(400, "Chuyến bay mới không hợp lệ (phải cùng chặng, cùng hạng vé, còn mở bán)")

    items, fee_total, diff_total = [], Decimal(0), Decimal(0)
    for t in tickets:
        new_price = vnd(new["price"] * PAX_FACTOR[t["passenger_type"]])
        fee = Decimal(0) if by_airline else t["change_fee"]
        diff = Decimal(0) if by_airline else max(Decimal(0), new_price - t["price"])
        items.append({"ticket": t, "new_price": max(new_price, t["price"])})
        fee_total += fee
        diff_total += diff
    return {"new_flight": new, "items": items, "change_fee": fee_total, "fare_difference": diff_total,
            "total": fee_total + diff_total, "free": by_airline}
