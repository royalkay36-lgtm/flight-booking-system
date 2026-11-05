const TOKEN_KEY = 'token'
const TZ = 'Asia/Ho_Chi_Minh'

export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY))

export async function api(path, { method = 'GET', body } = {}) {
  const token = getToken()
  const res = await fetch('/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    if (res.status === 401) setToken(null)
    const detail = data?.detail
    throw new Error(Array.isArray(detail) ? detail.map((e) => e.msg).join('; ') : detail || `Lỗi ${res.status}`)
  }
  return data
}

export const money = (v) => Number(v).toLocaleString('vi-VN') + ' ₫'
export const fmtTime = (iso) => new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: TZ })
export const fmtDate = (iso) => new Date(iso).toLocaleDateString('vi-VN', { timeZone: TZ })
export const fmtDateTime = (iso) => `${fmtTime(iso)} ${fmtDate(iso)}`
export const hourOf = (iso) => Number(new Date(iso).toLocaleString('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: TZ }))
export const isoDate = (d = new Date()) => d.toLocaleDateString('sv-SE', { timeZone: TZ }) // YYYY-MM-DD
// <input type="datetime-local"> dùng giờ Việt Nam: ISO -> 'YYYY-MM-DDTHH:mm' và ngược lại
export const toLocalInput = (iso) => new Date(iso).toLocaleString('sv-SE', { timeZone: TZ }).replace(' ', 'T').slice(0, 16)
export const fromLocalInput = (v) => (v ? `${v}:00+07:00` : null)
export const duration = (a, b) => {
  const m = Math.round((new Date(b) - new Date(a)) / 60000)
  return `${Math.floor(m / 60)}g${String(m % 60).padStart(2, '0')}`
}

export const FLIGHT_STATUS = {
  SCHEDULED: ['Theo lịch', 'bg-slate-100 text-slate-700'],
  ON_TIME: ['Đúng giờ', 'bg-green-100 text-green-800'],
  DELAYED: ['Hoãn', 'bg-amber-100 text-amber-800'],
  BOARDING: ['Đang lên máy bay', 'bg-sky-100 text-sky-800'],
  DEPARTED: ['Đã cất cánh', 'bg-teal-100 text-teal-800'],
  ARRIVED: ['Đã hạ cánh', 'bg-slate-200 text-slate-700'],
  CANCELLED: ['Đã huỷ', 'bg-red-100 text-red-800'],
}

export const BOOKING_STATUS = {
  PENDING: ['Chờ thanh toán', 'bg-amber-100 text-amber-800'],
  CONFIRMED: ['Đã xác nhận', 'bg-green-100 text-green-800'],
  CANCELLED: ['Đã huỷ', 'bg-red-100 text-red-800'],
  EXPIRED: ['Hết hạn', 'bg-slate-200 text-slate-600'],
}

export const TICKET_STATUS = {
  PENDING: ['Chờ xuất vé', 'bg-amber-100 text-amber-800'],
  ISSUED: ['Đã xuất vé', 'bg-green-100 text-green-800'],
  CHECKED_IN: ['Đã check-in', 'bg-sky-100 text-sky-800'],
  BOARDED: ['Đã lên máy bay', 'bg-teal-100 text-teal-800'],
  CANCELLED: ['Đã huỷ', 'bg-red-100 text-red-800'],
}

export const CABIN = { ECONOMY: 'Phổ thông', BUSINESS: 'Thương gia' }
export const PAX = { ADULT: 'Người lớn', CHILD: 'Trẻ em (2–11)', INFANT: 'Em bé (<2)' }
export const EXTRA_CATEGORY = { BAGGAGE: 'Hành lý ký gửi', MEAL: 'Suất ăn', INSURANCE: 'Bảo hiểm', SIM: 'SIM du lịch' }
