from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import AwareDatetime, BaseModel

from ..auth import require_role
from ..db import get_db
from ..mailer import notify_flight

router = APIRouter(prefix="/api/staff", tags=["staff"])
staff_only = require_role("STAFF", "ADMIN")

FlightStatus = Literal["SCHEDULED", "ON_TIME", "DELAYED", "BOARDING", "DEPARTED", "ARRIVED", "CANCELLED"]
# Trạng thái được phép chuyển tới (giữ nguyên trạng thái để cập nhật giờ dự kiến luôn được phép)
NEXT_STATUS = {
    "SCHEDULED": {"ON_TIME", "DELAYED", "BOARDING", "CANCELLED"},
    "ON_TIME": {"DELAYED", "BOARDING", "CANCELLED"},
    "DELAYED": {"ON_TIME", "BOARDING", "CANCELLED"},
    "BOARDING": {"DELAYED", "DEPARTED"},
    "DEPARTED": {"ARRIVED"},
    "ARRIVED": set(),
    "CANCELLED": set(),
}


class StatusIn(BaseModel):
    status: FlightStatus
    estimated_departure: AwareDatetime | None = None


@router.patch("/flights/{flight_id}/status")
def update_status(flight_id: int, body: StatusIn, background: BackgroundTasks,
                  user=Depends(staff_only), db=Depends(get_db)):
    with db.transaction():
        flight = db.execute("SELECT status, flight_number FROM flights WHERE id = %s FOR UPDATE", (flight_id,)).fetchone()
        if flight is None:
            raise HTTPException(404, "Không tìm thấy chuyến bay")
        if body.status != flight["status"] and body.status not in NEXT_STATUS[flight["status"]]:
            raise HTTPException(409, f"Không thể chuyển chuyến bay từ {flight['status']} sang {body.status}")
        # Trigger đọc app.user_id để ghi người thay đổi vào flight_status_history, rồi NOTIFY realtime.
        db.execute("SELECT set_config('app.user_id', %s, true)", (str(user["id"]),))
        db.execute("UPDATE flights SET status = %s, estimated_departure = %s WHERE id = %s",
                   (body.status, body.estimated_departure, flight_id))
    if body.status != flight["status"] and body.status in ("CANCELLED", "DELAYED"):
        message = (f"Rất tiếc, chuyến bay {flight['flight_number']} đã bị huỷ. Bạn được hoàn tiền 100% hoặc đổi "
                   "sang chuyến khác miễn phí tại mục Quản lý đặt chỗ." if body.status == "CANCELLED"
                   else f"Chuyến bay {flight['flight_number']} bị hoãn. Vui lòng xem giờ khởi hành dự kiến mới "
                        "tại mục Trạng thái chuyến bay.")
        background.add_task(notify_flight, flight_id, "Thay đổi chuyến bay", message)
    return {"ok": True}


@router.get("/flights/{flight_id}/passengers")
def manifest(flight_id: int, user=Depends(staff_only), db=Depends(get_db)):
    """Danh sách hành khách đã xuất vé của chuyến bay."""
    return db.execute("""
        SELECT t.id AS ticket_id, t.ticket_number, t.status, t.fare_class, t.checked_in_at, t.boarded_at,
               p.full_name, p.passenger_type, p.id_number, s.seat_code, b.pnr
        FROM tickets t
        JOIN passengers p ON p.id = t.passenger_id
        JOIN bookings b   ON b.id = p.booking_id
        LEFT JOIN flight_seats fs ON fs.id = t.flight_seat_id
        LEFT JOIN seats s         ON s.id = fs.seat_id
        WHERE t.flight_id = %s AND t.status IN ('ISSUED', 'CHECKED_IN', 'BOARDED')
        ORDER BY s.seat_row, s.seat_letter""", (flight_id,)).fetchall()


@router.post("/tickets/{ticket_id}/{action}")
def ticket_action(ticket_id: int, action: Literal["check-in", "board"], user=Depends(staff_only), db=Depends(get_db)):
    """Làm thủ tục tại quầy (ISSUED -> CHECKED_IN) và xác nhận lên máy bay (CHECKED_IN -> BOARDED)."""
    sql = {
        "check-in": "UPDATE tickets SET status = 'CHECKED_IN', checked_in_at = now() WHERE id = %s AND status = 'ISSUED'",
        "board": "UPDATE tickets SET status = 'BOARDED', boarded_at = now() WHERE id = %s AND status = 'CHECKED_IN'",
    }[action]
    with db.transaction():
        row = db.execute(sql + " RETURNING id, flight_seat_id, passenger_id", (ticket_id,)).fetchone()
        if row is None:
            raise HTTPException(400, "Trạng thái vé không phù hợp cho thao tác này")
        pax_type = db.execute("SELECT passenger_type FROM passengers WHERE id = %s", (row["passenger_id"],)).fetchone()
        seat = None
        if action == "check-in" and row["flight_seat_id"] is None and pax_type["passenger_type"] != "INFANT":
            seat = db.execute("SELECT assign_seat(%s) AS seat", (ticket_id,)).fetchone()["seat"]  # vé chưa chọn ghế
    return {"ok": True, "assigned_seat": seat}
