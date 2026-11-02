import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api, BOOKING_STATUS, fmtDateTime, money } from '../api.js'
import { Badge, ErrorText } from '../ui.jsx'

export default function MyBookings() {
  const [bookings, setBookings] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => { api('/bookings').then(setBookings).catch((e) => setError(e.message)) }, [])

  if (!bookings) return <ErrorText>{error}</ErrorText>
  return (
    <div className="card overflow-x-auto">
      <h1 className="mb-3 text-lg font-semibold">Lịch sử đặt vé</h1>
      {!bookings.length && <p className="text-sm text-slate-500">Bạn chưa có đặt chỗ nào.</p>}
      {bookings.length > 0 && (
        <table className="table">
          <thead><tr><th>PNR</th><th>Hành trình</th><th>Khởi hành</th><th>Khách</th><th>Tổng tiền</th><th>Trạng thái</th></tr></thead>
          <tbody>
            {bookings.map((b) => (
              <tr key={b.pnr}>
                <td><Link className="font-mono font-semibold text-sky-700 underline" to={`/bookings/${b.pnr}`}>{b.pnr}</Link></td>
                <td>{b.route}</td>
                <td>{fmtDateTime(b.departure_time)}</td>
                <td>{b.passengers}</td>
                <td>{money(b.total_amount)}</td>
                <td><Badge map={BOOKING_STATUS} value={b.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
