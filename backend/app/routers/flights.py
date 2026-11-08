import datetime as dt

from fastapi import APIRouter, Depends, HTTPException, Query

from ..auth import current_user, optional_user
from ..db import get_db

router = APIRouter(prefix="/api", tags=["flights"])

# shortcut: ngày/giờ lọc theo giờ Việt Nam; khi mở rộng bay quốc tế thì dùng airports.timezone của sân bay đi.
LOCAL_DATE = "(f.departure_time AT TIME ZONE 'Asia/Ho_Chi_Minh')::date"
MAX_HOLDS_PER_FLIGHT = 9  # chống một tài khoản giữ hết ghế của chuyến bay


@router.get("/airports")
def airports(db=Depends(get_db)):
    """Sân bay đang có chuyến bay (cho ô chọn điểm đi / điểm đến)."""
    return db.execute("""
        SELECT iata_code, name, city, country, image_url, description FROM airports
        WHERE iata_code IN (SELECT origin FROM flights UNION SELECT destination FROM flights)
        ORDER BY city""").fetchall()

@router.get("/destinations/featured")
def featured_destinations(db=Depends(get_db)):
    """Danh sách điểm đến nổi bật kèm giá vé thấp nhất từ HAN hoặc SGN."""
    return db.execute("""
        SELECT a.iata_code, a.name, a.city, a.country, a.image_url, a.description,
               min(f.price) AS min_price
        FROM airports a
        LEFT JOIN v_flight_search f
               ON f.destination = a.iata_code
              AND f.origin IN ('HAN', 'SGN')
              AND f.departure_time > now()
              AND f.status <> 'CANCELLED'
              AND f.seats_available > 0
        WHERE a.is_featured = true
        GROUP BY a.iata_code, a.name, a.city, a.country, a.image_url, a.description
        ORDER BY min_price NULLS LAST, a.city""").fetchall()

@router.get("/flights/search")
def search(origin: str, destination: str, date: dt.date, passengers: int = Query(1, ge=1, le=9), db=Depends(get_db)):
    """Mỗi dòng = 1 chuyến x 1 hạng vé. passengers = số ghế cần (người lớn + trẻ em).
    Lọc hãng / hạng / giá / khung giờ làm ở frontend."""
    return db.execute("""
        SELECT * FROM v_flight_search f
        WHERE origin = %s AND destination = %s AND """ + LOCAL_DATE + """ = %s
          AND departure_time > now() AND status <> 'CANCELLED' AND seats_available >= %s
        ORDER BY departure_time, price""", (origin.upper(), destination.upper(), date, passengers)).fetchall()


@router.get("/flights/fare-calendar")
def fare_calendar(origin: str, destination: str, date_from: dt.date, days: int = Query(7, ge=1, le=31),
                  passengers: int = Query(1, ge=1, le=9), db=Depends(get_db)):
    """Giá thấp nhất mỗi ngày (lịch giá rẻ)."""
    return db.execute("""
        SELECT """ + LOCAL_DATE + """ AS date, min(price) AS min_price
        FROM v_flight_search f
        WHERE origin = %s AND destination = %s AND """ + LOCAL_DATE + """ BETWEEN %s AND %s
          AND departure_time > now() AND status <> 'CANCELLED' AND seats_available >= %s
        GROUP BY 1 ORDER BY 1""",
        (origin.upper(), destination.upper(), date_from, date_from + dt.timedelta(days=days - 1), passengers)).fetchall()


@router.get("/ancillaries")
def ancillaries(db=Depends(get_db)):
    return db.execute("SELECT * FROM ancillary_products WHERE is_active ORDER BY category, price").fetchall()


@router.get("/vouchers/public")
def public_vouchers(db=Depends(get_db)):
    return db.execute("""
        SELECT code, description, valid_to FROM vouchers
        WHERE is_public AND now() BETWEEN valid_from AND valid_to AND used_count < usage_limit
        ORDER BY valid_to""").fetchall()


@router.get("/flights/{flight_id}/seats")
def seat_map(flight_id: int, user=Depends(optional_user), db=Depends(get_db)):
    return db.execute("""
        SELECT flight_seat_id, seat_code, seat_row, seat_letter, grid_col, cabin_class, seat_type, seat_fee, status,
               (status = 'HELD' AND held_by IS NOT DISTINCT FROM %s) AS mine
        FROM v_seat_map WHERE flight_id = %s
        ORDER BY seat_row, grid_col""", (user and user["id"], flight_id)).fetchall()


@router.post("/seats/{flight_seat_id}/hold")
def hold(flight_seat_id: int, user=Depends(current_user), db=Depends(get_db)):
    held = db.execute("""
        SELECT count(*) AS n FROM flight_seats
        WHERE flight_id = (SELECT flight_id FROM flight_seats WHERE id = %s) AND id <> %s
          AND status = 'HELD' AND held_by = %s AND hold_expires_at > now()""",
        (flight_seat_id, flight_seat_id, user["id"])).fetchone()["n"]
    if held >= MAX_HOLDS_PER_FLIGHT:
        raise HTTPException(409, f"Mỗi tài khoản chỉ được giữ tối đa {MAX_HOLDS_PER_FLIGHT} ghế trên một chuyến bay")
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
