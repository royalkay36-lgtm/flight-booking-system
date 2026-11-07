import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { api, CABIN, fmtDate, fmtTime, FLIGHT_STATUS, hourOf, isoDate, money } from '../api.js'
import { Badge, ErrorText } from '../ui.jsx'

const SLOTS = { '': 'Cả ngày', '0-12': 'Sáng (00–12h)', '12-18': 'Chiều (12–18h)', '18-24': 'Tối (18–24h)' }
const inSlot = (iso, slot) => {
  if (!slot) return true
  const [from, to] = slot.split('-').map(Number)
  const h = hourOf(iso)
  return h >= from && h < to
}

// Gom các dòng (chuyến x hạng vé) thành chuyến bay kèm danh sách hạng vé
const groupFlights = (rows) =>
  Object.values(rows.reduce((m, r) => ((m[r.flight_id] ??= { ...r, fares: [] }).fares.push(r), m), {}))

// Tính thời lượng bay từ giờ khởi hành và giờ hạ cánh (định dạng "Xh Ym")
function formatFlightDuration(dep, arr) {
  if (!dep || !arr) return ''
  const m = Math.max(0, Math.round((new Date(arr) - new Date(dep)) / 60000))
  const h = Math.floor(m / 60)
  const mins = m % 60
  if (h > 0 && mins > 0) return `${h}h ${mins}m`
  if (h > 0) return `${h}h`
  return `${mins}m`
}

// Dữ liệu tạm cho điều kiện đổi vé và hoàn vé (khi API v_flight_search chưa cung cấp trực tiếp)
const DEFAULT_FARE_POLICIES = {
  ECO_SAVER: {
    carry_on: '7 kg',
    checked: 'Chưa bao gồm',
    change: 'Được đổi (phí 500.000 ₫ + chênh lệch giá)',
    refund: 'Không được hoàn vé',
  },
  ECO_FLEX: {
    carry_on: '10 kg',
    checked: '23 kg',
    change: 'Đổi miễn phí (+ chênh lệch giá nếu có)',
    refund: 'Hoàn vé có phí 300.000 ₫',
  },
  BUS_FLEX: {
    carry_on: '18 kg (2 kiện)',
    checked: '32 kg',
    change: 'Đổi miễn phí (+ chênh lệch giá nếu có)',
    refund: 'Hoàn vé miễn phí',
  },
}

function getFareClassPolicy(fare) {
  const policy = DEFAULT_FARE_POLICIES[fare.fare_class] || {}
  const isBusiness = fare.cabin_class === 'BUSINESS'
  return {
    carry_on: fare.carry_on_kg != null ? `${fare.carry_on_kg} kg` : (policy.carry_on || (isBusiness ? '18 kg' : '7 kg')),
    checked: fare.checked_baggage_kg != null
      ? (Number(fare.checked_baggage_kg) > 0 ? `${fare.checked_baggage_kg} kg` : 'Chưa bao gồm')
      : (policy.checked || (isBusiness ? '32 kg' : 'Chưa bao gồm')),
    change: policy.change || (isBusiness ? 'Đổi miễn phí (+ chênh lệch giá nếu có)' : 'Được đổi (có phí + chênh lệch giá)'),
    refund: policy.refund || (isBusiness ? 'Hoàn vé miễn phí' : 'Không hoàn vé'),
  }
}

// Hiển thị logo hãng hoặc chữ cái đầu trong ô tròn thay thế
function AirlineLogo({ code, name }) {
  const [failed, setFailed] = useState(false)
  const initial = name?.trim()?.charAt(0)?.toUpperCase() || code?.charAt(0) || 'B'

  const badgeBg = {
    VN: 'bg-[#005a87] text-white',
    VJ: 'bg-[#ee0000] text-white',
    QH: 'bg-[#007f3e] text-white',
  }[code] || 'bg-brand-strong text-white'

  if (!failed) {
    return (
      <img
        src={`/images/airlines/${code?.toLowerCase()}.png`}
        alt={name || code}
        onError={() => setFailed(true)}
        className="h-10 w-10 flex-none rounded-full object-contain border border-line bg-white p-1"
      />
    )
  }

  return (
    <div
      className={`grid h-10 w-10 flex-none place-items-center rounded-full font-bold text-base shadow-xs select-none ${badgeBg}`}
      aria-hidden="true"
    >
      {initial}
    </div>
  )
}

