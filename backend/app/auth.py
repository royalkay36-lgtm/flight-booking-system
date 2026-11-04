import datetime as dt
import hashlib
import os

import bcrypt
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .db import get_db

SECRET_KEY = os.environ.get("SECRET_KEY", "dev-only-secret-key-change-me-in-production")
TOKEN_TTL = dt.timedelta(days=1)
RESET_TTL = dt.timedelta(minutes=30)
PASSWORD_RULE = "Mật khẩu cần ít nhất 8 ký tự, gồm chữ, số và ký tự đặc biệt (ví dụ @ # ! .)"
USER_COLS = "id, email, full_name, phone, role"

bearer = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    pw = password.encode()
    return len(pw) <= 72 and bcrypt.checkpw(pw, hashed.encode())  # bcrypt chỉ nhận tối đa 72 byte


def password_ok(password: str) -> bool:
    return (len(password) >= 8 and len(password.encode()) <= 72
            and any(ch.isalpha() for ch in password) and any(ch.isdigit() for ch in password)
            and any(not ch.isalnum() and not ch.isspace() for ch in password))


def password_fingerprint(password_hash: str) -> str:
    # Đổi mật khẩu là đổi hash nên link đặt lại cũ tự hết hiệu lực; băm thêm lần nữa để token không lộ hash
    return hashlib.sha256(password_hash.encode()).hexdigest()[:16]


def create_reset_token(user_id: int, password_hash: str) -> str:
    exp = dt.datetime.now(dt.timezone.utc) + RESET_TTL
    payload = {"sub": str(user_id), "purpose": "reset", "pwh": password_fingerprint(password_hash), "exp": exp}
    return jwt.encode(payload, SECRET_KEY, algorithm="HS256")


def read_reset_token(token: str) -> tuple[int, str]:
    """Trả (user_id, dấu vân tay mật khẩu lúc tạo link)."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        if payload.get("purpose") != "reset":
            raise ValueError
        return int(payload["sub"]), payload["pwh"]
    except (jwt.PyJWTError, KeyError, ValueError):
        raise HTTPException(400, "Link đặt lại mật khẩu không hợp lệ hoặc đã hết hạn")


def create_token(user_id: int) -> str:
    exp = dt.datetime.now(dt.timezone.utc) + TOKEN_TTL
    return jwt.encode({"sub": str(user_id), "exp": exp}, SECRET_KEY, algorithm="HS256")


def optional_user(cred: HTTPAuthorizationCredentials | None = Depends(bearer), db=Depends(get_db)):
    if cred is None:
        return None
    try:
        payload = jwt.decode(cred.credentials, SECRET_KEY, algorithms=["HS256"])
        if payload.get("purpose"):  # token đặt lại mật khẩu không được dùng để đăng nhập
            raise ValueError
        user_id = int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise HTTPException(401, "Phiên đăng nhập không hợp lệ hoặc đã hết hạn")
    user = db.execute(f"SELECT {USER_COLS} FROM users WHERE id = %s AND is_active", (user_id,)).fetchone()
    if user is None:
        raise HTTPException(401, "Tài khoản không tồn tại hoặc đã bị khoá")
    return user


def current_user(user=Depends(optional_user)):
    if user is None:
        raise HTTPException(401, "Vui lòng đăng nhập")
    return user


def require_role(*roles: str):
    def dependency(user=Depends(current_user)):
        if user["role"] not in roles:
            raise HTTPException(403, "Bạn không có quyền thực hiện thao tác này")
        return user
    return dependency
