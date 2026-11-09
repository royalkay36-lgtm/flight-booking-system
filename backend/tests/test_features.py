"""Kiểm thử các chức năng nâng cấp: giá theo loại khách + dịch vụ + voucher, giới hạn giữ ghế, khách tra cứu bằng
PNR + họ, huỷ / hoàn tiền, đổi chuyến, check-in xếp ghế tự động, chuyển trạng thái chuyến bay, chatbot.
Cần DB đã nạp database/*.sql. Chạy trong thư mục backend:  python -m pytest -q"""
import datetime as dt


from app.db import pool


def login(c, email):
    return {"Authorization": f"Bearer {c.post('/api/auth/login', json={'email': email, 'password': '123456'}).json()['token']}"}


def day(n):
    return (dt.date.today() + dt.timedelta(days=n)).isoformat()


def find(c, origin, dest, n, fare_class):
    rows = c.get("/api/flights/search", params={"origin": origin, "destination": dest, "date": day(n)}).json()
    return next(r for r in rows if r["fare_class"] == fare_class)


def cleanup(pnrs, flight_ids=()):
    with pool.connection() as db:
        for pnr in pnrs:
            db.execute("""UPDATE flight_seats SET status = 'AVAILABLE', held_by = NULL, hold_expires_at = NULL
                          WHERE id IN (SELECT t.flight_seat_id FROM tickets t JOIN passengers p ON p.id = t.passenger_id
                                       JOIN bookings b ON b.id = p.booking_id WHERE b.pnr = %s)""", (pnr,))
            db.execute("DELETE FROM payments WHERE booking_id IN (SELECT id FROM bookings WHERE pnr = %s)", (pnr,))
            db.execute("UPDATE vouchers SET used_count = 0")
            db.execute("DELETE FROM bookings WHERE pnr = %s", (pnr,))
        db.execute("UPDATE flight_seats SET status = 'AVAILABLE', held_by = NULL, hold_expires_at = NULL WHERE status = 'HELD'")
        for fid in flight_ids:
            db.execute("UPDATE flights SET status = 'SCHEDULED', estimated_departure = NULL WHERE id = %s", (fid,))


def adult(name, seat=None, extras=()):
    return {"full_name": name, "date_of_birth": "1990-05-05", "passenger_type": "ADULT", "seat_ids": [seat],
            "ancillaries": list(extras)}


def test_gia_dich_vu_voucher_va_giu_ghe(c):
    khach = login(c, "khach@flight.test")
    fare = find(c, "HAN", "DAD", 6, "ECO_SAVER")  # VJ515, máy bay A320
    price = float(fare["price"])
    body = {"flights": [{"flight_id": fare["flight_id"], "fare_class": "ECO_SAVER"}], "passengers": [
        adult("Le Van Cha", extras=[{"code": "BAG20", "segment": 0}, {"code": "INS_TRIP"}]),
        {"full_name": "Le Thi Con", "date_of_birth": f"{dt.date.today().year - 6}-01-01", "passenger_type": "CHILD",
         "seat_ids": [None], "ancillaries": [{"code": "MEAL_PHO", "segment": 0}]},
        {"full_name": "Le Be", "date_of_birth": f"{dt.date.today().year - 1}-01-01", "passenger_type": "INFANT",
         "seat_ids": [None]},
    ], "voucher_code": "chaoban"}
    q = c.post("/api/bookings/quote", json=body).json()
    subtotal = price + round(price * 0.9) + round(price * 0.1) + 180000 + 70000 + 80000
    assert float(q["subtotal"]) == subtotal
    assert float(q["discount"]) == min(200000, subtotal * 0.1)
    assert float(q["total"]) == subtotal - float(q["discount"])

    bad = c.post("/api/bookings/quote", json=body | {"passengers": [body["passengers"][2]]})
    assert bad.status_code == 422  # em bé không thể đi một mình
    sim = c.post("/api/bookings/quote", json=body | {"passengers": [adult("A", extras=[{"code": "SIM_KR"}])],
                                                      "voucher_code": None})
    assert sim.status_code == 422  # SIM chỉ bán cho hành trình quốc tế
    wrong_age = c.post("/api/bookings/quote", json=body | {"passengers": [
        body["passengers"][0], body["passengers"][1] | {"passenger_type": "ADULT"}], "voucher_code": None})
    assert wrong_age.status_code == 422

    # Giới hạn giữ ghế: tối đa 9 ghế / tài khoản / chuyến
    free = [s["flight_seat_id"] for s in c.get(f"/api/flights/{fare['flight_id']}/seats").json()
            if s["status"] == "AVAILABLE"][:10]
    try:
        for sid in free[:9]:
            assert c.post(f"/api/seats/{sid}/hold", headers=khach).status_code == 200
        assert c.post(f"/api/seats/{free[9]}/hold", headers=khach).status_code == 409
    finally:
        cleanup([])


