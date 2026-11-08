import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { api, CABIN, fmtDate, fmtTime, FLIGHT_STATUS, hourOf, isoDate, money } from '../api.js'
import { Badge, ErrorText } from '../ui.jsx'
import DestinationBanner from '../components/DestinationBanner.jsx'

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

const DEFAULT_FILTER = { airlines: [], cabin: '', maxPrice: '', dep: '', arr: '' }

// Sắp xếp: so sánh bằng số (giá, mốc thời gian ms, phút), hoà thì xếp theo giá tăng dần
const SORTS = { price: 'Giá thấp nhất', dep: 'Giờ đi sớm nhất', duration: 'Thời lượng ngắn nhất' }
const minFare = (f) => Math.min(...f.fares.map((fr) => Number(fr.price)))
const depMs = (f) => new Date(f.departure_time).getTime()
const durationMin = (f) => (new Date(f.arrival_time).getTime() - depMs(f)) / 60000
const SORT_KEY = { price: minFare, dep: depMs, duration: durationMin }
// Trả về bản sao đã sắp xếp, không đụng tới mảng gốc
const sortFlights = (flights, by) => {
  const key = SORT_KEY[by] ?? minFare
  return [...flights].sort((a, b) => (key(a) - key(b)) || (minFare(a) - minFare(b)))
}

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

// Tính khoảng cách ngày lịch (YYYY-MM-DD) theo UTC để không lệch múi giờ
function parseYMD(ymd) {
  const [y, m, d] = String(ymd).split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

function dayDiff(a, b) {
  return Math.round((parseYMD(a) - parseYMD(b)) / 86400000)
}

function shiftYMD(ymd, deltaDays) {
  const [y, m, d] = String(ymd).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + deltaDays)).toISOString().slice(0, 10)
}

function fmtShortDay(ymd) {
  const [y, m, d] = String(ymd).split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  const wd = dow === 0 ? 'CN' : `T${dow + 1}`
  return `${wd}, ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`
}

function fmtAriaDay(ymd, price) {
  const [, m, d] = String(ymd).split('-').map(Number)
  const formattedPrice = Math.round(Number(price)).toLocaleString('vi-VN')
  return `Tìm chuyến ngày ${d} tháng ${m}, giá từ ${formattedPrice} đồng`
}

// Chọn tối đa 3 ngày CÓ chuyến trong khoảng ±7 ngày quanh ngày tìm kiếm (gần nhất trước; hoà thì rẻ hơn trước)
function pickSuggestedDays(rows, targetDate) {
  if (!Array.isArray(rows) || !targetDate) return []
  return rows
    .filter((r) => {
      if (!r?.date || r.date === targetDate) return false
      const price = Number(r.min_price ?? r.price)
      if (!Number.isFinite(price) || price <= 0) return false
      const diff = Math.abs(dayDiff(r.date, targetDate))
      return diff >= 1 && diff <= 7
    })
    .map((r) => ({ date: r.date, min_price: Number(r.min_price ?? r.price) }))
    .sort((a, b) => {
      const da = Math.abs(dayDiff(a.date, targetDate))
      const db = Math.abs(dayDiff(b.date, targetDate))
      return (da - db) || (a.min_price - b.min_price) || a.date.localeCompare(b.date)
    })
    .slice(0, 3)
}

const SHIMMER_CSS = `
@keyframes skyShimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
.skeleton-shimmer {
  background-color: #e2e9f0;
  background-image: linear-gradient(90deg, #e2e9f0 0%, #f4f8fb 50%, #e2e9f0 100%);
  background-size: 200% 100%;
  animation: skyShimmer 1.5s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) {
  .skeleton-shimmer {
    animation: none !important;
    background-image: none !important;
  }
}
`

