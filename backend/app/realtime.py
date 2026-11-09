import asyncio
import time

import psycopg
from fastapi import APIRouter
from fastapi.responses import Response, StreamingResponse

from .db import DATABASE_URL, ON_VERCEL

router = APIRouter(tags=["realtime"])
subscribers: set[asyncio.Queue] = set()


def background_loop(loop: asyncio.AbstractEventLoop):
    """Một luồng nền duy nhất cho cả server:
    - LISTEN flight_status (NOTIFY từ trigger) rồi phát cho mọi client SSE;
    - mỗi phút gọi release_expired_holds() để huỷ booking quá hạn và trả ghế."""
    while True:
        try:
            with psycopg.connect(DATABASE_URL, autocommit=True) as conn:
                conn.execute("LISTEN flight_status")
                while True:
                    for note in conn.notifies(timeout=60):
                        for q in list(subscribers):
                            loop.call_soon_threadsafe(q.put_nowait, note.payload)
                    conn.execute("SELECT release_expired_holds()")
        except psycopg.OperationalError:
            time.sleep(5)  # mất kết nối DB: thử lại


@router.get("/api/flight-status/stream")
async def flight_status_stream():
    """Server-Sent Events: mỗi event là JSON {flight_id, flight_number, status, estimated_departure}."""
    if ON_VERCEL:
        return Response(status_code=204)  # 204 báo trình duyệt thôi kết nối lại; trang tự tải lại theo chu kỳ
    queue: asyncio.Queue = asyncio.Queue()
    subscribers.add(queue)

    async def events():
        try:
            while True:
                try:
                    yield f"data: {await asyncio.wait_for(queue.get(), 15)}\n\n"
                except asyncio.TimeoutError:
                    yield ": ping\n\n"  # giữ kết nối qua proxy
        finally:
            subscribers.discard(queue)

    return StreamingResponse(events(), media_type="text/event-stream")
