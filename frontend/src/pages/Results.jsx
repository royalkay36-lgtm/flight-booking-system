import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { api, CABIN, duration, fmtDate, fmtTime, FLIGHT_STATUS, hourOf, isoDate, money } from '../api.js'
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
      }).catch(() => {})
  }, [leg.origin, leg.destination, leg.date, seats]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="grid grid-cols-7 gap-1 text-center text-xs">
      {days.map((d) => (
        <button key={d.date} type="button" disabled={!d.price} onClick={() => onPick(d.date)}
          aria-current={d.date === leg.date ? 'date' : undefined}
          className={`rounded-lg border px-1 py-2 disabled:opacity-40 ${d.date === leg.date ? 'border-sky-600 bg-sky-50 font-semibold' : 'border-slate-200 bg-white hover:border-sky-400'}`}>
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
  const [filter, setFilter] = useState({ airlines: [], cabin: '', maxPrice: '', dep: '', arr: '' })
  const setF = (k) => (e) => setFilter({ ...filter, [k]: e.target.value })

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
            <label key={code} className="flex items-center gap-2 text-sm">
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
          return (
            <section key={i} className="space-y-3">
              <h2 className="text-lg font-semibold">
                {i === 0 ? 'Chiều đi' : 'Chiều về'}: {leg.origin} → {leg.destination} · {fmtDate(leg.date)}
              </h2>
              <FareStrip leg={leg} seats={seatsNeeded}
                onPick={(d) => setParams({ ...q, [i === 0 ? 'date' : 'returnDate']: d })} />
              {!flights.length && <p className="text-sm text-slate-500">Không có chuyến bay phù hợp.</p>}
              {flights.map((f) => (
                <div key={f.flight_id} className="card flex flex-wrap items-center gap-4">
                  <div className="min-w-48">
                    <div className="text-xl font-semibold">{fmtTime(f.departure_time)} → {fmtTime(f.arrival_time)}</div>
                    <div className="text-sm text-slate-500">
                      {f.airline_name} · {f.flight_number} · {duration(f.departure_time, f.arrival_time)}
                    </div>
                    {f.status !== 'SCHEDULED' && <Badge map={FLIGHT_STATUS} value={f.status} />}
                  </div>
                  <div className="ml-auto flex flex-wrap gap-2">
                    {f.fares.map((fare) => {
                      const active = picked[i]?.flight_id === fare.flight_id && picked[i]?.fare_class === fare.fare_class
                      return (
                        <button key={fare.fare_class} type="button"
                          onClick={() => setPicked(Object.assign([...picked], { [i]: fare }))}
                          className={`rounded-lg border px-3 py-2 text-left text-sm ${active ? 'border-sky-600 bg-sky-50 ring-2 ring-sky-200' : 'border-slate-200 hover:border-sky-400'}`}>
                          <div className="font-medium">{fare.fare_name}</div>
                          <div className="text-base font-semibold text-sky-700">{money(fare.price)}</div>
                          <div className="text-xs text-slate-500">
                            {fare.checked_baggage_kg ? `${fare.checked_baggage_kg}kg ký gửi` : 'Không ký gửi'} · còn {fare.seats_available} ghế
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </section>
          )
        })}
        <div className="flex justify-end">
          <button className="btn" disabled={legs.some((_, i) => !picked[i])} onClick={proceed}>Tiếp tục chọn ghế</button>
        </div>
      </div>
    </div>
  )
}