// Thẻ khung xương (skeleton) có bố cục 2 tầng khớp thẻ chuyến bay thật để không nhảy giao diện
function FlightCardSkeleton() {
  return (
    <div className="card space-y-3.5" aria-hidden="true">
      {/* Tầng 1: Ô tròn logo + tên hãng & số hiệu */}
      <div className="flex items-center justify-between gap-3 border-b border-rule pb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 flex-none rounded-full skeleton-shimmer motion-reduce:animate-none" />
          <div className="flex items-center gap-2.5">
            <div className="h-4 w-32 rounded-md skeleton-shimmer motion-reduce:animate-none" />
            <div className="h-3.5 w-16 rounded-md skeleton-shimmer motion-reduce:animate-none" />
          </div>
        </div>
        <div className="h-4 w-16 rounded-full skeleton-shimmer motion-reduce:animate-none hidden sm:block" />
      </div>

      {/* Tầng 2: Hai khối giờ đi/đến với đường nối ở giữa + khối giá và nút */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-1">
        <div className="flex items-center gap-4 sm:gap-7 min-w-0">
          <div className="space-y-1.5 shrink-0">
            <div className="h-7 sm:h-8 w-16 rounded-md skeleton-shimmer motion-reduce:animate-none" />
            <div className="h-3.5 w-10 rounded-md skeleton-shimmer motion-reduce:animate-none" />
          </div>

          <div className="flex flex-col items-center px-2 min-w-[110px] sm:min-w-[140px] shrink-0">
            <div className="h-3 w-12 rounded-md skeleton-shimmer motion-reduce:animate-none" />
            <div className="my-2 h-0.5 w-full bg-rule" />
            <div className="h-3 w-16 rounded-md skeleton-shimmer motion-reduce:animate-none" />
          </div>

          <div className="space-y-1.5 shrink-0">
            <div className="h-7 sm:h-8 w-16 rounded-md skeleton-shimmer motion-reduce:animate-none" />
            <div className="h-3.5 w-10 rounded-md skeleton-shimmer motion-reduce:animate-none" />
          </div>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-3 pt-3 sm:pt-0 border-t border-rule sm:border-t-0 shrink-0">
          <div className="h-6 sm:h-7 w-28 rounded-md skeleton-shimmer motion-reduce:animate-none" />
          <div className="h-9 w-24 rounded-full skeleton-shimmer motion-reduce:animate-none" />
        </div>
      </div>
    </div>
  )
}

// Khối thông báo khi không có chuyến bay (phân biệt rỗng do bộ lọc vs rỗng do ngày tìm kiếm)
function EmptyFlightsState({ hasUnfilteredFlights, suggestedDays, onClearFilter, onPickDate, onChangeSearchDate }) {
  const minSuggestedPrice =
    suggestedDays.length > 0 ? Math.min(...suggestedDays.map((d) => d.min_price)) : Infinity

  return (
    <div role="status" className="card py-8 text-center space-y-4">
      <div className="space-y-1.5">
        <h3 className="text-lead font-semibold text-ink">Không tìm thấy chuyến bay</h3>
        {hasUnfilteredFlights ? (
          <p className="text-ui text-muted">Không có chuyến nào khớp bộ lọc</p>
        ) : (
          <p className="text-ui text-muted">Không có chuyến bay vào ngày này</p>
        )}
      </div>

      {hasUnfilteredFlights ? (
        <div>
          <button type="button" className="btn-outline cursor-pointer" onClick={onClearFilter}>
            Xóa bộ lọc
          </button>
        </div>
      ) : suggestedDays.length > 0 ? (
        <div className="mx-auto max-w-xl space-y-3 pt-2">
          <h4 className="text-meta font-semibold text-muted">Ngày gần nhất còn chuyến</h4>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {suggestedDays.map((d) => {
              const isCheapestDay = d.min_price === minSuggestedPrice
              return (
                <button
                  key={d.date}
                  type="button"
                  aria-label={fmtAriaDay(d.date, d.min_price)}
                  onClick={() => onPickDate(d.date)}
                  className="flex flex-col items-center justify-center gap-1 rounded-xl border border-line bg-white px-4 py-3.5 text-center transition-all cursor-pointer hover:border-brand hover:bg-brand-wash focus-visible:outline-2 focus-visible:outline-brand"
                >
                  {isCheapestDay && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 border border-emerald-200 px-2 py-0.5 text-xs font-bold text-emerald-800 whitespace-nowrap">
                      ★ Rẻ nhất
                    </span>
                  )}
                  <span className="font-semibold text-ink text-ui num whitespace-nowrap">
                    {fmtShortDay(d.date)}
                  </span>
                  <span className="font-bold text-brand-strong text-ui num whitespace-nowrap">
                    {money(d.min_price)}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <div>
          <button type="button" className="btn-outline cursor-pointer" onClick={onChangeSearchDate}>
            Đổi ngày tìm kiếm
          </button>
        </div>
      )}
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
  const [suggestedByLeg, setSuggestedByLeg] = useState([])
  const [error, setError] = useState('')
  const [picked, setPicked] = useState([])
  const [expandedFlightIds, setExpandedFlightIds] = useState(new Set())
  const [filter, setFilter] = useState(DEFAULT_FILTER)
  const setF = (k) => (e) => setFilter({ ...filter, [k]: e.target.value })
  const [sortBy, setSortBy] = useState('price')

  // Ngăn kéo bộ lọc trên điện thoại (< 768px)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const drawerRef = useRef(null)
  const filterBtnRef = useRef(null)
  const wasOpen = useRef(false)
  useEffect(() => {
    if (drawerOpen) {
      wasOpen.current = true
      const prevOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'          // khoá cuộn nền phía sau
      drawerRef.current?.focus({ preventScroll: true })
      const onKey = (e) => { if (e.key === 'Escape') setDrawerOpen(false) }
      // Màn hình được nới rộng thành >= 768px thì đóng ngăn kéo để không kẹt khoá cuộn
      const mq = window.matchMedia('(min-width: 768px)')
      const onWide = (e) => { if (e.matches) setDrawerOpen(false) }
      document.addEventListener('keydown', onKey)
      mq.addEventListener('change', onWide)
      return () => {
        document.body.style.overflow = prevOverflow
        document.removeEventListener('keydown', onKey)
        mq.removeEventListener('change', onWide)
      }
    }
    if (wasOpen.current) {                             // vừa đóng: trả focus về nút "Bộ lọc"
      wasOpen.current = false
      filterBtnRef.current?.focus()
    }
  }, [drawerOpen])

  const toggleExpand = (id) => {
    setExpandedFlightIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  useEffect(() => {
    let cancelled = false
    setResults(null)
    setSuggestedByLeg([])
    setPicked([])
    Promise.all(
      legs.map(async (l) => {
        const rows = await api('/flights/search?' + new URLSearchParams({ ...l, passengers: seatsNeeded }))
        if (rows.length > 0 || !l.date) return { rows, suggested: [] }
        const cal = await api(
          '/flights/fare-calendar?' +
            new URLSearchParams({
              origin: l.origin,
              destination: l.destination,
              date_from: shiftYMD(l.date, -7),
              days: 15,
              passengers: seatsNeeded,
            })
        ).catch(() => [])
        return { rows, suggested: pickSuggestedDays(cal, l.date) }
      })
    )
      .then((data) => {
        if (cancelled) return
        setSuggestedByLeg(data.map((d) => d.suggested))
        setResults(data.map((d) => d.rows))
      })
      .catch((e) => {
        if (!cancelled) setError(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [params.toString()]) // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <ErrorText>{error}</ErrorText>

  const isLoading = !results
  const airlines = results ? [...new Map(results.flat().map((r) => [r.airline_code, r.airline_name])).entries()] : []
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

  const changeLegDate = (legIndex, newDate) => {
    setResults(null)
    setPicked([])
    setParams({ ...q, [legIndex === 0 ? 'date' : 'returnDate']: newDate })
  }

  const proceed = () => {
    sessionStorage.setItem('selection', JSON.stringify({ legs: picked, adults, children, infants }))
    navigate('/booking')
  }

  // Danh sách hiển thị mỗi chặng = lọc trước, rồi sắp xếp (bản sao)
  const filteredByLeg = results ? legs.map((_, i) => visible(results[i])) : legs.map(() => [])
  const resultCount = filteredByLeg.reduce((n, fl) => n + fl.length, 0)
  const activeFilterCount = (filter.airlines.length > 0) + !!filter.cabin + !!filter.maxPrice + !!filter.dep + !!filter.arr

  // Các điều khiển lọc hiện có, dùng chung cho cột bên (>= 768px) và ngăn kéo (< 768px)
  const filterControls = (
    <>
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
    </>
  )

  return (
    <div className="grid gap-6 lg:grid-cols-4">
      <style>{SHIMMER_CSS}</style>
      <aside className="card h-fit space-y-4 hidden md:block">
        <h2 className="font-semibold">Bộ lọc</h2>
        {filterControls}
      </aside>

      {/* Ngăn kéo bộ lọc trên điện thoại: lớp phủ + bảng trượt từ trái */}
      <div className="md:hidden">
        <div
          aria-hidden="true"
          onClick={() => setDrawerOpen(false)}
          className={`fixed inset-0 z-40 bg-[rgba(8,12,16,0.5)] transition-opacity duration-300 ${drawerOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        />
        <div
          ref={drawerRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="filter-drawer-title"
          tabIndex={-1}
          inert={!drawerOpen}
          className={`fixed inset-y-0 left-0 z-50 flex w-[85%] max-w-sm flex-col bg-surface shadow-2xl outline-none transition-transform duration-300 ease-out ${drawerOpen ? 'translate-x-0' : '-translate-x-full'}`}
        >
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 id="filter-drawer-title" className="text-lead font-semibold">Bộ lọc</h2>
            <button type="button" aria-label="Đóng bộ lọc" onClick={() => setDrawerOpen(false)}
              className="-m-1 grid h-11 w-11 cursor-pointer place-items-center rounded-full text-muted hover:bg-ground hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
              <span aria-hidden="true" className="text-xl leading-none">×</span>
            </button>
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
            {filterControls}
          </div>
          <div className="flex gap-3 border-t border-line px-5 py-4">
            <button type="button" className="btn-outline h-10 flex-1" onClick={() => setFilter(DEFAULT_FILTER)}>
              Xóa bộ lọc
            </button>
            <button type="button" className="btn flex-1" onClick={() => setDrawerOpen(false)}>
              Xem {resultCount} chuyến
            </button>
          </div>
        </div>
      </div>

      <div className="min-w-0 space-y-6 lg:col-span-3">
        {/* Banner điểm đến (component của B, tự ẩn khi không có dữ liệu) */}
        <DestinationBanner destination={q.destination} />

        {/* Thanh công cụ: nút Bộ lọc (chỉ điện thoại) + sắp xếp */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button ref={filterBtnRef} type="button" onClick={() => setDrawerOpen(true)}
            aria-haspopup="dialog" aria-expanded={drawerOpen}
            className="btn-outline md:hidden">
            Bộ lọc{activeFilterCount > 0 && ` (${activeFilterCount})`}
          </button>
          <label className="ml-auto flex items-center gap-2">
            <span className="whitespace-nowrap text-meta text-muted">Sắp xếp theo</span>
            <select
              className="input w-auto disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isLoading}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              {Object.entries(SORTS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
        </div>

        {legs.map((leg, i) => {
          const filtered = filteredByLeg[i]
          // "Rẻ nhất" tính trên danh sách đã lọc, không phụ thuộc cách sắp xếp
          const minPriceInLeg = filtered.length > 0 ? Math.min(...filtered.map(minFare)) : Infinity
          const flights = sortFlights(filtered, sortBy)
          const hasUnfilteredFlights = !isLoading && (results[i]?.length ?? 0) > 0

          return (
            <section key={i} className="space-y-3">
              <h2 className="text-lg font-semibold">
                {i === 0 ? 'Chiều đi' : 'Chiều về'}: {leg.origin} → {leg.destination} · {fmtDate(leg.date)}
              </h2>
              <FareStrip leg={leg} seats={seatsNeeded}
                onPick={(d) => changeLegDate(i, d)} />

              <div aria-busy={isLoading} className="space-y-3">
                {isLoading && (
                  <>
                    <span className="sr-only">Đang tìm chuyến bay…</span>
                    {Array.from({ length: 5 }, (_, idx) => (
                      <FlightCardSkeleton key={idx} />
                    ))}
                  </>
                )}

                {!isLoading && !flights.length && (
                  <EmptyFlightsState
                    hasUnfilteredFlights={hasUnfilteredFlights}
                    suggestedDays={suggestedByLeg[i] ?? []}
                    onClearFilter={() => setFilter(DEFAULT_FILTER)}
                    onPickDate={(d) => changeLegDate(i, d)}
                    onChangeSearchDate={() => navigate('/')}
                  />
                )}

                {!isLoading && flights.map((f) => {
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
                      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-4 pt-1">
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
                        <div className="flex items-center justify-between sm:ml-auto sm:justify-end gap-3 pt-3 sm:pt-0 border-t border-rule sm:border-t-0 shrink-0">
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
                                <div className="mt-4 pt-3 border-t border-rule flex flex-wrap items-center justify-between gap-2">
                                  <span className="text-meta text-muted">
                                    Còn <strong className="text-ink num">{fare.seats_available}</strong> ghế
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setPicked(Object.assign([...picked], { [i]: fare }))}
                                    className={`btn ml-auto h-8 shrink-0 whitespace-nowrap px-4 text-xs font-semibold ${isSelected ? 'bg-brand-strong text-white' : 'btn-outline'
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
              </div>
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
