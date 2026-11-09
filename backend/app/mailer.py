"""Gửi email cho khách. Có cấu hình SMTP thì gửi thật; chưa cấu hình thì lưu file .html vào backend/outbox/
để mở bằng trình duyệt khi demo."""
import datetime as dt
import html
import logging
import os
import pathlib
import smtplib
import ssl
from email.message import EmailMessage

from .db import ON_VERCEL, pool

log = logging.getLogger(__name__)
OUTBOX = pathlib.Path("/tmp/outbox") if ON_VERCEL else pathlib.Path(__file__).resolve().parent.parent / "outbox"  # Vercel chỉ cho ghi /tmp
TZ = dt.timezone(dt.timedelta(hours=7))


def send_email(to: str, subject: str, body_html: str):
    host = os.environ.get("SMTP_HOST")
    sender = os.environ.get("SMTP_FROM") or os.environ.get("SMTP_USER") or "SkyBooking <no-reply@skybooking.test>"
    if not host:
        OUTBOX.mkdir(exist_ok=True)
        name = f"{dt.datetime.now():%Y%m%d-%H%M%S-%f}-{to.split('@')[0]}.html"
        header = f"<p style='color:#64748b'>Gửi tới: {html.escape(to)}<br>Tiêu đề: {html.escape(subject)}</p><hr>"
        (OUTBOX / name).write_text(header + body_html, encoding="utf-8")
        return
    msg = EmailMessage()
    msg["Subject"], msg["From"], msg["To"] = subject, sender, to
    msg.set_content("Vui lòng mở email ở chế độ HTML.")
    msg.add_alternative(body_html, subtype="html")
    with smtplib.SMTP(host, int(os.environ.get("SMTP_PORT", "587")), timeout=20) as smtp:
        smtp.starttls(context=ssl.create_default_context())
        smtp.login(os.environ["SMTP_USER"], os.environ["SMTP_PASSWORD"])
        smtp.send_message(msg)


def send_reset_email(to: str, full_name: str, link: str):
    """Chạy nền (BackgroundTasks); lỗi gửi mail chỉ ghi log, người dùng vẫn nhận thông báo chung."""
    body = (f"<p>Chào {html.escape(full_name)},</p>"
            "<p>Bạn (hoặc ai đó) vừa yêu cầu đặt lại mật khẩu SkyBooking. Link dưới đây dùng được trong 30 phút:</p>"
            f"<p><a href='{html.escape(link)}'>Đặt lại mật khẩu</a></p>"
            "<p>Nếu bạn không yêu cầu, hãy bỏ qua email này; mật khẩu hiện tại vẫn giữ nguyên.</p>")
    try:
        send_email(to, "Đặt lại mật khẩu SkyBooking", body)
    except Exception:
        log.exception("Gửi email đặt lại mật khẩu thất bại")


def notify_booking(pnr: str, subject: str, message: str):
    """Chạy nền sau khi trả response (BackgroundTasks): tự lấy kết nối DB riêng, lỗi gửi mail không ảnh hưởng đặt vé."""
    try:
        with pool.connection() as db:
            b = db.execute("SELECT id, pnr, status, total_amount, contact_email FROM bookings WHERE pnr = %s",
                           (pnr,)).fetchone()
            rows = db.execute("""
                SELECT p.full_name, t.ticket_number, t.status, s.seat_code, f.flight_number, f.origin, f.destination,
                       f.departure_time, f.estimated_departure, f.status AS flight_status
                FROM tickets t JOIN passengers p ON p.id = t.passenger_id JOIN flights f ON f.id = t.flight_id
                LEFT JOIN flight_seats fs ON fs.id = t.flight_seat_id LEFT JOIN seats s ON s.id = fs.seat_id
                WHERE p.booking_id = %s AND t.status <> 'CANCELLED'
                ORDER BY f.departure_time, p.id""", (b["id"],)).fetchall()
        cells = "".join(
            f"<tr><td>{html.escape(r['flight_number'])} {r['origin']}→{r['destination']}</td>"
            f"<td>{r['departure_time'].astimezone(TZ):%H:%M %d/%m/%Y}</td><td>{html.escape(r['full_name'])}</td>"
            f"<td>{r['seat_code'] or 'Xếp khi check-in'}</td><td>{r['ticket_number']}</td></tr>" for r in rows)
        table = (f"<table border='1' cellpadding='6' style='border-collapse:collapse'>"
                 f"<tr><th>Chuyến bay</th><th>Khởi hành</th><th>Hành khách</th><th>Ghế</th><th>Số vé</th></tr>{cells}</table>"
                 if rows else "")
        total = f"{b['total_amount']:,.0f}".replace(",", ".")
        body = (f"<div style='font-family:Arial,sans-serif'><h2>SkyBooking</h2><p>{html.escape(message)}</p>"
                f"<p>Mã đặt chỗ: <b style='font-size:20px;letter-spacing:3px'>{b['pnr']}</b></p>{table}"
                f"<p>Tổng tiền: {total}đ</p>"
                "<p>Tra cứu, đổi / huỷ vé và làm thủ tục tại mục <b>Quản lý đặt chỗ</b> bằng mã đặt chỗ và họ của hành khách.</p></div>")
        send_email(b["contact_email"], f"[SkyBooking] {subject} – {b['pnr']}", body)
    except Exception:
        log.exception("Không gửi được email cho booking %s", pnr)


def notify_flight(flight_id: int, subject: str, message: str):
    """Báo cho mọi booking có vé trên chuyến bay (hãng huỷ / đổi giờ)."""
    try:
        with pool.connection() as db:
            pnrs = [r["pnr"] for r in db.execute("""
                SELECT DISTINCT b.pnr FROM bookings b JOIN passengers p ON p.booking_id = b.id
                JOIN tickets t ON t.passenger_id = p.id
                WHERE t.flight_id = %s AND t.status IN ('ISSUED', 'CHECKED_IN')""", (flight_id,)).fetchall()]
    except Exception:
        log.exception("Không lấy được danh sách booking của chuyến %s", flight_id)
        return
    for pnr in pnrs:
        notify_booking(pnr, subject, message)
