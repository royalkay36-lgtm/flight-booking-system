const FINISHED = new Set(['CHECKED_IN', 'BOARDED'])
export function groupLegs(tickets = []) {
  const legs = new Map()
  for (const ticket of tickets) {
    if (!legs.has(ticket.flight_id))
      legs.set(ticket.flight_id, { ...ticket, tickets: [] })
    legs.get(ticket.flight_id).tickets.push(ticket)
  }
  return [...legs.values()]
}
export function bookingProgress(booking) {
  const stopped = ['CANCELLED', 'EXPIRED'].includes(booking.status)
  const tickets = booking.tickets.filter((t) => t.status !== 'CANCELLED')
  const completed = tickets.filter((t) => FINISHED.has(t.status)).length
  const paid = booking.payments.find((p) => p.status === 'SUCCESS')
  const confirmed = booking.status === 'CONFIRMED'
  const all = tickets.length > 0 && completed === tickets.length
  // No completion time is inferred from a UI action or the payment deadline.
  const checkTimes = tickets.map((t) => t.checked_in_at)
  return {
    stopped,
    completed,
    total: tickets.length,
    steps: [
      {
        label: 'Đặt chỗ',
        state: 'done',
        detail: 'Đã tạo mã đặt chỗ',
        time: booking.created_at,
      },
      {
        label: 'Thanh toán',
        state: paid || confirmed ? 'done' : stopped ? 'stopped' : 'current',
        detail:
          paid || confirmed
            ? 'Đã thanh toán'
            : stopped
              ? 'Đã dừng'
              : 'Chờ thanh toán',
        time: paid?.paid_at,
      },
      {
        label: 'Check-in',
        state: stopped
          ? 'stopped'
          : all
            ? 'done'
            : confirmed
              ? 'current'
              : 'upcoming',
        detail: stopped
          ? 'Không tiếp tục'
          : completed
            ? `${completed}/${tickets.length} vé đã check-in`
            : 'Chưa làm thủ tục',
        time:
          !stopped && all && checkTimes.every(Boolean)
            ? checkTimes.reduce((a, b) => (new Date(a) > new Date(b) ? a : b))
            : null,
      },
    ],
  }
}
export function checkInReason(booking, ticket, now = Date.now()) {
  if (booking.status !== 'CONFIRMED')
    return 'Chỉ check-in sau khi thanh toán và xuất vé.'
  if (FINISHED.has(ticket.status)) return 'Vé đã làm thủ tục.'
  if (ticket.status !== 'ISSUED') return 'Vé chưa sẵn sàng làm thủ tục.'
  if (['CANCELLED', 'DEPARTED', 'ARRIVED'].includes(ticket.flight_status))
    return 'Chuyến đã hủy hoặc đã khởi hành.'
  const departure = new Date(
    ticket.estimated_departure ?? ticket.departure_time,
  ).getTime()
  if (!Number.isFinite(departure))
    return 'Chưa có giờ khởi hành để xác định điều kiện check-in.'
  if (now < departure - 24 * 3600000)
    return 'Check-in mở từ 24 giờ đến 1 giờ trước giờ bay.'
  if (now > departure - 3600000) return 'Đã qua thời gian check-in trực tuyến.'
  return ''
}
export function changeReason(booking, leg, now = Date.now()) {
  if (booking.status !== 'CONFIRMED')
    return 'Chỉ đổi chuyến sau khi thanh toán.'
  if (leg.tickets.some((t) => t.status !== 'ISSUED'))
    return 'Chỉ đổi chặng khi tất cả vé đã xuất và chưa làm thủ tục.'
  if (leg.flight_status === 'CANCELLED') return ''
  if (new Date(leg.departure_time).getTime() <= now + 3 * 3600000)
    return 'Chỉ đổi chuyến trước giờ khởi hành ít nhất 3 tiếng.'
  if (leg.change_fee == null) return 'Hạng vé không cho phép đổi chuyến.'
  return ''
}
export function cancelReason(booking) {
  if (!['PENDING', 'CONFIRMED'].includes(booking.status))
    return 'Đặt chỗ đã hủy hoặc hết hạn.'
  if (booking.status === 'CONFIRMED' && booking.refund?.amount == null)
    return (
      booking.refund?.notes?.join(' ') ||
      'Chưa có báo giá hoàn tiền; hãy tải lại trước khi hủy.'
    )
  return ''
}