def test_tra_cuu_huy_hoan_doi_va_checkin(c):
    khach, staff = login(c, "khach@flight.test"), login(c, "staff@flight.test")
    fare = find(c, "SGN", "HAN", 4, "ECO_FLEX")  # hoàn vé phí 300.000đ, đổi miễn phí
    pnrs, flights = [], [fare["flight_id"]]
    try:
        def book(name):
            r = c.post("/api/bookings", headers=khach, json={
                "contact_email": "khach@flight.test", "contact_phone": "0900000003",
                "flights": [{"flight_id": fare["flight_id"], "fare_class": "ECO_FLEX"}],
                "passengers": [adult(name)]})
            assert r.status_code == 201, r.text
            pnrs.append(r.json()["pnr"])
            assert c.post(f"/api/bookings/{r.json()['pnr']}/pay", headers=khach, json={"method": "MOMO"}).status_code == 200
            return r.json()["pnr"]

        # Khách không đăng nhập tra cứu bằng PNR + họ (có dấu hay không đều được)
        pnr = book("Phạm Minh Đức")
        assert c.get(f"/api/bookings/{pnr}", params={"last_name": "phạm"}).status_code == 200
        assert c.get(f"/api/bookings/{pnr}", params={"last_name": "PHAM"}).json()["status"] == "CONFIRMED"
        assert c.get(f"/api/bookings/{pnr}", params={"last_name": "Tran"}).status_code == 404
        assert c.get(f"/api/bookings/{pnr}").status_code == 404

        # Huỷ: hoàn giá vé trừ phí hoàn 300.000đ, ghế trả lại
        detail = c.get(f"/api/bookings/{pnr}", params={"last_name": "pham"}).json()
        assert float(detail["refund"]["amount"]) == float(fare["price"]) - 300000
        r = c.post(f"/api/bookings/{pnr}/cancel", params={"last_name": "pham"})
        assert r.status_code == 200 and float(r.json()["refund"]) == float(fare["price"]) - 300000
        assert c.post(f"/api/bookings/{pnr}/cancel", params={"last_name": "pham"}).status_code == 409

        # Đổi chuyến sang ngày khác cùng chặng: hạng Linh hoạt miễn phí đổi, chỉ trả chênh lệch giá nếu có
        pnr2 = book("Vo Thi Hoa")
        new = find(c, "SGN", "HAN", 5, "ECO_FLEX")
        flights.append(new["flight_id"])
        change = {"old_flight_id": fare["flight_id"], "new_flight_id": new["flight_id"]}
        preview = c.post(f"/api/bookings/{pnr2}/change", headers=khach, json=change).json()
        assert float(preview["total"]) == max(0, float(new["price"]) - float(fare["price"]))
        assert c.post(f"/api/bookings/{pnr2}/change", headers=khach, json=change | {"confirm": True}).status_code == 200
        tickets = c.get(f"/api/bookings/{pnr2}", headers=khach).json()["tickets"]
        active = [t for t in tickets if t["status"] != "CANCELLED"]
        assert [t["flight_id"] for t in active] == [new["flight_id"]]

        # Hãng huỷ chuyến -> hoàn 100%; trạng thái không thể quay ngược
        pnr3 = book("Do Van Nam")
        assert c.patch(f"/api/staff/flights/{fare['flight_id']}/status", headers=staff,
                       json={"status": "CANCELLED"}).status_code == 200
        assert c.patch(f"/api/staff/flights/{fare['flight_id']}/status", headers=staff,
                       json={"status": "SCHEDULED"}).status_code == 409
        refund = c.get(f"/api/bookings/{pnr3}", headers=khach).json()["refund"]
        assert float(refund["amount"]) == float(fare["price"])
    finally:
        cleanup(pnrs, flights)


