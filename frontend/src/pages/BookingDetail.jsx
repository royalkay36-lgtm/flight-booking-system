import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { api, BOOKING_STATUS, duration, fmtDate, fmtDateTime, fmtTime, FLIGHT_STATUS, isoDate, money, PAX, TICKET_STATUS } from '../api.js'
import { Badge, ErrorText, useAuth } from '../ui.jsx'

const METHODS = { VNPAY: 'VNPAY', MOMO: 'Ví MoMo', ZALOPAY: 'ZaloPay', CARD: 'Thẻ quốc tế' }

export default function BookingDetail() {
  const { pnr } = useParams()
  const [params] = useSearchParams()
  const { user } = useAuth()
  const lastName = params.get('last_name')
  const guest = lastName ? `?${new URLSearchParams({ last_name: lastName })}` : '' // khách tra cứu bằng PNR + họ
  const [booking, setBooking] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [changing, setChanging] = useState(null)
  const [pass, setPass] = useState(null)

  const load = () => api(`/bookings/${pnr}${guest}`).then(setBooking).catch((e) => setError(e.message))
  useEffect(() => { load() }, [pnr, guest]) // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (fn, ok) => {
    setError('')
    setMessage('')
    try {
      const r = await fn()
      setMessage(typeof ok === 'function' ? ok(r) : ok)
      await load()
    } catch (e) {
      setError(e.message)
    }
  }

  if (!booking) {
    return (
      <div className="space-y-3">
        <ErrorText>{error}</ErrorText>
        {error && <Link className="text-sky-700 underline" to="/?tab=manage">Tra cứu lại bằng mã đặt chỗ và họ</Link>}
      </div>
    )
  }
  const canAct = !!lastName || user?.id === booking.user_id
  const active = booking.tickets.filter((t) => t.status !== 'CANCELLED')
  const cancelled = booking.tickets.filter((t) => t.status === 'CANCELLED')
  const legs = Object.values(active.reduce((m, t) => ((m[t.flight_id] ??= { ...t, tickets: [] }).tickets.push(t), m), {}))
  const airlineCancelled = legs.some((l) => l.flight_status === 'CANCELLED') && booking.status === 'CONFIRMED'

  const cancel = () => {
    const refund = booking.refund?.amount
    const text = booking.status === 'PENDING' ? 'Huỷ đặt chỗ chưa thanh toán?'
      : `Huỷ toàn bộ đặt chỗ? Số tiền được hoàn: ${money(refund ?? 0)}.`
    if (window.confirm(text)) {
      run(() => api(`/bookings/${pnr}/cancel${guest}`, { method: 'POST' }),
        (r) => `Đã huỷ đặt chỗ. Hoàn ${money(r.refund)} về phương thức thanh toán ban đầu.`)
    }
  }

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
          <span className="label">Tổng tiền{Number(booking.discount_amount) > 0 && ` (đã giảm ${money(booking.discount_amount)} – ${booking.voucher_code})`}</span>
          <span className="text-xl font-semibold">{money(booking.total_amount)}</span>
        </div>
      </div>

      <ErrorText>{error}</ErrorText>
      {message && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{message}</p>}
      {airlineCancelled && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          Chuyến bay của bạn đã bị hãng huỷ. Bạn được <b>đổi sang chuyến khác miễn phí</b> hoặc <b>hoàn 100%</b> tiền vé.
        </p>
      )}
      {booking.status === 'PENDING' && canAct && <PayBox booking={booking} guest={guest} onPaid={() => run(() => Promise.resolve(), 'Thanh toán thành công, vé điện tử đã gửi tới email của bạn.')} />}

      {legs.map((l) => (
        <div key={l.flight_id} className="card space-y-3 overflow-x-auto">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-lg font-semibold">{l.flight_number}</span>
            <span>{l.origin_city} ({l.origin}) → {l.destination_city} ({l.destination})</span>
            <span className="text-sm text-slate-500">{fmtDateTime(l.departure_time)} – {fmtTime(l.arrival_time)}</span>
            <Badge map={FLIGHT_STATUS} value={l.flight_status} />
            {l.estimated_departure && <span className="text-sm text-amber-700">Giờ đi dự kiến: {fmtTime(l.estimated_departure)}</span>}
            {canAct && booking.status === 'CONFIRMED' && l.tickets.every((t) => t.status === 'ISSUED') &&
              (l.change_fee !== null || l.flight_status === 'CANCELLED') && (
              <button className="btn-outline ml-auto" onClick={() => setChanging(changing === l.flight_id ? null : l.flight_id)}>Đổi chuyến</button>
            )}
          </div>
          {changing === l.flight_id && (
            <ChangePanel leg={l} pnr={pnr} guest={guest} seats={l.tickets.filter((t) => t.passenger_type !== 'INFANT').length}
              onDone={(r) => { setChanging(null); run(() => Promise.resolve(), `Đã đổi sang chuyến ${r.new_flight.flight_number}${Number(r.total) ? `, đã thanh toán ${money(r.total)}` : ''}.`) }} />
          )}
          <table className="table">
            <thead><tr><th>Hành khách</th><th>Ghế</th><th>Hạng vé</th><th>Số vé</th><th>Trạng thái</th><th /></tr></thead>
            <tbody>
              {l.tickets.map((t) => (
                <tr key={t.id}>
                  <td>{t.full_name}<div className="text-xs text-slate-500">{PAX[t.passenger_type]}</div></td>
                  <td className="font-semibold">{t.seat_code ?? (t.passenger_type === 'INFANT' ? '—' : 'Xếp khi check-in')}</td>
                  <td>
                    {t.fare_name}
                    <div className="text-xs text-slate-500">{t.checked_baggage_kg}kg ký gửi · {t.carry_on_kg}kg xách tay</div>
                  </td>
                  <td className="font-mono">{t.ticket_number}</td>
                  <td><Badge map={TICKET_STATUS} value={t.status} /></td>
                  <td className="whitespace-nowrap">
                    {canAct && t.status === 'ISSUED' && (
                      <button className="btn-outline" onClick={() => run(() => api(`/tickets/${t.id}/check-in${guest}`, { method: 'POST' }),
                        (r) => r.assigned_seat ? `Check-in thành công, ghế của bạn: ${r.assigned_seat}` : 'Check-in thành công')}>Check-in</button>
                    )}
                    {['CHECKED_IN', 'BOARDED'].includes(t.status) && (
                      <button className="btn-outline" onClick={() => setPass({ ...t, pnr: booking.pnr })}>Thẻ lên máy bay</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {booking.ancillaries.length > 0 && (
        <div className="card text-sm">
          <h3 className="mb-2 font-semibold">Dịch vụ bổ trợ</h3>
          <ul className="space-y-1">
            {booking.ancillaries.map((a, i) => (
              <li key={i}>{a.full_name}: {a.name}{a.flight_number && ` (${a.flight_number})`} — {money(a.price)}</li>
            ))}
          </ul>
        </div>
      )}

      {cancelled.length > 0 && (
        <details className="card text-sm">
          <summary className="cursor-pointer font-semibold">Vé đã huỷ / đã đổi ({cancelled.length})</summary>
          <ul className="mt-2 space-y-1 text-slate-500">
            {cancelled.map((t) => <li key={t.id}>{t.ticket_number} · {t.full_name} · {t.flight_number} {fmtDate(t.departure_time)}</li>)}
          </ul>
        </details>
      )}

      {booking.payments.length > 0 && (
        <div className="card text-sm">
          <h3 className="mb-2 font-semibold">Lịch sử thanh toán</h3>
          {booking.payments.map((p) => (
            <div key={p.provider_txn_id} className={p.status === 'REFUNDED' ? 'text-green-700' : ''}>
              {p.status === 'REFUNDED' ? 'Hoàn tiền' : 'Thanh toán'} · {METHODS[p.method]} · {money(p.amount)} · mã GD {p.provider_txn_id} · {p.paid_at && fmtDateTime(p.paid_at)}
            </div>
          ))}
        </div>
      )}

      {canAct && ['PENDING', 'CONFIRMED'].includes(booking.status) && (
        <div className="card space-y-2 text-sm">
          <h3 className="font-semibold">Huỷ đặt chỗ</h3>
          {booking.status === 'CONFIRMED' && booking.refund && (
            <>
              <ul className="list-inside list-disc text-slate-600">{booking.refund.notes.map((n) => <li key={n}>{n}</li>)}</ul>
              {booking.refund.amount !== null && <p>Số tiền dự kiến được hoàn: <b>{money(booking.refund.amount)}</b></p>}
            </>
          )}
          <button className="btn-outline border-red-300 text-red-700" disabled={booking.refund?.amount === null} onClick={cancel}>
            Huỷ đặt chỗ
          </button>
        </div>
      )}

      {pass && <BoardingPass ticket={pass} onClose={() => setPass(null)} />}
    </div>
  )
}

function PayBox({ booking, guest, onPaid }) {
  const [method, setMethod] = useState('VNPAY')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const pay = async () => {
    setBusy(true)
    setError('')
    try {
      await api(`/bookings/${booking.pnr}/pay${guest}`, { method: 'POST', body: { method } })
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

// Đổi chuyến: chọn ngày -> chọn chuyến cùng chặng, cùng hạng vé -> xem phí -> xác nhận
function ChangePanel({ leg, pnr, guest, seats, onDone }) {
  const [date, setDate] = useState(isoDate(new Date(leg.departure_time)))
  const [options, setOptions] = useState([])
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    setPreview(null)
    api('/flights/search?' + new URLSearchParams({ origin: leg.origin, destination: leg.destination, date, passengers: Math.max(seats, 1) }))
      .then((rows) => setOptions(rows.filter((r) => r.fare_class === leg.fare_class && r.flight_id !== leg.flight_id)))
      .catch((e) => setError(e.message))
  }, [date]) // eslint-disable-line react-hooks/exhaustive-deps

  const call = async (newFlightId, confirm) => {
    setError('')
    try {
      const r = await api(`/bookings/${pnr}/change${guest}`, {
        method: 'POST', body: { old_flight_id: leg.flight_id, new_flight_id: newFlightId, confirm },
      })
      confirm ? onDone(r) : setPreview({ ...r, id: newFlightId })
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm">
      <label className="flex items-center gap-2">Ngày bay mới
        <input type="date" className="input w-44" min={isoDate()} value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      {!options.length && <p className="text-slate-500">Không có chuyến cùng hạng vé trong ngày này.</p>}
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button key={o.flight_id} className={preview?.id === o.flight_id ? 'btn' : 'btn-outline'} onClick={() => call(o.flight_id, false)}>
            {o.flight_number} · {fmtTime(o.departure_time)} ({duration(o.departure_time, o.arrival_time)}) · {money(o.price)}
          </button>
        ))}
      </div>
      <ErrorText>{error}</ErrorText>
      {preview && (
        <div className="space-y-2">
          {preview.free ? <p>Hãng đã huỷ chuyến cũ nên bạn được <b>đổi miễn phí</b>.</p> : (
            <p>Phí đổi: {money(preview.change_fee)} · Chênh lệch giá: {money(preview.fare_difference)} · <b>Tổng: {money(preview.total)}</b></p>
          )}
          <p className="text-slate-500">Ghế trên chuyến mới được xếp khi làm thủ tục.</p>
          <button className="btn" onClick={() => call(preview.id, true)}>
            Xác nhận đổi{Number(preview.total) ? ` và thanh toán ${money(preview.total)} (mô phỏng)` : ''}
          </button>
        </div>
      )}
    </div>
  )
}

function BoardingPass({ ticket, onClose }) {
  const [qr, setQr] = useState('')
  useEffect(() => {
    QRCode.toDataURL(`${ticket.pnr}|${ticket.ticket_number}|${ticket.flight_number}|${ticket.seat_code ?? ''}|${ticket.full_name}`, { width: 180 })
      .then(setQr)
  }, [ticket])
  const boarding = new Date(new Date(ticket.estimated_departure ?? ticket.departure_time).getTime() - 40 * 60000)
  return (
    <div role="dialog" aria-modal="true" aria-label="Thẻ lên máy bay" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}>
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="bg-sky-600 px-5 py-3 text-white"><b>✈ SkyBooking</b> · Thẻ lên máy bay</div>
        <div className="grid grid-cols-2 gap-3 p-5 text-sm">
          <div className="col-span-2 text-lg font-semibold">{ticket.full_name}</div>
          <div><span className="label">Chuyến bay</span>{ticket.flight_number}</div>
          <div><span className="label">Ngày</span>{fmtDate(ticket.departure_time)}</div>
          <div><span className="label">Từ</span>{ticket.origin_city} ({ticket.origin})</div>
          <div><span className="label">Đến</span>{ticket.destination_city} ({ticket.destination})</div>
          <div><span className="label">Giờ lên máy bay</span><b>{fmtTime(boarding)}</b></div>
          <div><span className="label">Ghế</span><b className="text-2xl">{ticket.seat_code ?? '—'}</b></div>
          <div><span className="label">Mã đặt chỗ</span><span className="font-mono">{ticket.pnr}</span></div>
          <div><span className="label">Số vé</span><span className="font-mono text-xs">{ticket.ticket_number}</span></div>
          <div className="col-span-2 flex justify-center">{qr && <img src={qr} alt={`Mã QR thẻ lên máy bay ${ticket.full_name}`} />}</div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button className="btn-outline" onClick={() => window.print()}>In</button>
          <button className="btn" onClick={onClose} autoFocus>Đóng</button>
        </div>
      </div>
    </div>
  )
}
