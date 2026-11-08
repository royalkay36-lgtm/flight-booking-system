import unicodedata
import uuid
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel

from ..auth import current_user, optional_user
from ..db import get_db
from ..mailer import notify_booking
from ..pricing import BookingIn, QuoteIn, change_quote, quote, refund_quote

router = APIRouter(prefix="/api", tags=["bookings"])

HOLD_MINUTES = 15  # thời gian giữ ghế / hạn thanh toán của booking
Method = Literal["VNPAY", "MOMO", "ZALOPAY", "CARD"]


class PayIn(BaseModel):
    method: Method


class ChangeIn(BaseModel):
    old_flight_id: int
    new_flight_id: int
    confirm: bool = False  # false: chỉ báo phí; true: đổi và thanh toán phí (mô phỏng)
    method: Method = "VNPAY"


def mock_txn(prefix="MOCK"):
    return f"{prefix}-{uuid.uuid4().hex[:12].upper()}"


def plain(s: str) -> str:
    """'Nguyễn Văn Ân' -> 'NGUYEN VAN AN' để so họ tên không phân biệt dấu."""
    s = unicodedata.normalize("NFD", s.replace("đ", "d").replace("Đ", "D"))
    return "".join(c for c in s if unicodedata.category(c) != "Mn").upper().strip()


def load_booking(db, pnr: str, user, last_name: str | None, for_update=False):
    """Quyền xem / thao tác booking: chủ booking, nhân viên / admin, hoặc khách nhập đúng PNR + họ (như các hãng bay)."""
    booking = db.execute("SELECT * FROM bookings WHERE pnr = %s" + (" FOR UPDATE" if for_update else ""),
                         (pnr.upper().strip(),)).fetchone()
    if booking is not None:
        if user and (user["role"] != "PASSENGER" or booking["user_id"] == user["id"]):
            return booking
        if last_name and plain(last_name):
            names = db.execute("SELECT full_name FROM passengers WHERE booking_id = %s", (booking["id"],)).fetchall()
            words = plain(last_name).split()
            if any(n == words or n[:len(words)] == words or n[-len(words):] == words
                   for n in (plain(r["full_name"]).split() for r in names)):
                return booking
    raise HTTPException(404, "Không tìm thấy đặt chỗ. Kiểm tra lại mã đặt chỗ và họ của hành khách")


@router.post("/bookings/quote")
def booking_quote(body: QuoteIn, db=Depends(get_db)):
    q = quote(db, body)
    return {k: q[k] for k in ("lines", "subtotal", "voucher_code", "discount", "total")}


@router.post("/bookings", status_code=201)
def create_booking(body: BookingIn, user=Depends(current_user), db=Depends(get_db)):
    with db.transaction():
        q = quote(db, body)
        if q["voucher_code"] and db.execute("""
                UPDATE vouchers SET used_count = used_count + 1
                WHERE code = %s AND used_count < usage_limit RETURNING code""", (q["voucher_code"],)).fetchone() is None:
            raise HTTPException(409, "Mã giảm giá vừa hết lượt dùng")
        booking = db.execute("""
            INSERT INTO bookings (user_id, contact_email, contact_phone, total_amount, voucher_code, discount_amount, expires_at)
            VALUES (%s, %s, %s, %s, %s, %s, now() + make_interval(mins => %s))
            RETURNING id, pnr, status, total_amount, expires_at""",
            (user["id"], body.contact_email, body.contact_phone, q["total"], q["voucher_code"], q["discount"],
             HOLD_MINUTES)).fetchone()

        for p, tickets, extras in zip(body.passengers, q["tickets"], q["ancillaries"]):
            pax_id = db.execute("""
                INSERT INTO passengers (booking_id, full_name, gender, date_of_birth, passenger_type, id_number, nationality)
                VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id""",
                (booking["id"], plain(p.full_name), p.gender, p.date_of_birth,
                 p.passenger_type, p.id_number, p.nationality)).fetchone()["id"]
            for t in tickets:
                # Giữ lại (gia hạn) ghế cho đủ thời gian thanh toán; false = ghế đã thuộc người khác.
                if t["seat_id"] is not None and not db.execute(
                        "SELECT hold_seat(%s, %s, %s) AS ok", (t["seat_id"], user["id"], HOLD_MINUTES)).fetchone()["ok"]:
                    raise HTTPException(409, "Có ghế vừa bị người khác chọn, vui lòng chọn lại ghế")
                db.execute("""
                    INSERT INTO tickets (passenger_id, flight_id, fare_class, flight_seat_id, price, seat_fee)
                    VALUES (%s, %s, %s, %s, %s, %s)""",
                    (pax_id, t["flight_id"], t["fare_class"], t["seat_id"], t["price"], t["seat_fee"]))
            for e in extras:
                db.execute("""
                    INSERT INTO booking_ancillaries (booking_id, passenger_id, flight_id, product_code, price)
                    VALUES (%s, %s, %s, %s, %s)""", (booking["id"], pax_id, e["flight_id"], e["code"], e["price"]))
    return booking


