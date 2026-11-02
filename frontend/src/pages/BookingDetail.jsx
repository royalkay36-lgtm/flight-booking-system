import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { api, BOOKING_STATUS, fmtDateTime, fmtTime, FLIGHT_STATUS, money, TICKET_STATUS } from '../api.js'
import { Badge, ErrorText, useAuth } from '../ui.jsx'

const METHODS = { VNPAY: 'VNPAY', MOMO: 'Ví MoMo', ZALOPAY: 'ZaloPay', CARD: 'Thẻ quốc tế' }

export default function BookingDetail() {
  const { pnr } = useParams()
  const { user } = useAuth()
  const [booking, setBooking] = useState(null)
  const [error, setError] = useState('')

  const load = () => api(`/bookings/${pnr}`).then(setBooking).catch((e) => setError(e.message))
  useEffect(() => { load() }, [pnr]) // eslint-disable-line react-hooks/exhaustive-deps

  const checkIn = async (ticketId) => {
    setError('')
    try {
      await api(`/tickets/${ticketId}/check-in`, { method: 'POST' })
      await load()
    } catch (e) {
      setError(e.message)
    }
  }

  if (!booking) return <ErrorText>{error}</ErrorText>
  const owner = user.id === booking.user_id
  const legs = Object.values(booking.tickets.reduce((m, t) => ((m[t.flight_id] ??= { ...t, tickets: [] }).tickets.push(t), m), {}))

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-6">
        <div>
          <span className="label">Mã đặt chỗ (PNR)</span>
          <span className="font-mono text-3xl font-bold tracking-widest">{booking.pnr}</span>
        </div>
        <Badge map={BOOKING_STATUS} value={booking.status} />
        <div className="text-sm text-slate-500">{booking.contact_email} · {booking.contact_phone}</div>
        <div className="ml-auto text-right">
          <span className="label">Tổng tiền</span>
          <span className="text-xl font-semibold">{money(booking.total_amount)}</span>
        </div>
      </div>

      <ErrorText>{error}</ErrorText>
      {booking.status === 'PENDING' && owner && <PayBox booking={booking} onPaid={load} />}

      {legs.map((l) => (
        <div key={l.flight_id} className="card overflow-x-auto">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <span className="text-lg font-semibold">{l.flight_number}</span>
            <span>{l.origin} → {l.destination}</span>
            <span className="text-sm text-slate-500">{fmtDateTime(l.departure_time)} – {fmtTime(l.arrival_time)}</span>
            <Badge map={FLIGHT_STATUS} value={l.flight_status} />
            {l.estimated_departure && <span className="text-sm text-amber-700">Giờ đi dự kiến: {fmtTime(l.estimated_departure)}</span>}
          </div>
          <table className="table">
            <thead><tr><th>Hành khách</th><th>Ghế</th><th>Hạng vé</th><th>Số vé</th><th>Trạng thái</th><th /></tr></thead>
            <tbody>
              {l.tickets.map((t) => (
                <tr key={t.id}>
                  <td>{t.full_name}</td>
                  <td className="font-semibold">{t.seat_code ?? '—'}</td>
                  <td>
                    {t.fare_name}
                    <div className="text-xs text-slate-500">{t.checked_baggage_kg}kg ký gửi · {t.carry_on_kg}kg xách tay</div>
                  </td>
                  <td className="font-mono">{t.ticket_number}</td>
                  <td><Badge map={TICKET_STATUS} value={t.status} /></td>
                  <td>{owner && t.status === 'ISSUED' && <button className="btn-outline" onClick={() => checkIn(t.id)}>Check-in</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {booking.payments.length > 0 && (
        <div className="card text-sm">
          <h3 className="mb-2 font-semibold">Thanh toán</h3>
          {booking.payments.map((p) => (
            <div key={p.provider_txn_id}>{METHODS[p.method]} · {money(p.amount)} · {p.status} · mã GD {p.provider_txn_id} · {p.paid_at && fmtDateTime(p.paid_at)}</div>
          ))}
        </div>
      )}
    </div>
  )
}

function PayBox({ booking, onPaid }) {
  const [method, setMethod] = useState('VNPAY')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const pay = async () => {
    setBusy(true)
    setError('')
    try {
      await api(`/bookings/${booking.pnr}/pay`, { method: 'POST', body: { method } })
      await onPaid()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card space-y-3 border-amber-300 bg-amber-50">
      <h3 className="font-semibold">Thanh toán trước {fmtDateTime(booking.expires_at)} để giữ chỗ</h3>
      <div className="flex flex-wrap gap-4">
        {Object.entries(METHODS).map(([k, label]) => (
          <label key={k} className="flex items-center gap-2 text-sm">
            <input type="radio" name="method" checked={method === k} onChange={() => setMethod(k)} /> {label}
          </label>
        ))}
      </div>
      <ErrorText>{error}</ErrorText>
      <button className="btn" disabled={busy} onClick={pay}>Thanh toán {money(booking.total_amount)} (mô phỏng)</button>
    </div>
  )
}
