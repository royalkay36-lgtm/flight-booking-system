import datetime as dt
import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..auth import current_user
from ..db import get_db

router = APIRouter(prefix="/api", tags=["bookings"])

HOLD_MINUTES = 15  # thời gian giữ ghế / hạn thanh toán của booking


class SegmentIn(BaseModel):
    flight_id: int
    fare_class: str


class PassengerIn(BaseModel):
    full_name: str = Field(min_length=1, max_length=100)
    gender: Literal["M", "F", "X"] | None = None
    date_of_birth: dt.date
    passenger_type: Literal["ADULT", "CHILD"] = "ADULT"
    id_number: str | None = Field(None, max_length=20)
    nationality: str | None = Field(None, pattern="^[A-Z]{2}$")
    seat_ids: list[int | None]  # flight_seat_id cho từng chặng, cùng thứ tự với BookingIn.flights


class BookingIn(BaseModel):
    contact_email: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    contact_phone: str = Field(min_length=8, max_length=20)
    flights: list[SegmentIn] = Field(min_length=1, max_length=2)  # 1 = một chiều, 2 = khứ hồi
    passengers: list[PassengerIn] = Field(min_length=1, max_length=9)


class PayIn(BaseModel):
    method: Literal["VNPAY", "MOMO", "ZALOPAY", "CARD"]


@router.post("/bookings", status_code=201)
def create_booking(body: BookingIn, user=Depends(current_user), db=Depends(get_db)):
    if any(len(p.seat_ids) != len(body.flights) for p in body.passengers):
        raise HTTPException(422, "Mỗi hành khách cần một lựa chọn ghế cho từng chặng")
    with db.transaction():
        prices = []
        for seg in body.flights:
            fare = db.execute("""
                SELECT ff.price FROM flight_fares ff JOIN flights f ON f.id = ff.flight_id
                WHERE ff.flight_id = %s AND ff.fare_class = %s
                  AND f.departure_time > now() AND f.status <> 'CANCELLED'""",
                (seg.flight_id, seg.fare_class)).fetchone()
            if fare is None:
                raise HTTPException(400, "Chuyến bay hoặc hạng vé không còn mở bán")
            prices.append(fare["price"])

        booking = db.execute("""
            INSERT INTO bookings (user_id, contact_email, contact_phone, total_amount, expires_at)
            VALUES (%s, %s, %s, %s, now() + make_interval(mins => %s))
            RETURNING id, pnr, status, total_amount, expires_at""",
            (user["id"], body.contact_email, body.contact_phone,
             sum(prices) * len(body.passengers), HOLD_MINUTES)).fetchone()

        for p in body.passengers:
            pax_id = db.execute("""
                INSERT INTO passengers (booking_id, full_name, gender, date_of_birth, passenger_type, id_number, nationality)
                VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id""",
                (booking["id"], p.full_name.upper(), p.gender, p.date_of_birth,
                 p.passenger_type, p.id_number, p.nationality)).fetchone()["id"]
            for seg, price, seat_id in zip(body.flights, prices, p.seat_ids):
                # Giữ lại (gia hạn) ghế cho đủ thời gian thanh toán; false = ghế đã thuộc người khác.
                if seat_id is not None and not db.execute(
                        "SELECT hold_seat(%s, %s, %s) AS ok", (seat_id, user["id"], HOLD_MINUTES)).fetchone()["ok"]:
                    raise HTTPException(409, "Có ghế vừa bị người khác chọn, vui lòng chọn lại ghế")
                db.execute("""
                    INSERT INTO tickets (passenger_id, flight_id, fare_class, flight_seat_id, price)
                    VALUES (%s, %s, %s, %s, %s)""", (pax_id, seg.flight_id, seg.fare_class, seat_id, price))
    return booking


