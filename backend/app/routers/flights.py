import datetime as dt

from fastapi import APIRouter, Depends, HTTPException, Query

from ..auth import current_user, optional_user
from ..db import get_db

router = APIRouter(prefix="/api", tags=["flights"])

# shortcut: ngày/giờ lọc theo giờ Việt Nam; khi mở rộng bay quốc tế thì dùng airports.timezone của sân bay đi.
LOCAL_DATE = "(f.departure_time AT TIME ZONE 'Asia/Ho_Chi_Minh')::date"


@router.get("/airports")
def airports(db=Depends(get_db)):
    """Sân bay đang có chuyến bay (cho ô chọn điểm đi / điểm đến)."""
    return db.execute("""
        SELECT iata_code, name, city, country FROM airports
        WHERE iata_code IN (SELECT origin FROM flights UNION SELECT destination FROM flights)
        ORDER BY city""").fetchall()


@router.get("/flights/search")
def search(origin: str, destination: str, date: dt.date, passengers: int = Query(1, ge=1, le=9), db=Depends(get_db)):
    """Mỗi dòng = 1 chuyến x 1 hạng vé. Lọc hãng / hạng / giá / khung giờ làm ở frontend."""
    return db.execute("""
        SELECT * FROM v_flight_search f
        WHERE origin = %s AND destination = %s AND """ + LOCAL_DATE + """ = %s
          AND departure_time > now() AND status <> 'CANCELLED' AND seats_available >= %s
        ORDER BY departure_time, price""", (origin.upper(), destination.upper(), date, passengers)).fetchall()


@router.get("/flights/{flight_id}/seats")
def seat_map(flight_id: int, user=Depends(optional_user), db=Depends(get_db)):
    return db.execute("""
        SELECT flight_seat_id, seat_code, seat_row, seat_letter, grid_col, cabin_class, seat_type, status,
               (status = 'HELD' AND held_by IS NOT DISTINCT FROM %s) AS mine
        FROM v_seat_map WHERE flight_id = %s
        ORDER BY seat_row, grid_col""", (user and user["id"], flight_id)).fetchall()


@router.post("/seats/{flight_seat_id}/hold")
def hold(flight_seat_id: int, user=Depends(current_user), db=Depends(get_db)):
    row = db.execute("""
        SELECT hold_seat(fs.id, %s) AS ok
        FROM flight_seats fs JOIN flights f ON f.id = fs.flight_id
        WHERE fs.id = %s AND f.departure_time > now() AND f.status NOT IN ('CANCELLED', 'DEPARTED', 'ARRIVED')
        """, (user["id"], flight_seat_id)).fetchone()
    if row is None:
        raise HTTPException(404, "Ghế không tồn tại hoặc chuyến bay không còn mở bán")
    if not row["ok"]:
        raise HTTPException(409, "Ghế vừa có người khác chọn, vui lòng chọn ghế khác")
    return {"ok": True}


@router.delete("/seats/{flight_seat_id}/hold")
def release(flight_seat_id: int, user=Depends(current_user), db=Depends(get_db)):
    return {"ok": db.execute("SELECT release_seat(%s, %s) AS ok", (flight_seat_id, user["id"])).fetchone()["ok"]}


@router.get("/flight-status")
def flight_status(date: dt.date, db=Depends(get_db)):
    """Bảng trạng thái chuyến bay trong ngày (cập nhật realtime qua /api/flight-status/stream)."""
    return db.execute("""
        SELECT f.id, f.flight_number, f.airline_code, f.origin, o.city AS origin_city,
               f.destination, d.city AS destination_city, f.departure_time, f.estimated_departure,
               f.arrival_time, f.status, f.aircraft_reg
        FROM flights f
        JOIN airports o ON o.iata_code = f.origin
        JOIN airports d ON d.iata_code = f.destination
        WHERE """ + LOCAL_DATE + """ = %s
        ORDER BY f.departure_time""", (date,)).fetchall()
