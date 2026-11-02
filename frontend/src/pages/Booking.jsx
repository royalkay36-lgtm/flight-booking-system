import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { api, CABIN, EXTRA_CATEGORY, fmtDateTime, money, PAX } from '../api.js'
import SeatMap from '../components/SeatMap.jsx'
import { ErrorText, useAuth } from '../ui.jsx'

const STEPS = ['Hành khách', 'Chọn ghế', 'Dịch vụ bổ trợ', 'Xác nhận']

const newPax = (type, legs) => ({
  full_name: '', gender: 'M', date_of_birth: '', passenger_type: type, id_number: '', nationality: 'VN',
  seat_ids: legs.map(() => null), ancillaries: [],
})

export default function Booking() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [sel] = useState(() => JSON.parse(sessionStorage.getItem('selection') || 'null'))
  const [pax, setPax] = useState(() => !sel ? [] : [
    ...Array.from({ length: sel.adults ?? sel.passengers ?? 1 }, () => newPax('ADULT', sel.legs)),
    ...Array.from({ length: sel.children ?? 0 }, () => newPax('CHILD', sel.legs)),
    ...Array.from({ length: sel.infants ?? 0 }, () => newPax('INFANT', sel.legs)),
  ])
  const [step, setStep] = useState(0)
  const [contact, setContact] = useState({ email: user.email, phone: user.phone ?? '' })
  const [products, setProducts] = useState([])
  const [airports, setAirports] = useState({})
  const [seatCodes, setSeatCodes] = useState({}) // flight_seat_id -> '12A'
  const [leg, setLeg] = useState(0)
  const [active, setActive] = useState(0)
  const [refresh, setRefresh] = useState(0)
  const [voucher, setVoucher] = useState(null)
  const [voucherInput, setVoucherInput] = useState('')
  const [quote, setQuote] = useState(null)
  const [quoteError, setQuoteError] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api('/ancillaries').then(setProducts)
    api('/airports').then((list) => setAirports(Object.fromEntries(list.map((a) => [a.iata_code, a.country]))))
  }, [])

  const body = sel && {
    flights: sel.legs.map((l) => ({ flight_id: l.flight_id, fare_class: l.fare_class })),
    passengers: pax.map((p) => ({ ...p, id_number: p.id_number || null })),
    voucher_code: voucher,
  }
  const bodyKey = JSON.stringify(body)
  useEffect(() => { // bảng giá luôn do backend tính
    if (!sel || step === 0) return
    const timer = setTimeout(() => api('/bookings/quote', { method: 'POST', body })
      .then((q) => { setQuote(q); setQuoteError('') })
      .catch((e) => { setQuote(null); setQuoteError(e.message) }), 250)
    return () => clearTimeout(timer)
  }, [bodyKey, step]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!sel) return <p>Bạn chưa chọn chuyến bay. <Link className="text-sky-700 underline" to="/">Tìm chuyến bay</Link></p>

  const seated = pax.map((p, i) => i).filter((i) => pax[i].passenger_type !== 'INFANT')
  const current = sel.legs[leg]
  const byCode = Object.fromEntries(products.map((p) => [p.code, p]))
  const international = sel.legs.some((l) => [l.origin, l.destination].some((c) => airports[c] && airports[c] !== 'Vietnam'))
  const update = (i, patch) => setPax(pax.map((p, j) => (j === i ? { ...p, ...patch } : p)))
  const setField = (i, k) => (e) => update(i, { [k]: e.target.value })

  const pickSeat = async (seat) => {
    setError('')
    const previous = pax[active].seat_ids[leg]
    try {
      await api(`/seats/${seat.flight_seat_id}/hold`, { method: 'POST' })
      if (previous) api(`/seats/${previous}/hold`, { method: 'DELETE' }).catch(() => {})
      setSeatCodes({ ...seatCodes, [seat.flight_seat_id]: seat.seat_code })
      const next = pax.map((p, i) => (i === active ? { ...p, seat_ids: p.seat_ids.map((s, j) => (j === leg ? seat.flight_seat_id : s)) } : p))
      setPax(next)
      const waiting = seated.find((i) => !next[i].seat_ids[leg])
      if (waiting !== undefined) setActive(waiting)
    } catch (e) {
      setError(e.message)
    }
    setRefresh((r) => r + 1)
  }

  // Một gói / loại dịch vụ / chặng cho mỗi khách; segment = null với dịch vụ cả hành trình
  const extraOf = (p, cat, seg) => p.ancillaries.find((a) => byCode[a.code]?.category === cat && (a.segment ?? null) === seg)?.code ?? ''
  const setExtra = (i, cat, seg) => (e) => update(i, {
    ancillaries: [...pax[i].ancillaries.filter((a) => !(byCode[a.code]?.category === cat && (a.segment ?? null) === seg)),
      ...(e.target.value ? [{ code: e.target.value, segment: seg }] : [])],
  })
  const extraSelect = (i, cat, seg, label) => {
    const options = products.filter((p) => p.category === cat && (!p.international_only || international))
    if (!options.length) return null
    return (
      <label key={`${cat}-${seg}`}><span className="label">{label}</span>
        <select className="input" value={extraOf(pax[i], cat, seg)} onChange={setExtra(i, cat, seg)}>
          <option value="">Không chọn</option>
          {options.map((o) => <option key={o.code} value={o.code}>{o.name} — {money(o.price)}</option>)}
        </select>
      </label>
    )
  }

  const applyVoucher = async () => {
    setError('')
    try {
      await api('/bookings/quote', { method: 'POST', body: { ...body, voucher_code: voucherInput.trim() } })
      setVoucher(voucherInput.trim().toUpperCase())
    } catch (e) {
      setError(e.message)
    }
  }

  const submit = async () => {
    setBusy(true)
    setError('')
    try {
      const booking = await api('/bookings', { method: 'POST', body: { ...body, contact_email: contact.email, contact_phone: contact.phone } })
      sessionStorage.removeItem('selection')
      navigate(`/bookings/${booking.pnr}`)
    } catch (e) {
      setError(e.message)
      setRefresh((r) => r + 1)
    } finally {
      setBusy(false)
    }
  }

  const go = (s) => { setError(''); setStep(s) }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <ol className="flex flex-wrap gap-2 text-sm">
          {STEPS.map((label, i) => (
            <li key={label}>
              <button type="button" disabled={i > step} onClick={() => go(i)} aria-current={i === step ? 'step' : undefined}
                className={`rounded-full px-3 py-1 ${i === step ? 'bg-sky-600 text-white' : i < step ? 'bg-sky-100 text-sky-800' : 'bg-slate-100 text-slate-400'}`}>
                {i + 1}. {label}
              </button>
            </li>
          ))}
        </ol>
        <ErrorText>{error}</ErrorText>

        {step === 0 && (
          <form onSubmit={(e) => { e.preventDefault(); go(1) }} className="card space-y-4">
            <h2 className="text-lg font-semibold">Thông tin hành khách</h2>
            {pax.map((p, i) => (
              <fieldset key={i} className="grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-3">
                <legend className="text-sm font-medium">Hành khách {i + 1} · {PAX[p.passenger_type]}</legend>
                <label className="sm:col-span-2"><span className="label">Họ tên (như trên giấy tờ, họ trước)</span>
                  <input className="input uppercase" required value={p.full_name} onChange={setField(i, 'full_name')} /></label>
                <label><span className="label">Giới tính</span>
                  <select className="input" value={p.gender} onChange={setField(i, 'gender')}>
                    <option value="M">Nam</option><option value="F">Nữ</option><option value="X">Khác</option>
                  </select></label>
                <label><span className="label">Ngày sinh</span>
                  <input type="date" className="input" required value={p.date_of_birth} onChange={setField(i, 'date_of_birth')} /></label>
                <label><span className="label">CCCD / Hộ chiếu {international && '(bắt buộc bay quốc tế)'}</span>
                  <input className="input" required={international && p.passenger_type !== 'INFANT'} value={p.id_number} onChange={setField(i, 'id_number')} /></label>
                <label><span className="label">Quốc tịch</span>
                  <input className="input uppercase" maxLength={2} value={p.nationality} onChange={(e) => update(i, { nationality: e.target.value.toUpperCase() })} /></label>
              </fieldset>
            ))}
            <div className="grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2">
              <label><span className="label">Email nhận vé điện tử</span>
                <input type="email" className="input" required value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} /></label>
              <label><span className="label">Số điện thoại</span>
                <input className="input" required minLength={8} value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} /></label>
            </div>
            <button className="btn">Tiếp tục chọn ghế</button>
          </form>
        )}

        {step === 1 && (
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
              {seated.map((i) => (
                <button key={i} type="button" onClick={() => setActive(i)}
                  className={`rounded-full border px-3 py-1 text-sm ${active === i ? 'border-sky-600 bg-sky-50 font-medium' : 'border-slate-300'}`}>
                  K{i + 1}: {pax[i].full_name.toUpperCase()} — {seatCodes[pax[i].seat_ids[leg]] ?? 'chưa chọn'}
                </button>
              ))}
            </div>
            <p className="text-sm text-slate-500">
              Đang chọn ghế cho <b>K{active + 1}</b>, khoang {CABIN[current.cabin_class]}. Ghế được giữ 15 phút.
              Không chọn trước thì ghế được xếp miễn phí khi làm thủ tục. Em bé ngồi cùng người lớn.
            </p>
            <SeatMap flightId={current.flight_id} cabin={current.cabin_class} refreshKey={refresh}
              selected={pax.map((p) => p.seat_ids[leg])} onPick={pickSeat} />
            <div className="flex flex-wrap gap-2">
              <button className="btn" onClick={() => go(2)}>Tiếp tục</button>
              <button className="btn-outline" onClick={() => go(2)}>Bỏ qua, xếp ghế khi check-in</button>
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="card space-y-4">
            <h2 className="text-lg font-semibold">Dịch vụ bổ trợ</h2>
            <p className="text-sm text-slate-500">Mua trước khi bay rẻ hơn mua tại sân bay.</p>
            {pax.map((p, i) => (
              <fieldset key={i} className="space-y-3 border-t border-slate-100 pt-3">
                <legend className="text-sm font-medium">K{i + 1}: {p.full_name.toUpperCase()} · {PAX[p.passenger_type]}</legend>
                {p.passenger_type !== 'INFANT' && sel.legs.map((l, s) => (
                  <div key={s} className="grid gap-3 sm:grid-cols-2">
                    {extraSelect(i, 'BAGGAGE', s, `${EXTRA_CATEGORY.BAGGAGE} · ${l.flight_number}`)}
                    {extraSelect(i, 'MEAL', s, `${EXTRA_CATEGORY.MEAL} · ${l.flight_number}`)}
                  </div>
                ))}
                <div className="grid gap-3 sm:grid-cols-2">
                  {extraSelect(i, 'INSURANCE', null, `${EXTRA_CATEGORY.INSURANCE} (cả hành trình)`)}
                  {p.passenger_type !== 'INFANT' && extraSelect(i, 'SIM', null, `${EXTRA_CATEGORY.SIM} nước ngoài`)}
                </div>
              </fieldset>
            ))}
            <button className="btn" onClick={() => go(3)}>Tiếp tục</button>
          </section>
        )}

        {step === 3 && (
          <section className="card space-y-4">
            <h2 className="text-lg font-semibold">Xác nhận đặt chỗ</h2>
            <table className="table">
              <thead><tr><th>Hành khách</th><th>Loại</th>{sel.legs.map((l) => <th key={l.flight_id}>Ghế {l.flight_number}</th>)}</tr></thead>
              <tbody>
                {pax.map((p, i) => (
                  <tr key={i}>
                    <td>{p.full_name.toUpperCase()}</td><td>{PAX[p.passenger_type]}</td>
                    {p.seat_ids.map((s, j) => <td key={j}>{s ? seatCodes[s] : p.passenger_type === 'INFANT' ? '—' : 'Xếp khi check-in'}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex flex-wrap items-end gap-2">
              <label className="block"><span className="label">Mã giảm giá</span>
                <input className="input w-48 font-mono uppercase" value={voucherInput} onChange={(e) => setVoucherInput(e.target.value)} /></label>
              <button type="button" className="btn-outline" disabled={!voucherInput.trim()} onClick={applyVoucher}>Áp dụng</button>
              {voucher && <span className="text-sm text-green-700">Đã áp dụng {voucher}
                <button type="button" className="ml-2 underline" onClick={() => { setVoucher(null); setVoucherInput('') }}>bỏ</button></span>}
            </div>
            <p className="text-xs text-slate-500">Nhấn “Đặt chỗ” là bạn đồng ý điều kiện của hạng vé. Đặt chỗ được giữ 15 phút để thanh toán.</p>
            <button className="btn" disabled={busy || !quote} onClick={submit}>Đặt chỗ</button>
          </section>
        )}
      </div>

      <aside className="card h-fit space-y-3 lg:sticky lg:top-4">
        <h2 className="font-semibold">Hành trình</h2>
        {sel.legs.map((l, i) => (
          <div key={i} className="border-b border-slate-100 pb-2 text-sm">
            <div className="font-medium">{l.flight_number}: {l.origin_city} → {l.destination_city}</div>
            <div className="text-slate-500">{fmtDateTime(l.departure_time)} · {l.fare_name}</div>
          </div>
        ))}
        {quote ? (
          <>
            <ul className="space-y-1 text-sm">
              {quote.lines.map((line) => (
                <li key={line.label} className="flex justify-between gap-2">
                  <span>{line.label}</span><span className={Number(line.amount) < 0 ? 'text-green-700' : ''}>{money(line.amount)}</span>
                </li>
              ))}
            </ul>
            <div className="flex justify-between border-t border-slate-100 pt-2 text-lg font-semibold">
              <span>Tổng</span><span>{money(quote.total)}</span>
            </div>
          </>
        ) : quoteError ? <ErrorText>{quoteError}</ErrorText> : (
          <p className="text-sm text-slate-500">Nhập thông tin hành khách để xem giá chi tiết.</p>
        )}
      </aside>
    </div>
  )
}
