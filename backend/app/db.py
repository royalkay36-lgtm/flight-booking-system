import os

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

# Vercel tự đặt VERCEL=1. Ở đó mỗi request chạy trong hàm serverless, không giữ được luồng nền (xem main.py).
ON_VERCEL = bool(os.environ.get("VERCEL"))
DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/flight_booking")

# autocommit: mỗi câu lệnh tự commit; thao tác nhiều bước bọc trong `with db.transaction():`
# check: thử kết nối trước khi đưa ra dùng, để PostgreSQL khởi động lại không làm request đầu tiên lỗi 500.
# Trên Vercel mở pool ngay (có thể không có lifespan); lifespan gọi pool.open() lần nữa cũng không sao.
pool = ConnectionPool(DATABASE_URL, kwargs={"autocommit": True, "row_factory": dict_row}, open=ON_VERCEL,
                      check=ConnectionPool.check_connection)


def get_db():
    with pool.connection() as conn:
        if ON_VERCEL:  # không có luồng nền huỷ chỗ quá hạn mỗi phút, nên huỷ ngay trước mỗi request
            conn.execute("SELECT release_expired_holds()")
        yield conn
