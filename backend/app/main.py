import asyncio
import os
import threading
from contextlib import asynccontextmanager

import psycopg
from fastapi import FastAPI
from fastapi.responses import JSONResponse

from . import chatbot, realtime
from .auth import SECRET_KEY
from .db import ON_VERCEL, pool
from .routers import admin, auth, bookings, flights, staff


@asynccontextmanager
async def lifespan(app: FastAPI):
    if os.environ.get("APP_ENV") == "production" and SECRET_KEY.startswith("dev-only"):
        raise RuntimeError("Chạy production phải đặt biến môi trường SECRET_KEY (khoá mặc định ai cũng biết)")
    pool.open()
    if not ON_VERCEL:
        threading.Thread(target=realtime.background_loop, args=(asyncio.get_running_loop(),), daemon=True).start()
    yield
    pool.close()


app = FastAPI(title="Flight Booking API", lifespan=lifespan)
for module in (auth, flights, bookings, staff, admin, realtime, chatbot):
    app.include_router(module.router)


@app.exception_handler(psycopg.errors.RaiseException)
async def business_error(request, exc: psycopg.Error):
    """Lỗi nghiệp vụ RAISE từ hàm PL/pgSQL (vd. confirm_booking: ghế đã bị đặt)."""
    return JSONResponse({"detail": exc.diag.message_primary}, status_code=409)


@app.exception_handler(psycopg.errors.IntegrityError)
async def integrity_error(request, exc: psycopg.Error):
    """Vi phạm ràng buộc toàn vẹn: trùng khoá, khoá ngoại, CHECK."""
    return JSONResponse({"detail": f"Dữ liệu không hợp lệ: {exc.diag.message_primary}"}, status_code=409)