@router.post("/bookings/{pnr}/pay")
def pay(pnr: str, body: PayIn, user=Depends(current_user), db=Depends(get_db)):
    # shortcut: cổng thanh toán MÔ PHỎNG, luôn thành công. Khi tích hợp VNPAY/MoMo sandbox: tạo URL thanh toán,
    # nhận IPN, kiểm tra chữ ký HMAC rồi chạy đúng transaction dưới đây (provider_txn_id = mã giao dịch thật).
    with db.transaction():
        booking = db.execute("SELECT id, total_amount FROM bookings WHERE pnr = %s AND user_id = %s",
                             (pnr.upper(), user["id"])).fetchone()
        if booking is None:
            raise HTTPException(404, "Không tìm thấy đặt chỗ")
        db.execute("""
            INSERT INTO payments (booking_id, amount, method, status, provider_txn_id, paid_at)
            VALUES (%s, %s, %s, 'SUCCESS', %s, now())""",
            (booking["id"], booking["total_amount"], body.method, f"MOCK-{uuid.uuid4().hex[:12].upper()}"))
        # Ghế bị người khác lấy / booking hết hạn -> RAISE trong hàm -> rollback cả thanh toán (main.py trả 409).
        db.execute("SELECT confirm_booking(%s)", (booking["id"],))
    return {"pnr": pnr.upper(), "status": "CONFIRMED"}


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
def booking_detail(pnr: str, user=Depends(current_user), db=Depends(get_db)):
    """Hành khách xem booking của mình; nhân viên / admin tra cứu mọi booking theo PNR."""
    booking = db.execute("""
        SELECT id, pnr, user_id, status, total_amount, contact_email, contact_phone, created_at, expires_at
        FROM bookings WHERE pnr = %s""", (pnr.upper(),)).fetchone()
    if booking is None or (user["role"] == "PASSENGER" and booking["user_id"] != user["id"]):
        raise HTTPException(404, "Không tìm thấy đặt chỗ")
    booking["tickets"] = db.execute("""
        SELECT t.id, t.ticket_number, t.status, t.price, t.fare_class, fc.name AS fare_name,
               fc.checked_baggage_kg, fc.carry_on_kg, t.checked_in_at, t.boarded_at,
               p.full_name, p.passenger_type, s.seat_code,
               f.id AS flight_id, f.flight_number, f.origin, f.destination, f.departure_time,
               f.arrival_time, f.estimated_departure, f.status AS flight_status
        FROM tickets t
        JOIN passengers p    ON p.id = t.passenger_id
        JOIN flights f       ON f.id = t.flight_id
        JOIN fare_classes fc ON fc.code = t.fare_class
        LEFT JOIN flight_seats fs ON fs.id = t.flight_seat_id
        LEFT JOIN seats s         ON s.id = fs.seat_id
        WHERE p.booking_id = %s
        ORDER BY f.departure_time, p.id""", (booking["id"],)).fetchall()
    booking["payments"] = db.execute(
        "SELECT method, amount, status, provider_txn_id, paid_at FROM payments WHERE booking_id = %s ORDER BY id",
        (booking["id"],)).fetchall()
    return booking


@router.post("/tickets/{ticket_id}/check-in")
def check_in(ticket_id: int, user=Depends(current_user), db=Depends(get_db)):
    """Check-in trực tuyến: mở từ 24 giờ đến 1 giờ trước giờ khởi hành."""
    row = db.execute("""
        UPDATE tickets t SET status = 'CHECKED_IN', checked_in_at = now()
        FROM passengers p, bookings b, flights f
        WHERE t.id = %s AND p.id = t.passenger_id AND b.id = p.booking_id AND f.id = t.flight_id
          AND b.user_id = %s AND t.status = 'ISSUED'
          AND f.status NOT IN ('CANCELLED', 'DEPARTED', 'ARRIVED')
          AND now() BETWEEN coalesce(f.estimated_departure, f.departure_time) - interval '24 hours'
                        AND coalesce(f.estimated_departure, f.departure_time) - interval '1 hour'
        RETURNING t.id""", (ticket_id, user["id"])).fetchone()
    if row is None:
        raise HTTPException(400, "Chưa thể check-in: vé chưa xuất, đã check-in, hoặc ngoài khung 24h–1h trước giờ bay")
    return {"ok": True}
