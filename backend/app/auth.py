import datetime as dt
import os

import bcrypt
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .db import get_db

SECRET_KEY = os.environ.get("SECRET_KEY", "dev-only-secret-key-change-me-in-production")
TOKEN_TTL = dt.timedelta(days=1)
USER_COLS = "id, email, full_name, phone, role"

bearer = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    pw = password.encode()
    return len(pw) <= 72 and bcrypt.checkpw(pw, hashed.encode())  # bcrypt chỉ nhận tối đa 72 byte


def create_token(user_id: int) -> str:
    exp = dt.datetime.now(dt.timezone.utc) + TOKEN_TTL
    return jwt.encode({"sub": str(user_id), "exp": exp}, SECRET_KEY, algorithm="HS256")


def optional_user(cred: HTTPAuthorizationCredentials | None = Depends(bearer), db=Depends(get_db)):
    if cred is None:
        return None
    try:
        user_id = int(jwt.decode(cred.credentials, SECRET_KEY, algorithms=["HS256"])["sub"])
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
