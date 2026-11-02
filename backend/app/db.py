import os

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/flight_booking")

# autocommit: mỗi câu lệnh tự commit; thao tác nhiều bước bọc trong `with db.transaction():`
# check: thử kết nối trước khi đưa ra dùng, để PostgreSQL khởi động lại không làm request đầu tiên lỗi 500.
pool = ConnectionPool(DATABASE_URL, kwargs={"autocommit": True, "row_factory": dict_row}, open=False,
                      check=ConnectionPool.check_connection)


def get_db():
    with pool.connection() as conn:
        yield conn
