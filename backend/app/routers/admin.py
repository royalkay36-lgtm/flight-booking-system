import datetime as dt
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import AwareDatetime, BaseModel, Field

from ..auth import require_role
from ..db import get_db
from ..mailer import notify_flight

router = APIRouter(prefix="/api/admin", tags=["admin"])
admin_only = require_role("ADMIN")

Cabin = Literal["ECONOMY", "BUSINESS"]


class FlightIn(BaseModel):
    flight_number: str = Field(pattern=r"^[A-Z0-9]{2}\d{1,4}$")
    aircraft_reg: str
    origin: str
    destination: str
    departure_time: AwareDatetime
    arrival_time: AwareDatetime
    fares: dict[str, Decimal] = Field(min_length=1)  # {"ECO_SAVER": 990000, ...}


class FlightUpdate(BaseModel):
    departure_time: AwareDatetime | None = None
    arrival_time: AwareDatetime | None = None
    fares: dict[str, Decimal] = {}  # chỉ ảnh hưởng vé bán sau này, vé đã bán giữ giá cũ


class VoucherIn(BaseModel):
    code: str = Field(pattern=r"^[A-Z0-9]{3,20}$")
    description: str = Field(min_length=1)
    discount_type: Literal["PERCENT", "AMOUNT"]
    discount_value: Decimal = Field(gt=0)
    max_discount: Decimal | None = None
    min_amount: Decimal = Decimal(0)
    valid_to: AwareDatetime
    usage_limit: int = Field(gt=0)
    is_public: bool = True


class VoucherUpdate(BaseModel):
    is_public: bool | None = None
    valid_to: AwareDatetime | None = None
    usage_limit: int | None = Field(None, gt=0)


class AirportIn(BaseModel):
    iata_code: str = Field(pattern=r"^[A-Z]{3}$")
    name: str
    city: str
    country: str
    timezone: str = "Asia/Ho_Chi_Minh"


class LayoutIn(BaseModel):
    cabin_class: Cabin
    first_row: int = Field(gt=0)
    last_row: int = Field(gt=0)
    seat_columns: str = Field(pattern=r"^[A-Z]+(-[A-Z]+)*$")  # 'ABC-DEF'
    seat_fee: Decimal = Field(Decimal(0), ge=0)


class ModelIn(BaseModel):
    code: str = Field(min_length=2, max_length=10)
    manufacturer: str
    name: str
    layouts: list[LayoutIn] = Field(min_length=1)


class AircraftIn(BaseModel):
    registration: str = Field(min_length=3, max_length=10)
    model_code: str
    airline_code: str


class UserUpdate(BaseModel):
    role: Literal["PASSENGER", "STAFF", "ADMIN"] | None = None
    is_active: bool | None = None


@router.get("/catalog")
def catalog(user=Depends(admin_only), db=Depends(get_db)):
    """Danh mục cho các form quản trị."""
    return {
        "airports": db.execute("SELECT iata_code, name, city, country FROM airports ORDER BY iata_code").fetchall(),
        "airlines": db.execute("SELECT iata_code, name FROM airlines ORDER BY name").fetchall(),
        "models": db.execute("""
            SELECT m.code, m.name, count(s.id) AS seats FROM aircraft_models m
            LEFT JOIN seats s ON s.model_code = m.code GROUP BY m.code ORDER BY m.code""").fetchall(),
        "aircraft": db.execute("""
            SELECT a.registration, a.model_code, a.airline_code, m.name AS model_name FROM aircraft a
            JOIN aircraft_models m ON m.code = a.model_code WHERE a.is_active ORDER BY a.registration""").fetchall(),
        "fare_classes": db.execute("SELECT * FROM fare_classes ORDER BY cabin_class DESC, code").fetchall(),
    }


@router.post("/flights", status_code=201)
def create_flight(body: FlightIn, user=Depends(admin_only), db=Depends(get_db)):
    with db.transaction():
        flight = db.execute("""
            INSERT INTO flights (flight_number, airline_code, aircraft_reg, origin, destination, departure_time, arrival_time)
            SELECT %s, airline_code, registration, %s, %s, %s, %s FROM aircraft WHERE registration = %s
            RETURNING id""",
            (body.flight_number, body.origin, body.destination, body.departure_time, body.arrival_time,
             body.aircraft_reg)).fetchone()
        if flight is None:
            raise HTTPException(400, "Tàu bay không tồn tại")
        for fare_class, price in body.fares.items():
            db.execute("INSERT INTO flight_fares (flight_id, fare_class, price) VALUES (%s, %s, %s)",
                       (flight["id"], fare_class, price))
    return flight


@router.get("/flights")
def list_flights(date: dt.date, user=Depends(admin_only), db=Depends(get_db)):
    """Chuyến bay trong ngày kèm giá vé và số vé đã bán (để sửa lịch / giá)."""
    return db.execute("""
        SELECT f.id, f.flight_number, f.aircraft_reg, f.origin, f.destination, f.departure_time, f.arrival_time,
               f.status, lf.booked, lf.capacity,
               (SELECT json_object_agg(fare_class, price) FROM flight_fares WHERE flight_id = f.id) AS fares
        FROM flights f JOIN v_flight_load_factor lf ON lf.flight_id = f.id
        WHERE (f.departure_time AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = %s
        ORDER BY f.departure_time""", (date,)).fetchall()


