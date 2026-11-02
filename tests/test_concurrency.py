"""Kiểm thử tranh chấp ghế: N người cùng giữ / cùng thanh toán MỘT ghế tại cùng một thời điểm.

Chạy:
    pip install "psycopg[binary]"
    python tests/test_concurrency.py

DATABASE_URL mặc định trỏ tới PostgreSQL của docker-compose. Script tự tạo user tạm
và dọn sạch sau khi chạy.
"""
import os
import threading
import time

import psycopg

DSN = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/flight_booking")
N = 50


def race(worker):
    """Chạy worker(conn, i) trên N luồng, mỗi luồng một kết nối, cùng xuất phát qua barrier."""
    barrier = threading.Barrier(N)
    results = [None] * N

    def run(i):
        with psycopg.connect(DSN, autocommit=True) as conn:
            barrier.wait()
            results[i] = worker(conn, i)

    threads = [threading.Thread(target=run, args=(i,)) for i in range(N)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    return results


def main():
    with psycopg.connect(DSN, autocommit=True) as db:
        users = [db.execute("INSERT INTO users (email, password_hash, full_name) VALUES (%s, 'x', 'Load test') "
                            "RETURNING id", (f"loadtest{i}@flight.test",)).fetchone()[0] for i in range(N)]
        seat, seat_code, flight = db.execute(
            "SELECT flight_seat_id, seat_code, flight_id FROM v_seat_map "
            "WHERE status = 'AVAILABLE' AND cabin_class = 'ECONOMY' "
            "ORDER BY flight_id DESC, flight_seat_id LIMIT 1").fetchone()

        def reset_seat():
            db.execute("UPDATE flight_seats SET status = 'AVAILABLE', held_by = NULL, hold_expires_at = NULL "
                       "WHERE id = %s", (seat,))

        try:
            print(f"Ghế {seat_code} (flight_seat_id={seat}, flight_id={flight}), {N} luồng đồng thời\n")

            # 1) Cách làm ngây thơ: SELECT kiểm tra rồi mới UPDATE (check-then-act, không khoá).
            def naive_hold(conn, i):
                if conn.execute("SELECT status FROM flight_seats WHERE id = %s", (seat,)).fetchone()[0] != "AVAILABLE":
                    return False
                time.sleep(0.05)  # mô phỏng độ trễ xử lý giữa lúc kiểm tra và lúc ghi
                conn.execute("UPDATE flight_seats SET status = 'HELD', held_by = %s, "
                             "hold_expires_at = now() + interval '10 minutes' WHERE id = %s", (users[i], seat))
                return True

            naive = sum(race(naive_hold))
            print(f"[Ngây thơ]        {naive:>3} người được báo 'giữ ghế thành công'  -> TRÙNG GHẾ")
            reset_seat()

            # 2) hold_seat(): UPDATE có điều kiện, nguyên tử.
            held = sum(race(lambda conn, i: conn.execute("SELECT hold_seat(%s, %s)", (seat, users[i])).fetchone()[0]))
            print(f"[hold_seat]       {held:>3} người giữ được ghế")
            assert held == 1, held
            reset_seat()

            # 3) confirm_booking(): N booking PENDING cùng trỏ vào ghế, thanh toán xong cùng lúc.
            bookings = []
            for u in users:
                b = db.execute("INSERT INTO bookings (user_id, contact_email, contact_phone, expires_at) "
                               "VALUES (%s, 'lt@flight.test', '0', now() + interval '10 minutes') RETURNING id",
                               (u,)).fetchone()[0]
                p = db.execute("INSERT INTO passengers (booking_id, full_name, date_of_birth) "
                               "VALUES (%s, 'LOAD TEST', '2000-01-01') RETURNING id", (b,)).fetchone()[0]
                db.execute("INSERT INTO tickets (passenger_id, flight_id, fare_class, flight_seat_id, price) "
                           "VALUES (%s, %s, 'ECO_SAVER', %s, 1)", (p, flight, seat))
                bookings.append(b)

            def confirm(conn, i):
                try:
                    conn.execute("SELECT confirm_booking(%s)", (bookings[i],))
                    return True
                except psycopg.Error:
                    return False

            confirmed = sum(race(confirm))
            issued = db.execute("SELECT count(*) FROM tickets WHERE flight_seat_id = %s AND status = 'ISSUED'",
                                (seat,)).fetchone()[0]
            print(f"[confirm_booking] {confirmed:>3} booking được xác nhận, {issued} vé ISSUED trên ghế")
            assert confirmed == 1 and issued == 1, (confirmed, issued)

            # 4) Lưới an toàn: ép xuất vé thứ hai trên cùng ghế bằng tay -> unique index chặn.
            try:
                db.execute("UPDATE tickets SET status = 'ISSUED' WHERE id = (SELECT id FROM tickets "
                           "WHERE flight_seat_id = %s AND status = 'PENDING' LIMIT 1)", (seat,))
                raise AssertionError("unique index không chặn vé trùng ghế")
            except psycopg.errors.UniqueViolation:
                print("[unique index]    chặn được vé thứ 2 trên cùng ghế")

            print("\nPASS")
        finally:
            reset_seat()
            db.execute("DELETE FROM bookings WHERE user_id = ANY(%s)", (users,))
            db.execute("DELETE FROM users WHERE id = ANY(%s)", (users,))


if __name__ == "__main__":
    main()
