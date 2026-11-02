import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { api, CABIN, fmtDateTime, money } from '../api.js'
import SeatMap from '../components/SeatMap.jsx'
import { ErrorText, useAuth } from '../ui.jsx'

export default function Booking() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [sel] = useState(() => JSON.parse(sessionStorage.getItem('selection') || 'null'))
  const [pax, setPax] = useState(() => Array.from({ length: sel?.passengers ?? 0 }, () => ({
    full_name: '', gender: 'M', date_of_birth: '', passenger_type: 'ADULT', id_number: '', nationality: 'VN',
    seat_ids: sel.legs.map(() => null),
  })))
  const [seatCodes, setSeatCodes] = useState({}) // flight_seat_id -> '12A'
  const [contact, setContact] = useState({ email: user.email, phone: user.phone ?? '' })
  const [leg, setLeg] = useState(0)
  const [active, setActive] = useState(0)
  const [refresh, setRefresh] = useState(0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (!sel) return <p>Bạn chưa chọn chuyến bay. <Link className="text-sky-700 underline" to="/">Tìm chuyến bay</Link></p>

  const setPaxField = (i, k) => (e) => setPax(pax.map((p, j) => (j === i ? { ...p, [k]: e.target.value } : p)))

  const pickSeat = async (seat) => {
    setError('')
    const previous = pax[active].seat_ids[leg]
    try {
      await api(`/seats/${seat.flight_seat_id}/hold`, { method: 'POST' })
      if (previous) api(`/seats/${previous}/hold`, { method: 'DELETE' }).catch(() => {})
      setSeatCodes({ ...seatCodes, [seat.flight_seat_id]: seat.seat_code })
      const next = pax.map((p, i) => (i === active ? { ...p, seat_ids: p.seat_ids.map((s, j) => (j === leg ? seat.flight_seat_id : s)) } : p))
      setPax(next)
      const waiting = next.findIndex((p) => !p.seat_ids[leg])
      if (waiting >= 0) setActive(waiting)
    } catch (e) {
      setError(e.message)
    }
    setRefresh((r) => r + 1)
  }

  const submit = async (e) => {
    e.preventDefault()
    if (pax.some((p) => p.seat_ids.includes(null))) return setError('Vui lòng chọn ghế cho tất cả hành khách ở mọi chặng bay')
    setBusy(true)
    setError('')
    try {
      const booking = await api('/bookings', {
        method: 'POST',
        body: {
          contact_email: contact.email,
          contact_phone: contact.phone,
          flights: sel.legs.map((l) => ({ flight_id: l.flight_id, fare_class: l.fare_class })),
          passengers: pax.map((p) => ({ ...p, id_number: p.id_number || null })),
        },
      })
      sessionStorage.removeItem('selection')
      navigate(`/bookings/${booking.pnr}`)
    } catch (e) {
      setError(e.message)
      setRefresh((r) => r + 1)
    } finally {
      setBusy(false)
    }
  }

  const total = sel.legs.reduce((s, l) => s + Number(l.price), 0) * pax.length
  const current = sel.legs[leg]

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <section className="card space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="mr-auto text-lg font-semibold">Chọn chỗ ngồi</h2>
            {sel.legs.map((l, i) => (
              <button key={i} type="button" onClick={() => setLeg(i)} className={leg === i ? 'btn' : 'btn-outline'}>
                {l.flight_number} {l.origin}→{l.destination}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {pax.map((p, i) => (
              <button key={i} type="button" onClick={() => setActive(i)}
                className={`rounded-full border px-3 py-1 text-sm ${active === i ? 'border-sky-600 bg-sky-50 font-medium' : 'border-slate-300'}`}>
                K{i + 1}: {p.full_name || 'Hành khách'} — {seatCodes[p.seat_ids[leg]] ?? 'chưa chọn ghế'}
              </button>
            ))}
          </div>
          <p className="text-sm text-slate-500">
            Đang chọn ghế cho <b>K{active + 1}</b>, hạng {CABIN[current.cabin_class]}. Ghế được giữ cho bạn 15 phút.
          </p>
          <ErrorText>{error}</ErrorText>
          <SeatMap flightId={current.flight_id} cabin={current.cabin_class} refreshKey={refresh}
            selected={pax.map((p) => p.seat_ids[leg])} onPick={pickSeat} />
        </section>

        <section className="card space-y-4">
          <h2 className="text-lg font-semibold">Thông tin hành khách</h2>
          {pax.map((p, i) => (
            <fieldset key={i} className="grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-3">
              <legend className="text-sm font-medium">Hành khách {i + 1}</legend>
              <label className="sm:col-span-2"><span className="label">Họ tên (như trên giấy tờ)</span>
                <input className="input uppercase" required value={p.full_name} onChange={setPaxField(i, 'full_name')} /></label>
              <label><span className="label">Loại</span>
                <select className="input" value={p.passenger_type} onChange={setPaxField(i, 'passenger_type')}>
                  <option value="ADULT">Người lớn</option><option value="CHILD">Trẻ em</option>
                </select></label>
              <label><span className="label">Giới tính</span>
                <select className="input" value={p.gender} onChange={setPaxField(i, 'gender')}>
                  <option value="M">Nam</option><option value="F">Nữ</option><option value="X">Khác</option>
                </select></label>
              <label><span className="label">Ngày sinh</span>
                <input type="date" className="input" required value={p.date_of_birth} onChange={setPaxField(i, 'date_of_birth')} /></label>
              <label><span className="label">CCCD / Hộ chiếu</span>
                <input className="input" value={p.id_number} onChange={setPaxField(i, 'id_number')} /></label>
            </fieldset>
          ))}
          <div className="grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2">
            <label><span className="label">Email liên hệ</span>
              <input type="email" className="input" required value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} /></label>
            <label><span className="label">Số điện thoại</span>
              <input className="input" required minLength={8} value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} /></label>
          </div>
        </section>
      </div>

      <aside className="card h-fit space-y-3 lg:sticky lg:top-4">
        <h2 className="font-semibold">Hành trình</h2>
        {sel.legs.map((l, i) => (
          <div key={i} className="border-b border-slate-100 pb-2 text-sm">
            <div className="font-medium">{l.flight_number}: {l.origin_city} → {l.destination_city}</div>
            <div className="text-slate-500">{fmtDateTime(l.departure_time)}</div>
            <div>{l.fare_name} · {money(l.price)} × {pax.length}</div>
          </div>
        ))}
        <div className="flex justify-between text-lg font-semibold"><span>Tổng</span><span>{money(total)}</span></div>
        <ErrorText>{error}</ErrorText>
        <button className="btn w-full" disabled={busy}>Đặt chỗ</button>
      </aside>
    </form>
  )
}
