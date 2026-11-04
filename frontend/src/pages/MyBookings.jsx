import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api, BOOKING_STATUS, fmtDate, fmtTime, money } from '../api.js'
import { Badge, ErrorText, PlaneMark } from '../ui.jsx'

// route từ API có dạng "VN123 SGN→HAN, VN456 HAN→SGN"
const legsOf = (route) => (route || '').split(', ').map((leg) => {
  const [flight, path = ''] = leg.split(' ')
  const [from, to] = path.split('→')
  return { flight, from, to }
})

export default function MyBookings() {
  const [bookings, setBookings] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => { api('/bookings').then(setBookings).catch((e) => setError(e.message)) }, [])

  if (!bookings) return error ? <ErrorText>{error}</ErrorText> : <p className="text-muted">Đang tải vé của bạn…</p>

  const now = Date.now()
  const upcoming = bookings.filter((b) => new Date(b.departure_time) > now && b.status !== 'CANCELLED')
  const unpaid = upcoming.filter((b) => b.status === 'PENDING').length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[28px] font-bold leading-tight tracking-tight">Vé của tôi</h1>
        <p className="mt-1 text-muted">
          {bookings.length
            ? <>{upcoming.length} chuyến sắp bay{unpaid > 0 && <> · <b className="font-semibold text-[#9a5b00]">{unpaid} chưa thanh toán</b></>} · {bookings.length} đặt chỗ tất cả</>
            : 'Bạn chưa có đặt chỗ nào.'}
        </p>
      </div>

      {!bookings.length && (
        <div className="card flex flex-wrap items-center gap-4 bg-brand-wash">
          <p className="mr-auto">Tìm chuyến bay, chọn ghế và thanh toán; vé sẽ hiện ở đây.</p>
          <Link to="/" className="btn">Tìm chuyến bay</Link>
        </div>
      )}

      <ul className="grid gap-4 lg:grid-cols-2">
        {bookings.map((b) => {
          const legs = legsOf(b.route)
          const past = new Date(b.departure_time) <= now
          return (
            <li key={b.pnr}>
              <Link to={`/bookings/${b.pnr}`}
                className={`group flex overflow-hidden rounded-2xl border border-line bg-white transition-colors hover:border-brand ${past || b.status === 'CANCELLED' ? 'opacity-75' : ''}`}>
                <div className="min-w-0 flex-1 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[13px] text-muted">{fmtDate(b.departure_time)} · {fmtTime(b.departure_time)}</span>
                    <Badge map={BOOKING_STATUS} value={b.status} />
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <span className="text-[26px] font-bold leading-none tracking-tight">{legs[0].from}</span>
                    <span className="flex flex-1 items-center gap-1 text-brand" aria-hidden="true">
                      <span className="h-px flex-1 border-t border-dashed border-control" />
                      <PlaneMark className="h-4 w-4" />
                      <span className="h-px flex-1 border-t border-dashed border-control" />
                    </span>
                    <span className="text-[26px] font-bold leading-none tracking-tight">{legs[0].to}</span>
                  </div>
                  <p className="mt-2 text-[13px] text-muted">
                    {legs.map((l) => l.flight).join(' · ')}
                    {legs.length > 1 && <> · {legs.at(-1).to === legs[0].from ? "chiều về" : "chặng tiếp"} {legs.slice(1).map((l) => `${l.from}→${l.to}`).join(", ")}</>}
                  </p>
                </div>
                {/* Cuống vé: răng cưa bằng hai nửa hình tròn màu nền */}
                <div className="relative flex w-32 flex-none flex-col justify-between border-l border-dashed border-control bg-brand-wash p-4 sm:w-36">
                  <span className="absolute -left-2 -top-2 h-4 w-4 rounded-full border border-line bg-ground" aria-hidden="true" />
                  <span className="absolute -bottom-2 -left-2 h-4 w-4 rounded-full border border-line bg-ground" aria-hidden="true" />
                  <div>
                    <span className="block text-[13px] text-muted">Mã đặt chỗ</span>
                    <span className="text-lg font-bold tracking-[0.12em] text-brand-ink">{b.pnr}</span>
                  </div>
                  <div className="mt-3">
                    <span className="block text-[13px] text-muted">{b.passengers} khách</span>
                    <span className="num text-sm font-semibold">{money(b.total_amount)}</span>
                  </div>
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
