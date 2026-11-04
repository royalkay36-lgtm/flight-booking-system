"""Đăng ký với luật mật khẩu, quên / đặt lại mật khẩu."""
import uuid

from app.auth import create_reset_token, password_ok
from app.db import pool

STRONG = "Bay@2026x"


def test_password_rule():
    assert password_ok("Abcdef1@")
    for weak in ("Ab1@", "abcdefgh", "abcdef12", "abcdef@!", "12345678@", "Abcdef12 "):
        assert not password_ok(weak), weak


def test_register_and_reset(c):
    email = f"test-{uuid.uuid4().hex[:8]}@flight.test"
    try:
        r = c.post("/api/auth/register", json={"email": email, "password": "123456", "full_name": "Test"})
        assert r.status_code == 422 and "8 ký tự" in r.json()["detail"]
        assert c.post("/api/auth/register", json={"email": email, "password": STRONG, "full_name": "Test"}).status_code == 201

        # Quên mật khẩu: email có hay không có tài khoản đều trả như nhau
        assert c.post("/api/auth/forgot-password", json={"email": email}).json() == {"ok": True}
        assert c.post("/api/auth/forgot-password", json={"email": "khong-co@flight.test"}).json() == {"ok": True}

        with pool.connection() as db:
            user = db.execute("SELECT id, password_hash FROM users WHERE email = %s", (email,)).fetchone()
        token = create_reset_token(user["id"], user["password_hash"])

        # Token đặt lại không dùng để đăng nhập được
        assert c.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401
        assert c.post("/api/auth/reset-password", json={"token": token, "password": "yeu"}).status_code == 422
        assert c.post("/api/auth/reset-password", json={"token": "sai", "password": "Moi#2026a"}).status_code == 400

        assert c.post("/api/auth/reset-password", json={"token": token, "password": "Moi#2026a"}).status_code == 200
        assert c.post("/api/auth/login", json={"email": email, "password": "Moi#2026a"}).status_code == 200
        assert c.post("/api/auth/login", json={"email": email, "password": STRONG}).status_code == 401
        # Link chỉ dùng được một lần
        assert c.post("/api/auth/reset-password", json={"token": token, "password": "Lan2@2026"}).status_code == 400
    finally:
        with pool.connection() as db:
            db.execute("DELETE FROM users WHERE email = %s", (email,))
