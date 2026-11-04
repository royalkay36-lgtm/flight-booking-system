import os

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from psycopg.errors import UniqueViolation
from pydantic import BaseModel, Field

from ..auth import (PASSWORD_RULE, USER_COLS, create_reset_token, create_token, current_user, hash_password,
                    password_fingerprint, password_ok, read_reset_token, verify_password)
from ..db import get_db
from ..mailer import send_reset_email

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Địa chỉ frontend để ghép link trong email; lấy từ cấu hình, KHÔNG lấy từ header request
# (kẻ xấu có thể giả header để link đặt lại trỏ về trang của họ).
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5173").rstrip("/")


class RegisterIn(BaseModel):
    email: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(max_length=72)
    full_name: str = Field(min_length=1, max_length=100)
    phone: str | None = Field(None, max_length=20)


class LoginIn(BaseModel):
    email: str
    password: str


class ForgotIn(BaseModel):
    email: str = Field(max_length=200)


class ResetIn(BaseModel):
    token: str
    password: str = Field(max_length=72)


@router.post("/register", status_code=201)
def register(body: RegisterIn, db=Depends(get_db)):
    if not password_ok(body.password):
        raise HTTPException(422, PASSWORD_RULE)
    try:
        user = db.execute(
            f"INSERT INTO users (email, password_hash, full_name, phone) VALUES (%s, %s, %s, %s) RETURNING {USER_COLS}",
            (body.email.strip(), hash_password(body.password), body.full_name, body.phone)).fetchone()
    except UniqueViolation:
        raise HTTPException(409, "Email đã được sử dụng")
    return {"token": create_token(user["id"]), "user": user}


@router.post("/login")
def login(body: LoginIn, db=Depends(get_db)):
    user = db.execute(f"SELECT {USER_COLS}, password_hash FROM users WHERE lower(email) = lower(%s) AND is_active",
                      (body.email.strip(),)).fetchone()
    if user is None or not verify_password(body.password, user.pop("password_hash")):
        raise HTTPException(401, "Sai email hoặc mật khẩu")
    return {"token": create_token(user["id"]), "user": user}


@router.post("/forgot-password")
def forgot_password(body: ForgotIn, background: BackgroundTasks, db=Depends(get_db)):
    """Luôn trả cùng một kết quả để không lộ email nào có tài khoản; email gửi ở nền."""
    user = db.execute("SELECT id, email, full_name, password_hash FROM users WHERE lower(email) = lower(%s) AND is_active",
                      (body.email.strip(),)).fetchone()
    if user:
        link = f"{FRONTEND_URL}/reset-password?token={create_reset_token(user['id'], user['password_hash'])}"
        background.add_task(send_reset_email, user["email"], user["full_name"], link)
    return {"ok": True}


@router.post("/reset-password")
def reset_password(body: ResetIn, db=Depends(get_db)):
    user_id, fingerprint = read_reset_token(body.token)
    if not password_ok(body.password):
        raise HTTPException(422, PASSWORD_RULE)
    with db.transaction():
        user = db.execute("SELECT password_hash FROM users WHERE id = %s AND is_active FOR UPDATE", (user_id,)).fetchone()
        if user is None or password_fingerprint(user["password_hash"]) != fingerprint:
            raise HTTPException(400, "Link đặt lại mật khẩu đã được dùng hoặc không còn hiệu lực")
        db.execute("UPDATE users SET password_hash = %s WHERE id = %s", (hash_password(body.password), user_id))
    return {"ok": True}


@router.get("/me")
def me(user=Depends(current_user)):
    return user