@router.post("/bookings/{pnr}/pay")
def pay(pnr: str, body: PayIn, background: BackgroundTasks, last_name: str | None = None,
        user=Depends(optional_user), db=Depends(get_db)):
    # shortcut: cổng thanh toán MÔ PHỎNG, luôn thành công. Khi tích hợp VNPAY/MoMo sandbox: tạo URL thanh toán,
    # nhận IPN, kiểm tra chữ ký HMAC rồi chạy đúng transaction dưới đây (provider_txn_id = mã giao dịch thật).
    with db.transaction():
        booking = load_booking(db, pnr, user, last_name, for_update=True)
        if booking["status"] != "PENDING":
            raise HTTPException(409, "Đặt chỗ không ở trạng thái chờ thanh toán")
        db.execute("""
            INSERT INTO payments (booking_id, amount, method, status, provider_txn_id, paid_at)
            VALUES (%s, %s, %s, 'SUCCESS', %s, now())""",
            (booking["id"], booking["total_amount"], body.method, mock_txn()))
        # Ghế bị người khác lấy / booking hết hạn -> RAISE trong hàm -> rollback cả thanh toán (main.py trả 409).
        db.execute("SELECT confirm_booking(%s)", (booking["id"],))
    background.add_task(notify_booking, booking["pnr"], "Xác nhận đặt chỗ",
                        "Cảm ơn bạn đã đặt vé. Thanh toán thành công, vé điện tử đã được xuất.")
    return {"pnr": booking["pnr"], "status": "CONFIRMED"}


@router.get("/bookings")
def my_bookings(user=Depends(current_user), db=Depends(get_db)):
    return db.execute("""
        SELECT b.pnr, b.status, b.total_amount, b.created_at, b.expires_at,
               string_agg(DISTINCT f.flight_number || ' ' || f.origin || '→' || f.destination, ', ') AS route,
               min(f.departure_time) AS departure_time,
               count(DISTINCT p.id) AS passengers
        FROM bookings b
        JOIN passengers p ON p.booking_id = b.id
        JOIN tickets t    ON t.passenger_id = p.id
        JOIN flights f    ON f.id = t.flight_id
        WHERE b.user_id = %s
        GROUP BY b.id
        ORDER BY b.created_at DESC""", (user["id"],)).fetchall()


