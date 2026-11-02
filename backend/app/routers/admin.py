from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import AwareDatetime, BaseModel, Field

from ..auth import require_role
from ..db import get_db

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
                INSERT INTO cabin_layouts (model_code, cabin_class, first_row, last_row, seat_columns)
                VALUES (%s, %s, %s, %s, %s)""", (body.code, l.cabin_class, l.first_row, l.last_row, l.seat_columns))
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