def test_checkin_xep_ghe_tu_dong_va_chatbot(c):
    khach = login(c, "khach@flight.test")
    with pool.connection() as db:  # chuyến đang mở check-in (1h–24h trước giờ bay) và có hạng ECO_SAVER
        f = db.execute("""
            SELECT f.id FROM flights f JOIN flight_fares ff ON ff.flight_id = f.id AND ff.fare_class = 'ECO_SAVER'
            WHERE f.status NOT IN ('CANCELLED', 'DEPARTED', 'ARRIVED')
              AND f.departure_time BETWEEN now() + interval '2 hours' AND now() + interval '23 hours'
            ORDER BY f.departure_time LIMIT 1""").fetchone()
    pnrs = []
    try:
        if f:
            r = c.post("/api/bookings", headers=khach, json={
                "contact_email": "khach@flight.test", "contact_phone": "0900000003",
                "flights": [{"flight_id": f["id"], "fare_class": "ECO_SAVER"}], "passengers": [adult("Bui Lan")]})
            pnrs.append(r.json()["pnr"])
            c.post(f"/api/bookings/{pnrs[0]}/pay", headers=khach, json={"method": "VNPAY"})
            ticket = c.get(f"/api/bookings/{pnrs[0]}", headers=khach).json()["tickets"][0]
            assert ticket["seat_code"] is None
            r = c.post(f"/api/tickets/{ticket['id']}/check-in", params={"last_name": "bui"})
            assert r.status_code == 200 and r.json()["assigned_seat"]
            assert c.get(f"/api/bookings/{pnrs[0]}", headers=khach).json()["tickets"][0]["status"] == "CHECKED_IN"

        reply = c.post("/api/chat", json={"message": "Tìm chuyến từ Hà Nội đi Đà Nẵng sáng thứ 7 tuần sau, giá dưới 1 triệu"}).json()
        assert reply["flights"] and all(float(x["price"]) <= 1_000_000 for x in reply["flights"])
        assert "kg" in c.post("/api/chat", json={"message": "hành lý ký gửi bao nhiêu kg"}).json()["reply"]
        assert "CHAOBAN" in c.post("/api/chat", json={"message": "có khuyến mãi gì không"}).json()["reply"]
        assert c.post("/api/chat", json={"message": "VJ515"}).json()["reply"].startswith("Chuyến VJ515")
    finally:
        cleanup(pnrs)

def test_destinations_featured(c):
    """Kiểm thử API điểm đến nổi bật và các trường mở rộng của airports."""
    # 1. Kiểm tra /api/airports trả về đủ image_url và description
    airports_res = c.get("/api/airports")
    assert airports_res.status_code == 200
    airports_data = airports_res.json()
    assert len(airports_data) > 0
    assert "image_url" in airports_data[0]
    assert "description" in airports_data[0]

    # 2. Kiểm tra /api/destinations/featured
    res = c.get("/api/destinations/featured")
    assert res.status_code == 200
    data = res.json()
    assert len(data) > 0
    
    # Kiểm tra cấu trúc từng điểm đến
    for item in data:
        assert "iata_code" in item
        assert "city" in item
        assert "image_url" in item
        assert "description" in item
        assert "min_price" in item

    # Các điểm nổi bật có chuyến trong dữ liệu mẫu (như Đà Nẵng DAD hoặc Phú Quốc PQC) phải có giá
    dad = next((x for x in data if x["iata_code"] == "DAD"), None)
    if dad and dad["min_price"] is not None:
        assert float(dad["min_price"]) > 0