@router.get("/bookings/{pnr}")
def booking_detail(pnr: str, last_name: str | None = None, user=Depends(optional_user), db=Depends(get_db)):
    """Chủ booking, nhân viên / admin, hoặc khách tra cứu bằng PNR + họ."""
    b = load_booking(db, pnr, user, last_name)
    booking = {k: b[k] for k in ("id", "pnr", "user_id", "status", "total_amount", "discount_amount", "voucher_code",
                                 "contact_email", "contact_phone", "created_at", "expires_at")}
    booking["tickets"] = db.execute("""
        SELECT t.id, t.ticket_number, t.status, t.price, t.seat_fee, t.fare_class, fc.name AS fare_name, fc.cabin_class,
               fc.checked_baggage_kg, fc.carry_on_kg, fc.change_fee, fc.refund_fee, t.checked_in_at, t.boarded_at,
               p.id AS passenger_id, p.full_name, p.passenger_type, s.seat_code,
               f.id AS flight_id, f.flight_number, al.name AS airline_name, f.origin, f.destination, o.city AS origin_city,
               d.city AS destination_city, f.departure_time, f.arrival_time, f.estimated_departure,
               f.status AS flight_status
        FROM tickets t
        JOIN passengers p    ON p.id = t.passenger_id
        JOIN flights f       ON f.id = t.flight_id
        JOIN airlines al     ON al.iata_code = f.airline_code
        JOIN airports o      ON o.iata_code = f.origin
        JOIN airports d      ON d.iata_code = f.destination
        JOIN fare_classes fc ON fc.code = t.fare_class
        LEFT JOIN flight_seats fs ON fs.id = t.flight_seat_id
        LEFT JOIN seats s         ON s.id = fs.seat_id
        WHERE p.booking_id = %s
        ORDER BY t.status = 'CANCELLED', f.departure_time, p.id""", (b["id"],)).fetchall()
    booking["ancillaries"] = db.execute("""
        SELECT ba.product_code, ap.name, ap.category, ba.price, p.full_name, f.flight_number
        FROM booking_ancillaries ba
        JOIN ancillary_products ap ON ap.code = ba.product_code
        JOIN passengers p ON p.id = ba.passenger_id
        LEFT JOIN flights f ON f.id = ba.flight_id
        WHERE ba.booking_id = %s ORDER BY p.id, ap.category""", (b["id"],)).fetchall()
    booking["payments"] = db.execute(
        "SELECT method, amount, status, provider_txn_id, paid_at FROM payments WHERE booking_id = %s ORDER BY id",
        (b["id"],)).fetchall()
    if b["status"] == "CONFIRMED":
        try:
            booking["refund"] = refund_quote(db, b["id"])
        except HTTPException as e:
            booking["refund"] = {"amount": None, "notes": [e.detail]}
    return booking


@router.post("/bookings/{pnr}/cancel")
def cancel(pnr: str, background: BackgroundTasks, last_name: str | None = None,
           user=Depends(optional_user), db=Depends(get_db)):
    """Huỷ cả đặt chỗ. Đã thanh toán thì hoàn tiền theo chính sách hạng vé (về đúng phương thức đã trả)."""
    with db.transaction():
        b = load_booking(db, pnr, user, last_name, for_update=True)
        refund = 0
        if b["status"] == "PENDING":
            db.execute("""
                UPDATE flight_seats SET status = 'AVAILABLE', held_by = NULL, hold_expires_at = NULL
                WHERE status = 'HELD' AND held_by = %s AND id IN (
                    SELECT t.flight_seat_id FROM tickets t JOIN passengers p ON p.id = t.passenger_id
                    WHERE p.booking_id = %s)""", (b["user_id"], b["id"]))
            if b["voucher_code"]:  # chưa thanh toán: trả lại lượt dùng mã
                db.execute("UPDATE vouchers SET used_count = used_count - 1 WHERE code = %s", (b["voucher_code"],))
        elif b["status"] == "CONFIRMED":
            refund = refund_quote(db, b["id"])["amount"]
            db.execute("""
                UPDATE flight_seats SET status = 'AVAILABLE' WHERE status = 'BOOKED' AND id IN (
                    SELECT t.flight_seat_id FROM tickets t JOIN passengers p ON p.id = t.passenger_id
                    WHERE p.booking_id = %s AND t.status = 'ISSUED')""", (b["id"],))
            if refund > 0:
                method = db.execute("SELECT method FROM payments WHERE booking_id = %s AND status = 'SUCCESS' "
                                    "ORDER BY id LIMIT 1", (b["id"],)).fetchone()["method"]
                db.execute("""
                    INSERT INTO payments (booking_id, amount, method, status, provider_txn_id, paid_at)
                    VALUES (%s, %s, %s, 'REFUNDED', %s, now())""", (b["id"], refund, method, mock_txn("REFUND")))
        else:
            raise HTTPException(409, "Đặt chỗ đã huỷ hoặc hết hạn")
        db.execute("""
            UPDATE tickets SET status = 'CANCELLED' WHERE status IN ('PENDING', 'ISSUED')
              AND passenger_id IN (SELECT id FROM passengers WHERE booking_id = %s)""", (b["id"],))
        db.execute("UPDATE bookings SET status = 'CANCELLED', expires_at = NULL WHERE id = %s", (b["id"],))
    refund_text = f"{refund:,.0f}".replace(",", ".")
    background.add_task(notify_booking, b["pnr"], "Huỷ đặt chỗ",
                        f"Đặt chỗ đã được huỷ. Số tiền hoàn: {refund_text}đ, về phương thức thanh toán ban đầu trong 7–15 ngày.")
    return {"status": "CANCELLED", "refund": refund}


