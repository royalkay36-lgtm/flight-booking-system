"""Kiểm thử luồng nghiệp vụ chính qua API (cần DB đã nạp database/*.sql).

Chạy trong thư mục backend:  python -m pytest -q
"""
import datetime as dt

from fastapi.testclient import TestClient

from app.db import pool
from app.main import app


def login(client, email):
    r = client.post("/api/auth/login", json={"email": email, "password": "123456"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_booking_flow():
    with TestClient(app) as c:
        khach, staff, admin = (login(c, f"{u}@flight.test") for u in ("khach", "staff", "admin"))
        assert c.post("/api/auth/login", json={"email": "khach@flight.test", "password": "sai"}).status_code == 401

        # Tìm chuyến HAN -> SGN, 2 khách, hạng phổ thông tiết kiệm
        date = (dt.date.today() + dt.timedelta(days=5)).isoformat()
        rows = c.get("/api/flights/search",
                     params={"origin": "HAN", "destination": "SGN", "date": date, "passengers": 2}).json()
        fare = next(r for r in rows if r["fare_class"] == "ECO_SAVER")
        flight_id = fare["flight_id"]
        seats = [s for s in c.get(f"/api/flights/{flight_id}/seats").json()
                 if s["status"] == "AVAILABLE" and s["cabin_class"] == "ECONOMY"][:2]
        seat_ids = [s["flight_seat_id"] for s in seats]
        pnr = None
        try:
            # Giữ ghế; người khác giữ cùng ghế bị từ chối
            for sid in seat_ids:
                assert c.post(f"/api/seats/{sid}/hold", headers=khach).status_code == 200
            assert c.post(f"/api/seats/{seat_ids[0]}/hold", headers=staff).status_code == 409
            mine = {s["flight_seat_id"] for s in c.get(f"/api/flights/{flight_id}/seats", headers=khach).json() if s["mine"]}
            assert set(seat_ids) <= mine

            # Tạo booking -> thanh toán (mô phỏng) -> vé được xuất
            r = c.post("/api/bookings", headers=khach, json={
                "contact_email": "khach@flight.test", "contact_phone": "0900000003",
                "flights": [{"flight_id": flight_id, "fare_class": "ECO_SAVER"}],
                "passengers": [
                    {"full_name": "Nguyen Van A", "date_of_birth": "1990-01-01", "seat_ids": [seat_ids[0]]},
                    {"full_name": "Tran Thi B", "date_of_birth": "1992-02-02", "seat_ids": [seat_ids[1]]},
                ]})
            assert r.status_code == 201, r.text
            pnr = r.json()["pnr"]
            assert float(r.json()["total_amount"]) == 2 * float(fare["price"])
            assert c.post(f"/api/bookings/{pnr}/pay", headers=khach, json={"method": "VNPAY"}).status_code == 200
            assert c.post(f"/api/bookings/{pnr}/pay", headers=khach, json={"method": "VNPAY"}).status_code == 409

            detail = c.get(f"/api/bookings/{pnr}", headers=khach).json()
            assert detail["status"] == "CONFIRMED"
            assert {t["status"] for t in detail["tickets"]} == {"ISSUED"}
            assert pnr in {b["pnr"] for b in c.get("/api/bookings", headers=khach).json()}

            # Nhân viên: làm thủ tục, lên máy bay, đổi trạng thái chuyến
            for t in detail["tickets"]:
                assert c.post(f"/api/staff/tickets/{t['id']}/check-in", headers=staff).status_code == 200
                assert c.post(f"/api/staff/tickets/{t['id']}/board", headers=staff).status_code == 200
            manifest = c.get(f"/api/staff/flights/{flight_id}/passengers", headers=staff).json()
            assert {m["status"] for m in manifest if m["pnr"] == pnr} == {"BOARDED"}
            assert c.patch(f"/api/staff/flights/{flight_id}/status", headers=staff,
                           json={"status": "ON_TIME"}).status_code == 200

            # Phân quyền + báo cáo
            assert c.get("/api/admin/reports", headers=khach).status_code == 403
            assert c.get(f"/api/staff/flights/{flight_id}/passengers", headers=khach).status_code == 403
            reports = c.get("/api/admin/reports", headers=admin).json()
            assert any(r["flight_id"] == flight_id and r["booked"] >= 2 for r in reports["load_factor"])
        finally:
            with pool.connection() as db:
                db.execute("UPDATE flights SET status = 'SCHEDULED' WHERE id = %s", (flight_id,))
                db.execute("UPDATE flight_seats SET status = 'AVAILABLE', held_by = NULL, hold_expires_at = NULL "
                           "WHERE id = ANY(%s)", (seat_ids,))
                db.execute("DELETE FROM payments WHERE booking_id IN (SELECT id FROM bookings WHERE pnr = %s)", (pnr,))
                db.execute("DELETE FROM bookings WHERE pnr = %s", (pnr,))
