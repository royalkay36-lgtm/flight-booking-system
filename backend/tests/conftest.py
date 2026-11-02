import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="session")
def c():
    """Một app dùng chung cho mọi test: pool kết nối DB chỉ mở / đóng một lần."""
    with TestClient(app) as client:
        yield client