// Lịch giá rẻ: giá thấp nhất mỗi ngày quanh ngày đang chọn; bấm để đổi ngày
function FareStrip({ leg, seats, onPick }) {
  const [days, setDays] = useState([])
  useEffect(() => {
    const from = new Date(leg.date)
    from.setDate(from.getDate() - 3)
    const start = isoDate(from) < isoDate() ? isoDate() : isoDate(from)
    api('/flights/fare-calendar?' + new URLSearchParams({ ...leg, date_from: start, days: 7, passengers: seats }))
      .then((rows) => {
        const prices = Object.fromEntries(rows.map((r) => [r.date, r.min_price]))
        setDays(Array.from({ length: 7 }, (_, i) => {
          const d = new Date(start)
          d.setDate(d.getDate() + i)
          return { date: isoDate(d), price: prices[isoDate(d)] }
        }))
      }).catch(() => { })
  }, [leg.origin, leg.destination, leg.date, seats]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="grid grid-cols-7 gap-1 text-center text-xs">
      {days.map((d) => (
        <button key={d.date} type="button" disabled={!d.price} onClick={() => onPick(d.date)}
          aria-current={d.date === leg.date ? 'date' : undefined}
          className={`rounded-lg border px-1 py-2 disabled:opacity-40 cursor-pointer ${d.date === leg.date ? 'border-sky-600 bg-sky-50 font-semibold' : 'border-slate-200 bg-white hover:border-sky-400'}`}>
          <div>{new Date(d.date).toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' })}</div>
          <div className="text-sky-700">{d.price ? `${Math.round(Number(d.price) / 1000)}k` : '—'}</div>
        </button>
      ))}
    </div>
  )
}

export default function Results() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const q = Object.fromEntries(params)
  const adults = Number(q.adults ?? q.passengers ?? 1)
  const children = Number(q.children ?? 0)
  const infants = Number(q.infants ?? 0)
  const seatsNeeded = adults + children
  const legs = [
    { origin: q.origin, destination: q.destination, date: q.date },
    ...(q.returnDate ? [{ origin: q.destination, destination: q.origin, date: q.returnDate }] : []),
  ]
  const [results, setResults] = useState(null)
  const [error, setError] = useState('')
  const [picked, setPicked] = useState([])
  const [expandedFlightIds, setExpandedFlightIds] = useState(new Set())
  const [filter, setFilter] = useState({ airlines: [], cabin: '', maxPrice: '', dep: '', arr: '' })
  const setF = (k) => (e) => setFilter({ ...filter, [k]: e.target.value })

  const toggleExpand = (id) => {
    setExpandedFlightIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  useEffect(() => {
    setResults(null)
    setPicked([])
    Promise.all(legs.map((l) => api('/flights/search?' + new URLSearchParams({ ...l, passengers: seatsNeeded }))))
      .then(setResults)
      .catch((e) => setError(e.message))
  }, [params.toString()]) // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <ErrorText>{error}</ErrorText>
  if (!results) return <p>Đang tìm chuyến bay…</p>

  const airlines = [...new Map(results.flat().map((r) => [r.airline_code, r.airline_name])).entries()]
  const visible = (rows) => groupFlights(rows.filter((r) =>
    (!filter.airlines.length || filter.airlines.includes(r.airline_code)) &&
    (!filter.cabin || r.cabin_class === filter.cabin) &&
    (!filter.maxPrice || Number(r.price) <= Number(filter.maxPrice)) &&
    inSlot(r.departure_time, filter.dep) &&
    inSlot(r.arrival_time, filter.arr)))

  const toggleAirline = (code) => setFilter({
    ...filter,
    airlines: filter.airlines.includes(code) ? filter.airlines.filter((a) => a !== code) : [...filter.airlines, code],
  })

  const proceed = () => {
    sessionStorage.setItem('selection', JSON.stringify({ legs: picked, adults, children, infants }))
    navigate('/booking')
  }

  return (
    <div className="grid gap-6 lg:grid-cols-4">
      <aside className="card h-fit space-y-4">
        <h2 className="font-semibold">Bộ lọc</h2>
        <fieldset>
          <legend className="label">Hãng bay</legend>
          {airlines.map(([code, name]) => (
            <label key={code} className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={filter.airlines.includes(code)} onChange={() => toggleAirline(code)} /> {name}
            </label>
          ))}
        </fieldset>
        <label className="block"><span className="label">Hạng vé</span>
          <select className="input" value={filter.cabin} onChange={setF('cabin')}>
            <option value="">Tất cả</option>
            {Object.entries(CABIN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="block"><span className="label">Giá tối đa (₫)</span>
          <input type="number" min={0} step={100000} className="input" value={filter.maxPrice} onChange={setF('maxPrice')} />
        </label>
        {[['dep', 'Giờ cất cánh'], ['arr', 'Giờ hạ cánh']].map(([k, label]) => (
          <label key={k} className="block"><span className="label">{label}</span>
            <select className="input" value={filter[k]} onChange={setF(k)}>
              {Object.entries(SLOTS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        ))}
      </aside>

      <div className="space-y-6 lg:col-span-3">
        {legs.map((leg, i) => {
          const flights = visible(results[i])
          // Tính giá vé thấp nhất trong số các chuyến đang hiển thị ở chặng này
          const minPriceInLeg = flights.length > 0
            ? Math.min(...flights.map((fl) => Math.min(...fl.fares.map((fr) => Number(fr.price)))))
            : Infinity

          return (
            <section key={i} className="space-y-3">
              <h2 className="text-lg font-semibold">
                {i === 0 ? 'Chiều đi' : 'Chiều về'}: {leg.origin} → {leg.destination} · {fmtDate(leg.date)}
              </h2>
              <FareStrip leg={leg} seats={seatsNeeded}
                onPick={(d) => setParams({ ...q, [i === 0 ? 'date' : 'returnDate']: d })} />
              {!flights.length && <p className="text-sm text-slate-500">Không có chuyến bay phù hợp.</p>}

              {flights.map((f) => {
                const flightMinPrice = Math.min(...f.fares.map((fr) => Number(fr.price)))
                const isCheapest = flightMinPrice === minPriceInLeg
                const isExpanded = expandedFlightIds.has(f.flight_id)
                const isSelectedFlight = picked[i]?.flight_id === f.flight_id

                return (
                  <div
                    key={f.flight_id}
                    className={`card transition-all ${isSelectedFlight ? 'border-brand ring-1 ring-brand/30 shadow-md' : 'hover:border-control hover:shadow-sm'
                      }`}
                  >
                    {/* Hàng thông tin chính của chuyến bay (bấm để mở rộng/thu gọn) */}
                    <div
                      role="button"
                      tabIndex={0}
                      aria-expanded={isExpanded}
                      aria-controls={`fare-details-${f.flight_id}`}
                      onClick={(e) => {
                        // Không kích hoạt toggle nếu click trúng nút con
                        if (e.target.closest('button')) return
                        toggleExpand(f.flight_id)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          if (e.target.closest('button')) return
                          e.preventDefault()
                          toggleExpand(f.flight_id)
                        }
                      }}
                      className="cursor-pointer space-y-3.5 outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-xl"
                    >
                      {/* Tầng 1: Hãng bay, số hiệu, nhãn Rẻ nhất & Trạng thái */}
                      <div className="flex items-center justify-between gap-3 border-b border-rule pb-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <AirlineLogo code={f.airline_code} name={f.airline_name} />
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <span className="font-bold text-ink text-base whitespace-nowrap">{f.airline_name}</span>
                            <span className="text-meta text-muted font-medium whitespace-nowrap">· {f.flight_number}</span>
                            {isCheapest && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 border border-emerald-200 px-2.5 py-0.5 text-xs font-bold text-emerald-800 shadow-2xs whitespace-nowrap">
                                ★ Rẻ&nbsp;nhất
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {f.status !== 'SCHEDULED' && <Badge map={FLIGHT_STATUS} value={f.status} />}
                          {isSelectedFlight && (
                            <span className="text-xs font-semibold text-brand whitespace-nowrap hidden sm:inline">
                              ✓ Đã chọn {picked[i].fare_name}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Tầng 2: Giờ đi, thời lượng, giờ đến & Cụm Giá tiền + Nút Chi tiết */}
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-1">
                        {/* Lộ trình bay */}
                        <div className="flex items-center gap-4 sm:gap-7 min-w-0">
                          <div className="text-left shrink-0">
                            <div className="text-2xl sm:text-3xl font-bold text-ink num whitespace-nowrap leading-none">
                              {fmtTime(f.departure_time)}
                            </div>
                            <div className="text-sm font-semibold text-muted mt-1 whitespace-nowrap">
                              {f.origin}
                            </div>
                          </div>

                          <div className="flex flex-col items-center px-2 min-w-[110px] sm:min-w-[140px] shrink-0">
                            <span className="text-xs font-medium text-muted num whitespace-nowrap">
                              {formatFlightDuration(f.departure_time, f.arrival_time)}
                            </span>
                            <div className="relative my-1.5 flex w-full items-center">
                              <div className="h-0.5 w-full bg-control" />
                              <span className="absolute left-1/2 -translate-x-1/2 text-brand text-xs select-none">✈</span>
                            </div>
                            <span className="text-meta text-emerald-700 font-medium whitespace-nowrap">
                              {f.stops > 0 ? `${f.stops} điểm dừng` : 'Bay thẳng'}
                            </span>
                          </div>

                          <div className="text-left shrink-0">
                            <div className="text-2xl sm:text-3xl font-bold text-ink num whitespace-nowrap leading-none">
                              {fmtTime(f.arrival_time)}
                            </div>
                            <div className="text-sm font-semibold text-muted mt-1 whitespace-nowrap">
                              {f.destination}
                            </div>
                          </div>
                        </div>

                        {/* Giá tiền nổi bật & Nút Chi tiết cùng trên 1 hàng */}
                        <div className="flex items-center justify-between sm:justify-end gap-3 pt-3 sm:pt-0 border-t border-rule sm:border-t-0 shrink-0">
                          <div className="flex items-baseline gap-1.5 whitespace-nowrap shrink-0">
                            <span className="text-xs text-muted whitespace-nowrap">Giá từ</span>
                            <span className="text-xl sm:text-2xl font-bold text-brand-strong num leading-none whitespace-nowrap">
                              {money(flightMinPrice).replace(' ', '\u00A0')}
                            </span>
                          </div>

                          <button
                            type="button"
                            aria-expanded={isExpanded}
                            aria-controls={`fare-details-${f.flight_id}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleExpand(f.flight_id)
                            }}
                            className={`h-9 cursor-pointer rounded-full border px-4 text-sm font-semibold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${isExpanded
                                ? 'border-brand bg-brand-wash text-brand-strong'
                                : 'border-control bg-white text-ink hover:border-brand hover:bg-brand-wash'
                              }`}
                          >
                            <span className="whitespace-nowrap">{isExpanded ? 'Thu\u00A0gọn' : 'Chi\u00A0tiết'}</span>
                            <span
                              className="text-xs transition-transform duration-200 select-none shrink-0"
                              style={{ transform: isExpanded ? 'rotate(180deg)' : 'none' }}
                            >
                              ▼
                            </span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Phần chi tiết các hạng vé mở rộng ngay bên dưới thẻ */}
                    {isExpanded && (
                      <div
                        id={`fare-details-${f.flight_id}`}
                        className="mt-4 border-t border-line pt-4"
                      >
                        <div className="mb-3 flex items-center justify-between">
                          <h3 className="font-semibold text-ink text-ui">Chọn hạng vé cho chuyến bay này</h3>
                          <span className="text-meta text-muted">{f.fares.length} hạng vé có sẵn</span>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          {f.fares.map((fare) => {
                            const isSelected =
                              picked[i]?.flight_id === fare.flight_id &&
                              picked[i]?.fare_class === fare.fare_class
                            const policy = getFareClassPolicy(fare)

                            return (
                              <div
                                key={fare.fare_class}
                                className={`flex flex-col justify-between rounded-xl border p-4 transition-all ${isSelected
                                    ? 'border-brand bg-brand-wash ring-2 ring-brand-tint shadow-sm'
                                    : 'border-line bg-white hover:border-brand/50 hover:shadow-sm'
                                  }`}
                              >
                                <div>
                                  {/* Tiêu đề hạng vé */}
                                  <div className="flex items-start justify-between gap-2">
                                    <div>
                                      <h4 className="font-bold text-ink text-ui">{fare.fare_name}</h4>
                                      <span className="text-meta text-muted">
                                        {CABIN[fare.cabin_class] || fare.cabin_class}
                                      </span>
                                    </div>
                                    {isSelected && (
                                      <span className="inline-flex items-center rounded-full bg-brand-tint px-2 py-0.5 text-xs font-semibold text-brand-strong">
                                        Đang chọn
                                      </span>
                                    )}
                                  </div>

                                  {/* Giá tiền */}
                                  <div className="mt-3">
                                    <div className="text-lg font-bold text-brand-strong num whitespace-nowrap">
                                      {money(fare.price).replace(' ', '\u00A0')}
                                    </div>
                                    <span className="text-meta text-muted">/ khách</span>
                                  </div>

                                  {/* Danh sách quyền lợi / điều kiện vé */}
                                  <ul className="mt-3.5 space-y-2 border-t border-rule pt-3 text-meta">
                                    <li className="flex items-center gap-2 text-ink">
                                      <span className="text-muted" title="Hành lý xách tay">🎒</span>
                                      <span>Xách tay: <strong>{policy.carry_on}</strong></span>
                                    </li>
                                    <li className="flex items-center gap-2 text-ink">
                                      <span className="text-muted" title="Hành lý ký gửi">🧳</span>
                                      <span>Ký gửi: <strong>{policy.checked}</strong></span>
                                    </li>
                                    <li className="flex items-start gap-2 text-ink">
                                      <span className="text-muted mt-0.5" title="Điều kiện đổi vé">🔄</span>
                                      <span>Đổi vé: <span>{policy.change}</span></span>
                                    </li>
                                    <li className="flex items-start gap-2 text-ink">
                                      <span className="text-muted mt-0.5" title="Điều kiện hoàn vé">💵</span>
                                      <span>Hoàn vé: <span>{policy.refund}</span></span>
                                    </li>
                                  </ul>
                                </div>

                                {/* Nút chọn hạng vé & số ghế trống */}
                                <div className="mt-4 pt-3 border-t border-rule flex items-center justify-between gap-2">
                                  <span className="text-meta text-muted">
                                    Còn <strong className="text-ink num">{fare.seats_available}</strong> ghế
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setPicked(Object.assign([...picked], { [i]: fare }))}
                                    className={`btn h-8 px-4 text-xs font-semibold ${isSelected ? 'bg-brand-strong text-white' : 'btn-outline'
                                      }`}
                                  >
                                    {isSelected ? '✓ Đã chọn' : 'Chọn hạng vé'}
                                  </button>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </section>
          )
        })}

        <div className="flex justify-end">
          <button className="btn" disabled={legs.some((_, i) => !picked[i])} onClick={proceed}>
            Tiếp tục chọn ghế
          </button>
        </div>
      </div>
    </div>
  )
}
