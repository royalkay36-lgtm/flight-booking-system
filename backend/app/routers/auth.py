from fastapi import APIRouter, Depends, HTTPException
from psycopg.errors import UniqueViolation
from pydantic import BaseModel, Field

from ..auth import USER_COLS, create_token, current_user, hash_password, verify_password
from ..db import get_db

router = APIRouter(prefix="/api/auth", tags=["auth"])


class RegisterIn(BaseModel):
    email: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(min_length=6, max_length=72)
    full_name: str = Field(min_length=1, max_length=100)
    phone: str | None = Field(None, max_length=20)


class LoginIn(BaseModel):
    email: str
    password: str


@router.post("/register", status_code=201)
def register(body: RegisterIn, db=Depends(get_db)):
    if len(body.password.encode()) > 72:
        raise HTTPException(422, "Mật khẩu quá dài")
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


@router.get("/me")
def me(user=Depends(current_user)):
    return user
