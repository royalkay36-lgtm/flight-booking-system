import os

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/flight_booking")

# autocommit: mỗi câu lệnh tự commit; thao tác nhiều bước bọc trong `with db.transaction():`
pool = ConnectionPool(DATABASE_URL, kwargs={"autocommit": True, "row_factory": dict_row}, open=False)


def get_db():
    with pool.connection() as conn:
        yield conn