@router.patch("/flights/{flight_id}")
def update_flight(flight_id: int, body: FlightUpdate, background: BackgroundTasks,
                  user=Depends(admin_only), db=Depends(get_db)):
    with db.transaction():
        old = db.execute("SELECT departure_time, flight_number FROM flights WHERE id = %s FOR UPDATE",
                         (flight_id,)).fetchone()
        if old is None:
            raise HTTPException(404, "Không tìm thấy chuyến bay")
        db.execute("""
            UPDATE flights SET departure_time = coalesce(%s, departure_time), arrival_time = coalesce(%s, arrival_time)
            WHERE id = %s""", (body.departure_time, body.arrival_time, flight_id))
        for fare_class, price in body.fares.items():
            db.execute("""
                INSERT INTO flight_fares (flight_id, fare_class, price) VALUES (%s, %s, %s)
                ON CONFLICT (flight_id, fare_class) DO UPDATE SET price = EXCLUDED.price""",
                (flight_id, fare_class, price))
    if body.departure_time and body.departure_time != old["departure_time"]:
        local = body.departure_time.astimezone(dt.timezone(dt.timedelta(hours=7)))
        background.add_task(notify_flight, flight_id, "Thay đổi lịch bay",
                            f"Chuyến bay {old['flight_number']} đổi giờ khởi hành sang {local:%H:%M ngày %d/%m/%Y}.")
    return {"ok": True}


@router.get("/vouchers")
def vouchers(user=Depends(admin_only), db=Depends(get_db)):
    return db.execute("SELECT * FROM vouchers ORDER BY valid_to DESC").fetchall()


@router.post("/vouchers", status_code=201)
def create_voucher(body: VoucherIn, user=Depends(admin_only), db=Depends(get_db)):
    db.execute("""
        INSERT INTO vouchers (code, description, discount_type, discount_value, max_discount, min_amount,
                              valid_to, usage_limit, is_public)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
        (body.code, body.description, body.discount_type, body.discount_value, body.max_discount,
         body.min_amount, body.valid_to, body.usage_limit, body.is_public))
    return {"ok": True}


@router.patch("/vouchers/{code}")
def update_voucher(code: str, body: VoucherUpdate, user=Depends(admin_only), db=Depends(get_db)):
    row = db.execute("""
        UPDATE vouchers SET is_public = coalesce(%s, is_public), valid_to = coalesce(%s, valid_to),
                            usage_limit = coalesce(%s, usage_limit)
        WHERE code = %s RETURNING code""", (body.is_public, body.valid_to, body.usage_limit, code)).fetchone()
    if row is None:
        raise HTTPException(404, "Không tìm thấy mã giảm giá")
    return {"ok": True}


@router.post("/airports", status_code=201)
def create_airport(body: AirportIn, user=Depends(admin_only), db=Depends(get_db)):
    db.execute("INSERT INTO airports (iata_code, name, city, country, timezone) VALUES (%s, %s, %s, %s, %s)",
               (body.iata_code, body.name, body.city, body.country, body.timezone))
    return {"ok": True}


@router.post("/aircraft-models", status_code=201)
def create_model(body: ModelIn, user=Depends(admin_only), db=Depends(get_db)):
    """Tạo chủng loại máy bay + bố cục khoang; trigger tự sinh sơ đồ ghế."""
    with db.transaction():
        db.execute("INSERT INTO aircraft_models (code, manufacturer, name) VALUES (%s, %s, %s)",
                   (body.code, body.manufacturer, body.name))
        for l in body.layouts:
            db.execute("""
                INSERT INTO cabin_layouts (model_code, cabin_class, first_row, last_row, seat_columns, seat_fee)
                VALUES (%s, %s, %s, %s, %s, %s)""",
                (body.code, l.cabin_class, l.first_row, l.last_row, l.seat_columns, l.seat_fee))
    return {"ok": True}


@router.post("/aircraft", status_code=201)
def create_aircraft(body: AircraftIn, user=Depends(admin_only), db=Depends(get_db)):
    db.execute("INSERT INTO aircraft (registration, model_code, airline_code) VALUES (%s, %s, %s)",
               (body.registration, body.model_code, body.airline_code))
    return {"ok": True}


@router.get("/reports")
def reports(user=Depends(admin_only), db=Depends(get_db)):
    return {
        "revenue": db.execute("SELECT * FROM v_revenue_daily ORDER BY flight_date DESC, airline_code LIMIT 60").fetchall(),
        "load_factor": db.execute("""
            SELECT * FROM v_flight_load_factor
            WHERE departure_time > now() - interval '7 days'
            ORDER BY departure_time LIMIT 200""").fetchall(),
        "totals": db.execute("""
            SELECT coalesce((SELECT sum(amount) FROM payments WHERE status = 'SUCCESS'), 0)
                 - coalesce((SELECT sum(amount) FROM payments WHERE status = 'REFUNDED'), 0) AS net_cash,
                   coalesce((SELECT sum(ba.price) FROM booking_ancillaries ba JOIN bookings b ON b.id = ba.booking_id
                             WHERE b.status = 'CONFIRMED'), 0) AS ancillary_revenue,
                   coalesce((SELECT sum(discount_amount) FROM bookings WHERE status = 'CONFIRMED'), 0) AS discounts
            """).fetchone(),
    }


@router.get("/users")
def users(user=Depends(admin_only), db=Depends(get_db)):
    return db.execute("SELECT id, email, full_name, phone, role, is_active, created_at FROM users ORDER BY id").fetchall()


@router.patch("/users/{user_id}")
def update_user(user_id: int, body: UserUpdate, user=Depends(admin_only), db=Depends(get_db)):
    if user_id == user["id"]:
        raise HTTPException(400, "Không thể tự đổi quyền hoặc khoá tài khoản của chính mình")
    row = db.execute("""
        UPDATE users SET role = coalesce(%s, role), is_active = coalesce(%s, is_active)
        WHERE id = %s RETURNING id""", (body.role, body.is_active, user_id)).fetchone()
    if row is None:
        raise HTTPException(404, "Không tìm thấy người dùng")
    return {"ok": True}
