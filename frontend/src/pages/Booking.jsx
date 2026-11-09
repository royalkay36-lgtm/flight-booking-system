import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { api, CABIN, fmtDateTime, isoDate, money, PAX } from '../api.js'
import SeatMap from '../components/SeatMap.jsx'
import AncillaryServices from '../components/AncillaryServices.jsx'
import { chooseAncillary } from '../components/ancillaryOptions.js'
import { reconcileSeatHolds, replaceSeatHold } from '../components/seatHolds.js'
import { passengerValidationBody } from '../components/bookingData.js'
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
  const [productsLoading, setProductsLoading] = useState(true)
  const [productsError, setProductsError] = useState('')
  const [catalogRetry, setCatalogRetry] = useState(0)
  const [catalogVersion, setCatalogVersion] = useState(0)
  const [airports, setAirports] = useState({})
  const [airportsLoading, setAirportsLoading] = useState(true)
  const [airportsError, setAirportsError] = useState('')
  const [seatCodes, setSeatCodes] = useState({}) // flight_seat_id -> '12A'
  const [leg, setLeg] = useState(0)
  const [active, setActive] = useState(0)
  const [refresh, setRefresh] = useState(0)
  const refreshVersion = useRef(0)
  const [pendingRelease, setPendingRelease] = useState([])
  const [voucher, setVoucher] = useState(null)
  const [voucherInput, setVoucherInput] = useState('')
  const [quote, setQuote] = useState(null)
  const [quoteError, setQuoteError] = useState(null)
  const [quoteRetry, setQuoteRetry] = useState(0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [selectionBusy, setSelectionBusy] = useState(false)
  const actionPending = useRef(false)
  const [summaryOpen, setSummaryOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    setProductsLoading(true)
    setProductsError('')
    setAirportsLoading(true)
    setAirportsError('')
    api('/ancillaries').then(list => {
      if (!cancelled) {
        setProducts(list)
        setCatalogVersion(version => version + 1)
      }
    }).catch(e => {
      if (!cancelled) setProductsError(`Không tải được danh mục dịch vụ. ${e.message}`)
    }).finally(() => {
      if (!cancelled) setProductsLoading(false)
    })
    api('/airports').then(list => {
      if (!cancelled) setAirports(Object.fromEntries(list.map(a => [a.iata_code, a.country])))
    }).catch(e => {
      if (!cancelled) setAirportsError(`Không tải được thông tin hành trình. ${e.message}`)
    }).finally(() => {
      if (!cancelled) setAirportsLoading(false)
    })
    return () => { cancelled = true }
  }, [catalogRetry])

  const body = sel && {
    flights: sel.legs.map((l) => ({ flight_id: l.flight_id, fare_class: l.fare_class })),
    passengers: pax.map((p) => ({ ...p, full_name: p.full_name.trim(), id_number: p.id_number.trim() || null, nationality: p.nationality || null })),
    voucher_code: voucher,
  }
  const bodyKey = JSON.stringify([body, catalogVersion])
  useEffect(() => { // bảng giá luôn do backend tính
    if (!sel || step === 0) return
    setQuoteError(null)
    let cancelled = false
    const timer = setTimeout(() => api('/bookings/quote', { method: 'POST', body })
      .then((q) => {
        if (!cancelled) { setQuote({ ...q, bodyKey }); setQuoteError(null) }
      })
      .catch((e) => {
        if (!cancelled) { setQuote(null); setQuoteError({ bodyKey, message: e.message }) }
      }), 250)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [bodyKey, step, quoteRetry]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!sel) return <p>Bạn chưa chọn chuyến bay. <Link className="text-sky-700 underline" to="/">Tìm chuyến bay</Link></p>

  const seated = pax.map((p, i) => i).filter((i) => pax[i].passenger_type !== 'INFANT')
  const current = sel.legs[leg]
  const currentQuote = quote?.bodyKey === bodyKey ? quote : null
  const currentQuoteError = quoteError?.bodyKey === bodyKey ? quoteError.message : ''
  const controlsDisabled = busy || selectionBusy || pendingRelease.length > 0
  const international = sel.legs.some((l) => [l.origin, l.destination].some((c) => airports[c] && airports[c] !== 'Vietnam'))
  const internationalKnown = sel.legs.every(l => [l.origin, l.destination].every(code => !!airports[code]))
  const update = (i, patch) => {
    setError('')
    setPax(current => current.map((p, j) => (j === i ? { ...p, ...patch } : p)))
  }
  const setField = (i, k) => (e) => update(i, { [k]: e.target.value })
  const showActionError = message => {
    setError(message)
    requestAnimationFrame(() => document.getElementById('booking-error')?.focus())
  }

  const refreshSeats = () => setRefresh(++refreshVersion.current)
  const onSeatsChange = (rows, snapshot) => {
    if (actionPending.current || snapshot.refreshKey !== refreshVersion.current) return
    const segment = sel.legs.findIndex(flight => flight.flight_id === snapshot.flightId)
    if (segment < 0) return
    const result = reconcileSeatHolds(pax, segment, rows)
    if (result.lost.length) {
      setPax(current => reconcileSeatHolds(current, segment, rows).passengers)
      setActive(result.lost[0])
      setError(`Ghế của hành khách ${result.lost.map(index => index + 1).join(', ')} đã hết thời gian giữ hoặc không còn thuộc bạn. Vui lòng chọn lại hoặc để hệ thống xếp ghế.`)
    }
  }

  const validatePassengers = async event => {
    event.preventDefault()
    if (actionPending.current || pendingRelease.length) return
    if (!internationalKnown) {
      showActionError('Chưa xác định được phạm vi hành trình. Vui lòng tải lại thông tin hành trình trước khi tiếp tục.')
      return
    }
    actionPending.current = true
    setSelectionBusy(true)
    setError('')
    try {
      const validationBody = passengerValidationBody(body)
      const validQuote = await api('/bookings/quote', { method: 'POST', body: validationBody })
      setQuote({ ...validQuote, bodyKey: JSON.stringify([validationBody, catalogVersion]) })
      setQuoteError(null)
      go(1)
    } catch (e) {
      showActionError(e.message)
    } finally {
      actionPending.current = false
      setSelectionBusy(false)
    }
  }

  const pickSeat = async (seat) => {
    if (actionPending.current || pendingRelease.length) return
    actionPending.current = true
    refreshVersion.current += 1
    setSelectionBusy(true)
    setError('')
    const previous = pax[active].seat_ids[leg]
    try {
      const result = await replaceSeatHold(api, previous, seat.flight_seat_id)
      if (result.pendingRelease) {
        setPendingRelease(current => [...new Set([...current, result.pendingRelease])])
        showActionError(`Đã giữ ghế mới nhưng chưa nhả được ghế cũ. ${result.error}`)
      }
      setSeatCodes(current => ({ ...current, [seat.flight_seat_id]: seat.seat_code }))
      const next = pax.map((p, i) => (i === active ? { ...p, seat_ids: p.seat_ids.map((s, j) => (j === leg ? seat.flight_seat_id : s)) } : p))
      setPax(next)
      const waiting = seated.find((i) => !next[i].seat_ids[leg])
      if (waiting !== undefined) setActive(waiting)
    } catch (e) {
      showActionError(e.message)
    } finally {
      actionPending.current = false
      setSelectionBusy(false)
    }
    refreshSeats()
  }

  const removeSeat = async index => {
    if (actionPending.current || pendingRelease.length) return
    const seatId = pax[index].seat_ids[leg]
    if (!seatId) return
    actionPending.current = true
    refreshVersion.current += 1
    setSelectionBusy(true)
    setError('')
    try {
      await api(`/seats/${seatId}/hold`, { method: 'DELETE' })
      setPax(current => current.map((p, i) => i === index ? { ...p,
        seat_ids: p.seat_ids.map((id, segment) => segment === leg && id === seatId ? null : id) } : p))
      setActive(index)
    } catch (e) {
      showActionError(`Chưa bỏ được ghế đã chọn. ${e.message}`)
    } finally {
      actionPending.current = false
      setSelectionBusy(false)
      refreshSeats()
    }
  }

  const retryRelease = async () => {
    if (actionPending.current) return
    actionPending.current = true
    refreshVersion.current += 1
    setSelectionBusy(true)
    setError('')
    const remaining = []
    for (const seatId of pendingRelease) {
      try { await api(`/seats/${seatId}/hold`, { method: 'DELETE' }) }
      catch (e) { remaining.push(seatId); showActionError(`Chưa nhả được ghế cũ. ${e.message}`) }
    }
    setPendingRelease(remaining)
    actionPending.current = false
    setSelectionBusy(false)
    refreshSeats()
  }

  const setExtra = (index, category, segment, code) => setPax(current => current.map((passenger, i) =>
    i === index ? { ...passenger, ancillaries: chooseAncillary(passenger.ancillaries, products, category, segment, code) } : passenger))
  const removeExtra = (index, item) => setPax(current => current.map((passenger, i) =>
    i === index ? { ...passenger, ancillaries: passenger.ancillaries.filter(a =>
      a.code !== item.code || (a.segment ?? null) !== (item.segment ?? null)) } : passenger))

  const applyVoucher = async () => {
    if (actionPending.current) return
    actionPending.current = true
    setSelectionBusy(true)
    setError('')
    const code = voucherInput.trim().toUpperCase()
    try {
      await api('/bookings/quote', { method: 'POST', body: { ...body, voucher_code: code } })
      setVoucher(code)
    } catch (e) {
      showActionError(e.message)
    } finally {
      actionPending.current = false
      setSelectionBusy(false)
    }
  }

  const submit = async () => {
    if (actionPending.current || pendingRelease.length || !currentQuote) return
    actionPending.current = true
    setBusy(true)
    setError('')
    try {
      let checked = pax
      const lost = new Set()
      let firstLost = null
      for (let segment = 0; segment < sel.legs.length; segment += 1) {
        if (!checked.some(p => p.seat_ids[segment])) continue
        const rows = await api(`/flights/${sel.legs[segment].flight_id}/seats`)
        const result = reconcileSeatHolds(checked, segment, rows)
        checked = result.passengers
        if (result.lost.length && !firstLost) firstLost = { segment, passenger: result.lost[0] }
        result.lost.forEach(index => lost.add(index + 1))
      }
      if (lost.size) {
        setPax(checked)
        setLeg(firstLost.segment)
        setActive(firstLost.passenger)
        setStep(1)
        setError(`Ghế của hành khách ${[...lost].join(', ')} đã hết thời gian giữ hoặc không còn thuộc bạn. Vui lòng kiểm tra lại ghế và giá trước khi đặt chỗ.`)
        window.scrollTo({ top: 0, behavior: 'smooth' })
        return
      }
      const booking = await api('/bookings', { method: 'POST', body: { ...body, contact_email: contact.email, contact_phone: contact.phone } })
      sessionStorage.removeItem('selection')
      navigate(`/bookings/${booking.pnr}`)
    } catch (e) {
      showActionError(e.message)
      refreshSeats()
    } finally {
      actionPending.current = false
      setBusy(false)
    }
  }

  const go = (s) => {
    setError('')
    setStep(s)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="grid items-start gap-6 pb-[calc(6rem+env(safe-area-inset-bottom))] lg:grid-cols-3 lg:pb-0">
      <nav aria-label="Các bước đặt vé" className="card lg:col-span-3">
        <ol className="grid grid-cols-4">
          {STEPS.map((label, i) => (
            <li key={label} className="relative min-w-0">
              {i < STEPS.length - 1 && (
                <span aria-hidden="true" className={`absolute left-[calc(50%+1rem)] right-[calc(-50%+1rem)] top-4 h-0.5 ${i < step ? 'bg-sky-600' : 'bg-slate-200'}`} />
              )}
              <button type="button" disabled={i > step || controlsDisabled} onClick={() => go(i)} aria-current={i === step ? 'step' : undefined}
                className="relative flex w-full flex-col items-center gap-2 rounded-lg px-1 text-center focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-600 disabled:cursor-default">
                <span aria-hidden="true" className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${i === step ? 'bg-sky-600 text-white ring-4 ring-sky-100' : i < step ? 'bg-sky-100 text-sky-800' : 'bg-slate-100 text-slate-400'}`}>
                  {i + 1}
                </span>
                <span className={`text-xs sm:text-sm ${i === step ? 'font-semibold text-sky-700' : i < step ? 'text-sky-800' : 'text-slate-400'}`}>
                  <span className="sr-only">Bước {i + 1}: </span>{label}
                  {i < step && <span className="sr-only">, đã hoàn thành</span>}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <div className="order-2 min-w-0 space-y-4 lg:col-span-2">
        <p className="text-sm font-medium text-slate-500" aria-live="polite">Bước {step + 1} / {STEPS.length} · {STEPS[step]}</p>
        <div id="booking-error" tabIndex={-1} className="scroll-mt-24"><ErrorText>{error}</ErrorText></div>
        {pendingRelease.length > 0 && <div className="card space-y-2" role="status">
          <p>Cần nhả ghế cũ trước khi tiếp tục để tránh giữ thừa ghế.</p>
          <button type="button" className="btn-outline" disabled={busy || selectionBusy} onClick={retryRelease}>Thử nhả ghế cũ</button>
        </div>}

        {step === 0 && (
          <form id="booking-passengers" onSubmit={validatePassengers} className="card space-y-4">
            <h2 className="text-lg font-semibold">Thông tin hành khách</h2>
            {airportsError && <div><ErrorText>{airportsError}</ErrorText>
              <button type="button" className="btn-outline mt-2" disabled={airportsLoading} onClick={() => setCatalogRetry(value => value + 1)}>Thử tải lại thông tin hành trình</button></div>}
            {pax.map((p, i) => (
              <fieldset key={i} disabled={controlsDisabled} className="grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-3">
                <legend className="text-sm font-medium">Hành khách {i + 1} · {PAX[p.passenger_type]}</legend>
                <label className="sm:col-span-2"><span className="label">Họ tên (như trên giấy tờ, họ trước)</span>
                  <input className="input uppercase" required maxLength={100} pattern=".*\S.*" title="Nhập họ tên hành khách" value={p.full_name} onChange={setField(i, 'full_name')} /></label>
                <label><span className="label">Giới tính</span>
                  <select className="input" value={p.gender} onChange={setField(i, 'gender')}>
                    <option value="M">Nam</option><option value="F">Nữ</option><option value="X">Khác</option>
                  </select></label>
                <label><span className="label">Ngày sinh</span>
                  <input type="date" className="input" required max={isoDate()} value={p.date_of_birth} onChange={setField(i, 'date_of_birth')} /></label>
                <label><span className="label">CCCD / Hộ chiếu {international && '(bắt buộc bay quốc tế)'}</span>
                  <input className="input" maxLength={20} required={international && p.passenger_type !== 'INFANT'} value={p.id_number} onChange={setField(i, 'id_number')} /></label>
                <label><span className="label">Quốc tịch</span>
                  <input className="input uppercase" maxLength={2} pattern="[A-Z]{2}" title="Mã quốc tịch gồm 2 chữ cái, ví dụ VN" value={p.nationality} onChange={(e) => update(i, { nationality: e.target.value.toUpperCase() })} /></label>
              </fieldset>
            ))}
            <div className="grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2">
              <label><span className="label">Email nhận vé điện tử</span>
                <input type="email" className="input" required disabled={controlsDisabled} value={contact.email} onChange={(e) => { setError(''); setContact({ ...contact, email: e.target.value }) }} /></label>
              <label><span className="label">Số điện thoại</span>
                <input className="input" required minLength={8} maxLength={20} disabled={controlsDisabled} value={contact.phone} onChange={(e) => { setError(''); setContact({ ...contact, phone: e.target.value }) }} /></label>
            </div>
          </form>
        )}

        {step === 1 && (
          <section className="card space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="mr-auto text-lg font-semibold">Chọn chỗ ngồi</h2>
              {sel.legs.map((l, i) => (
                <button key={i} type="button" disabled={selectionBusy} onClick={() => setLeg(i)} className={leg === i ? 'btn' : 'btn-outline'}>
                  {l.flight_number} {l.origin}→{l.destination}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {seated.map((i) => (
                <div key={i} className="flex max-w-full flex-wrap items-center gap-2">
                <button type="button" disabled={controlsDisabled} onClick={() => setActive(i)}
                  className={`rounded-full border px-3 py-1 text-sm ${active === i ? 'border-sky-600 bg-sky-50 font-medium' : 'border-slate-300'}`}>
                  K{i + 1}: {pax[i].full_name.toUpperCase()} — {seatCodes[pax[i].seat_ids[leg]] ?? 'chưa chọn'}
                </button>
                {pax[i].seat_ids[leg] && <button type="button" className="btn-outline min-h-11 text-meta" disabled={controlsDisabled}
                  onClick={() => removeSeat(i)}>Bỏ chọn ghế {seatCodes[pax[i].seat_ids[leg]]} · K{i + 1}</button>}
                </div>
              ))}
            </div>
            <p className="text-sm text-slate-500">
              Đang chọn ghế cho <b>K{active + 1}</b>, khoang {CABIN[current.cabin_class]}. Ghế được giữ 15 phút.
              Không chọn trước thì ghế được xếp miễn phí khi làm thủ tục. Em bé ngồi cùng người lớn.
            </p>
            <fieldset disabled={controlsDisabled} aria-busy={selectionBusy} className="min-w-0">
              <legend className="sr-only">Sơ đồ chọn ghế</legend>
              <SeatMap flightId={current.flight_id} cabin={current.cabin_class} refreshKey={refresh}
                selected={pax.map((p) => p.seat_ids[leg])} onPick={pickSeat} onSeatsChange={onSeatsChange} />
            </fieldset>
          </section>
        )}

        {step === 2 && (
          <section className="card space-y-4">
            <h2 className="text-lg font-semibold">Dịch vụ bổ trợ</h2>
            <p className="text-ui text-muted">Chọn gói cho từng hành khách. Dùng “Không chọn” để bỏ dịch vụ. Bảng giá được cập nhật ở mục Tổng tiền.</p>
            <AncillaryServices passengers={pax} flights={sel.legs} products={products} loading={productsLoading} error={productsError}
              international={international} internationalKnown={internationalKnown} onRetry={() => setCatalogRetry(value => value + 1)}
              onChange={setExtra} onRemove={removeExtra} />
          </section>
        )}

        {step === 3 && (
          <section className="card space-y-4 overflow-x-auto">
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
                <input className="input w-48 font-mono uppercase" disabled={controlsDisabled} value={voucherInput} onChange={(e) => setVoucherInput(e.target.value)} /></label>
              <button type="button" className="btn-outline" disabled={controlsDisabled || !voucherInput.trim()} onClick={applyVoucher}>Áp dụng</button>
              {voucher && <span className="text-sm text-green-700">Đã áp dụng {voucher}
                <button type="button" className="ml-2 underline" disabled={controlsDisabled} onClick={() => { setVoucher(null); setVoucherInput('') }}>bỏ</button></span>}
            </div>
            <p className="text-xs text-slate-500">Nhấn “Đặt chỗ” là bạn đồng ý điều kiện của hạng vé. Đặt chỗ được giữ 15 phút để thanh toán.</p>
          </section>
        )}
      </div>

      <aside className="card order-1 min-w-0 space-y-3 lg:sticky lg:top-4 lg:order-2" aria-label="Tóm tắt hành trình và giá">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm text-slate-500">Tổng tiền</h2>
            <p className="text-xl font-semibold text-sky-700" aria-live="polite">
              {currentQuote ? money(currentQuote.total) : step === 0 || currentQuoteError ? 'Chưa có giá' : 'Đang tính giá…'}
            </p>
          </div>
          <button type="button" aria-expanded={summaryOpen} aria-controls="booking-price-details" onClick={() => setSummaryOpen(!summaryOpen)}
            className="btn-outline min-h-11 shrink-0 gap-2 lg:hidden">
            {summaryOpen ? 'Thu gọn' : 'Xem chi tiết'}
            <span aria-hidden="true">{summaryOpen ? '⌃' : '⌄'}</span>
          </button>
        </div>
        {!summaryOpen && currentQuoteError && <div className="lg:hidden"><ErrorText>{currentQuoteError}</ErrorText>
          <button type="button" className="btn-outline mt-2" disabled={controlsDisabled} onClick={() => setQuoteRetry(value => value + 1)}>Thử lại báo giá</button></div>}
        <div id="booking-price-details" className={`${summaryOpen ? 'block' : 'hidden'} space-y-3 lg:block`}>
          <h3 className="font-semibold">Hành trình</h3>
          {sel.legs.map((l, i) => (
            <div key={i} className="border-b border-slate-100 pb-2 text-sm">
              <div className="font-medium">{l.flight_number}: {l.origin_city} → {l.destination_city}</div>
              <div className="text-slate-500">{fmtDateTime(l.departure_time)} · {l.fare_name}</div>
            </div>
          ))}
          {currentQuote ? (
            <>
              <ul className="space-y-1 text-sm">
                {currentQuote.lines.map((line) => (
                  <li key={line.label} className="flex justify-between gap-2">
                    <span>{line.label}</span><span className={`shrink-0 whitespace-nowrap ${Number(line.amount) < 0 ? 'text-green-700' : ''}`}>{money(line.amount)}</span>
                  </li>
                ))}
              </ul>
              <div className="flex justify-between border-t border-slate-100 pt-2 text-lg font-semibold">
                <span>Tổng</span><span>{money(currentQuote.total)}</span>
              </div>
            </>
          ) : currentQuoteError ? <div><ErrorText>{currentQuoteError}</ErrorText>
            <button type="button" className="btn-outline mt-2" disabled={controlsDisabled} onClick={() => setQuoteRetry(value => value + 1)}>Thử lại báo giá</button></div> : (
            <p className="text-sm text-slate-500">{step === 0 ? 'Nhập thông tin hành khách để xem giá chi tiết.' : 'Đang cập nhật bảng giá…'}</p>
          )}
        </div>
      </aside>

      <nav aria-label="Điều hướng đặt vé" className="fixed inset-x-0 bottom-0 z-40 order-3 lg:col-span-3 border-t border-slate-200 bg-white px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgb(15_23_42/0.06)] lg:static lg:rounded-xl lg:border lg:p-4 lg:shadow-none">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          {step > 0 && <button type="button" className="btn-outline min-h-11 flex-1 lg:flex-none" disabled={controlsDisabled} onClick={() => go(step - 1)}>Quay lại</button>}
          <span className="hidden text-sm text-slate-500 lg:ml-auto lg:block">Bước {step + 1} / {STEPS.length}</span>
          <button type={step === 0 ? 'submit' : 'button'} form={step === 0 ? 'booking-passengers' : undefined}
            className="btn min-h-11 flex-1 lg:flex-none" disabled={controlsDisabled || (step === 0 && airportsLoading) || (step === 3 && !currentQuote)}
            onClick={step === 0 ? undefined : step === 3 ? submit : () => go(step + 1)}>
            {busy || selectionBusy ? 'Đang xử lý…' : step === 0 && airportsLoading ? 'Đang tải hành trình…' : step === 3 ? 'Đặt chỗ' : 'Tiếp tục'}
          </button>
        </div>
      </nav>
    </div>
  )
}
