// Ngày dạng 'YYYY-MM-DD', tháng dạng 'YYYY-MM'. Tính bằng UTC để không lệch múi giờ của máy người dùng.
const toDate = (iso) => {
  const [y, m, d = 1] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}
const toIso = (date) => date.toISOString().slice(0, 10)

export const monthOf = (iso) => iso.slice(0, 7)

export function addDays(iso, n) {
  const d = toDate(iso)
  d.setUTCDate(d.getUTCDate() + n)
  return toIso(d)
}

export function addMonths(month, n) {
  const d = toDate(month)
  return toIso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1))).slice(0, 7)
}

export function daysInMonth(month) {
  const d = toDate(month)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
}

// Cùng ngày ở tháng khác; 31/1 + 1 tháng -> 28 hoặc 29/2
export function addMonthsKeepDay(iso, n) {
  const month = addMonths(monthOf(iso), n)
  const day = Math.min(Number(iso.slice(8)), daysInMonth(month))
  return `${month}-${String(day).padStart(2, '0')}`
}

// Thứ Hai = 0 … Chủ nhật = 6 (lịch Việt Nam bắt đầu tuần từ thứ Hai)
export const weekdayIndex = (iso) => (toDate(iso).getUTCDay() + 6) % 7

// Các tuần của tháng, mỗi tuần 7 ô; ô không thuộc tháng là null
export function monthWeeks(month) {
  const cells = Array(weekdayIndex(`${month}-01`)).fill(null)
  for (let d = 1; d <= daysInMonth(month); d++) cells.push(`${month}-${String(d).padStart(2, '0')}`)
  while (cells.length % 7) cells.push(null)
  return Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7))
}

export const WEEKDAYS_SHORT = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']
const WEEKDAYS_LONG = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ nhật']

const dmy = (iso) => `${iso.slice(8)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
export const shortLabel = (iso) => `${WEEKDAYS_SHORT[weekdayIndex(iso)]}, ${dmy(iso)}`
export const longLabel = (iso) =>
  `${WEEKDAYS_LONG[weekdayIndex(iso)]}, ${Number(iso.slice(8))} tháng ${Number(iso.slice(5, 7))} năm ${iso.slice(0, 4)}`
export const monthLabel = (month) => `Tháng ${Number(month.slice(5))}, ${month.slice(0, 4)}`

// 990000 -> '990k', 1190000 -> '1,19tr'
export function shortPrice(v) {
  if (v == null) return ''
  const n = Number(v)
  if (n >= 1e6) return `${(n / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 2 })}tr`
  return `${Math.round(n / 1e3)}k`
}