@router.post("/bookings/{pnr}/change")
def change_flight(pnr: str, body: ChangeIn, background: BackgroundTasks, last_name: str | None = None,
                  user=Depends(optional_user), db=Depends(get_db)):
    """Đổi toàn bộ hành khách của một chặng sang chuyến khác cùng chặng, cùng hạng vé.
    Ghế cũ được trả lại; ghế mới xếp tự động khi check-in. Dịch vụ theo chặng chuyển theo chuyến mới."""
    with db.transaction():
        b = load_booking(db, pnr, user, last_name, for_update=True)
        if b["status"] != "CONFIRMED":
            raise HTTPException(409, "Chỉ đổi được đặt chỗ đã thanh toán")
        q = change_quote(db, b["id"], body.old_flight_id, body.new_flight_id)
        summary = {"new_flight": q["new_flight"], "change_fee": q["change_fee"],
                   "fare_difference": q["fare_difference"], "total": q["total"], "free": q["free"]}
        if not body.confirm:
            return summary
        for item in q["items"]:
            t = item["ticket"]
            db.execute("UPDATE tickets SET status = 'CANCELLED' WHERE id = %s", (t["id"],))
            if t["flight_seat_id"]:
                db.execute("UPDATE flight_seats SET status = 'AVAILABLE' WHERE id = %s AND status = 'BOOKED'",
                           (t["flight_seat_id"],))
            db.execute("""
                INSERT INTO tickets (passenger_id, flight_id, fare_class, price, status)
                VALUES (%s, %s, %s, %s, 'ISSUED')""", (t["passenger_id"], body.new_flight_id, t["fare_class"],
                                                      item["new_price"]))
        db.execute("UPDATE booking_ancillaries SET flight_id = %s WHERE booking_id = %s AND flight_id = %s",
                   (body.new_flight_id, b["id"], body.old_flight_id))
        if q["total"] > 0:
            db.execute("""
                INSERT INTO payments (booking_id, amount, method, status, provider_txn_id, paid_at)
                VALUES (%s, %s, %s, 'SUCCESS', %s, now())""", (b["id"], q["total"], body.method, mock_txn()))
            db.execute("UPDATE bookings SET total_amount = total_amount + %s WHERE id = %s", (q["total"], b["id"]))
    background.add_task(notify_booking, b["pnr"], "Đổi chuyến bay",
                        f"Bạn đã đổi sang chuyến {q['new_flight']['flight_number']}. Ghế sẽ được xếp khi làm thủ tục.")
    return summary | {"status": "CHANGED"}


@router.post("/tickets/{ticket_id}/check-in")
def check_in(ticket_id: int, last_name: str | None = None, user=Depends(optional_user), db=Depends(get_db)):
    """Check-in trực tuyến: mở từ 24 giờ đến 1 giờ trước giờ khởi hành. Vé chưa có ghế được xếp ghế tự động."""
    with db.transaction():
        t = db.execute("""
            SELECT t.flight_seat_id, p.passenger_type, b.pnr FROM tickets t
            JOIN passengers p ON p.id = t.passenger_id JOIN bookings b ON b.id = p.booking_id
            WHERE t.id = %s""", (ticket_id,)).fetchone()
        if t is None:
            raise HTTPException(404, "Không tìm thấy vé")
        load_booking(db, t["pnr"], user, last_name)
        row = db.execute("""
            UPDATE tickets t SET status = 'CHECKED_IN', checked_in_at = now()
            FROM flights f
            WHERE t.id = %s AND f.id = t.flight_id AND t.status = 'ISSUED'
              AND f.status NOT IN ('CANCELLED', 'DEPARTED', 'ARRIVED')
              AND now() BETWEEN coalesce(f.estimated_departure, f.departure_time) - interval '24 hours'
                            AND coalesce(f.estimated_departure, f.departure_time) - interval '1 hour'
            RETURNING t.id""", (ticket_id,)).fetchone()
        if row is None:
            raise HTTPException(400, "Chưa thể check-in: vé chưa xuất, đã check-in, hoặc ngoài khung 24h–1h trước giờ bay")
        seat = None
        if t["flight_seat_id"] is None and t["passenger_type"] != "INFANT":
            seat = db.execute("SELECT assign_seat(%s) AS seat", (ticket_id,)).fetchone()["seat"]
    return {"ok": True, "assigned_seat": seat}
