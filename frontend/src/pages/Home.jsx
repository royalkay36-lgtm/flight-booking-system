import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { api, fmtDate, isoDate } from '../api.js'
import { FlapText, PlaneMark, reducedMotion } from '../ui.jsx'

const TABS = { book: 'Mua vé', manage: 'Quản lý đặt chỗ', checkin: 'Làm thủ tục' }

const STEPS = [
  ['Tìm chuyến hợp ví', 'Lịch giá theo ngày cho thấy hôm nào bay rẻ hơn, lọc theo giờ bay và hãng.'],
  ['Chọn ghế bạn thích', 'Sơ đồ ghế theo từng loại máy bay; ghế được giữ riêng cho bạn 15 phút khi thanh toán.'],
  ['Nhận vé, làm thủ tục', 'Vé điện tử gửi qua email, làm thủ tục trực tuyến và nhận thẻ lên máy bay có mã QR.'],
]

export default function Home() {
  const [params, setParams] = useSearchParams()
  const tab = TABS[params.get('tab')] ? params.get('tab') : 'book'
  const [vouchers, setVouchers] = useState([])
  const [airports, setAirports] = useState([])
  const [trip, setTrip] = useState(null)        // giá trị hiện tại của form tìm chuyến
  const [intro, setIntro] = useState(0)          // vài thành phố lật qua lúc mở trang, rồi dừng ở điểm đến đã chọn
  useEffect(() => {
    api('/vouchers/public').then(setVouchers).catch(() => {})
    api('/airports').then(setAirports).catch(() => {})
  }, [])

  const cityOf = (code) => airports.find((a) => a.iata_code === code)?.city ?? code
  const introCities = trip ? airports.filter((a) => a.iata_code !== trip.origin && a.iata_code !== trip.destination).slice(0, 3).map((a) => a.city) : []
  useEffect(() => {
    if (intro === null || !introCities.length) return
    if (reducedMotion() || intro >= introCities.length) { setIntro(null); return }
    const id = setTimeout(() => setIntro(intro + 1), 1100)
    return () => clearTimeout(id)
  }, [intro, introCities.length])

  const onTrip = (t) => {
    if (trip && t.destination !== trip.destination) setIntro(null)   // người dùng tự chọn điểm đến thì thôi lật thử
    setTrip(t)
  }
  const destCity = trip && airports.length ? cityOf(trip.destination) : ''
  const headline = (intro !== null && introCities[intro]) || destCity

  return (
    <div>
      <section className="relative isolate overflow-hidden rounded-[28px] bg-[#0b3a5c] sm:rounded-[36px]">
        <img src="/images/canh-may-bay.jpg" alt="" className="settle absolute inset-0 -z-10 h-full w-full object-cover object-[62%_30%]" />
        {/* taste-skill-ignore: lớp phủ tối trên ảnh để chữ trắng đủ tương phản */}
        <div className="absolute inset-0 -z-10 bg-[rgba(6,38,64,0.62)] md:bg-[linear-gradient(100deg,rgba(6,38,64,0.85)_0%,rgba(6,38,64,0.6)_45%,rgba(6,38,64,0.05)_85%)]" />
        <div className="px-6 pb-36 pt-12 sm:px-12 sm:pb-40 sm:pt-16 lg:min-h-[540px]">
          <h1 className="rise max-w-3xl text-[clamp(32px,5.4vw,62px)] font-bold leading-[1.08] tracking-tight text-white">
            <span className="sr-only">Cất cánh tới {destCity || 'mọi điểm đến'}</span>
            <span aria-hidden="true" className="block">Cất cánh tới</span>
            <span className="mt-3 block min-h-[1.5em] text-[0.82em]">{headline && <FlapText text={headline.toLocaleUpperCase('vi')} />}</span>
          </h1>
          <p className="rise mt-6 max-w-lg text-[17px] leading-7 text-white/90 [animation-delay:120ms]">
            <b className="font-semibold text-white">Chạm để cất cánh.</b> Tìm chuyến, chọn ghế cạnh cửa sổ và nhận vé điện tử
            trong vài phút, bay khắp Việt Nam và châu Á.
          </p>
        </div>
        {trip && airports.length > 0 && <TripPreview trip={trip} cityOf={cityOf} />}
      </section>

      <div className="rise relative z-10 mx-3 -mt-24 rounded-3xl border border-line bg-white p-5 shadow-[0_20px_40px_-28px_rgba(6,38,64,0.35)] [animation-delay:200ms] sm:mx-8 sm:-mt-28 sm:p-7">
        <div role="tablist" aria-label="Chọn việc cần làm" className="mb-6 grid grid-cols-3 rounded-full bg-ground p-1 sm:inline-grid sm:grid-flow-col sm:grid-cols-none">
          {Object.entries(TABS).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setParams(k === 'book' ? {} : { tab: k })}
              className={`min-h-9 rounded-full px-2 py-1.5 text-[13px] font-medium leading-tight transition-colors sm:px-5 sm:text-sm ${tab === k ? 'bg-white text-ink shadow-[0_1px_2px_rgba(15,23,32,0.08)]' : 'text-muted hover:text-ink'}`}>
              {label}
            </button>
          ))}
        </div>
        {/* SearchForm luôn được giữ (chỉ ẩn) để không mất lựa chọn khi đổi tab */}
        <div hidden={tab !== 'book'}><SearchForm airports={airports} onChange={onTrip} /></div>
        {tab !== 'book' && <LookupForm key={tab} checkin={tab === 'checkin'} />}
      </div>

      <section className="mt-20" aria-labelledby="steps-title">
        <h2 id="steps-title" className="reveal text-[26px] font-bold leading-tight tracking-tight">Từ lúc chọn chuyến đến lúc lên máy bay</h2>
        <p className="reveal mt-1 text-muted">Ba chặng, làm hết trên một trang, không cần ra quầy.</p>
        <div className="relative mt-10">
          <div className="absolute inset-x-0 top-3 hidden border-t-2 border-dashed border-control md:block" aria-hidden="true" />
          <span className="scroll-glide absolute -top-0.5 hidden h-7 w-7 place-items-center rounded-full bg-brand text-white md:grid" aria-hidden="true">
            <PlaneMark className="h-4 w-4" angle={90} />
          </span>
          <ol className="grid gap-8 border-l-2 border-dashed border-control pl-6 md:grid-cols-3 md:border-0 md:pl-0">
            {STEPS.map(([title, text], i) => (
              <li key={title} className="reveal relative md:pt-12">
                <span className="absolute -left-[33px] top-1 h-4 w-4 rounded-full border-4 border-ground bg-brand md:left-0 md:top-1" aria-hidden="true" />
                <h3 className="text-lg font-semibold"><span className="sr-only">Bước {i + 1}: </span>{title}</h3>
                <p className="mt-1 max-w-xs text-muted">{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {vouchers.length > 0 && (
        <section className="mt-20 space-y-5" aria-labelledby="deals-title">
          <div className="reveal">
            <h2 id="deals-title" className="text-[26px] font-bold leading-tight tracking-tight">Khuyến mãi đang diễn ra</h2>
            <p className="mt-1 text-muted">Nhập mã ở bước thanh toán để được giảm giá.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {vouchers.map((v) => (
              <div key={v.code} className="reveal relative flex overflow-hidden rounded-2xl border border-[#f3d9a4] bg-[#fffaf0]">
                <div className="flex w-36 flex-none flex-col justify-center border-r border-dashed border-[#e9c27a] px-4 py-5">
                  <span className="text-[13px] text-[#7a4a00]">Mã</span>
                  <span className="text-base font-bold tracking-[0.06em] text-[#7a4a00]">{v.code}</span>
                </div>
                <span className="absolute left-[136px] -top-2 h-4 w-4 rounded-full border border-[#f3d9a4] bg-ground" aria-hidden="true" />
                <span className="absolute -bottom-2 left-[136px] h-4 w-4 rounded-full border border-[#f3d9a4] bg-ground" aria-hidden="true" />
                <div className="min-w-0 flex-1 p-4">
                  <p className="text-[15px] font-medium">{v.description}</p>
                  <p className="mt-1 text-[13px] text-muted">Hạn dùng đến {fmtDate(v.valid_to)}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

// Thẻ xem trước hành trình: đổi điểm đi/đến trong form thì máy bay bay lại từ đầu
const ARC = 'M 6 52 Q 96 -10 186 52'
function TripPreview({ trip, cityOf }) {
  const people = Number(trip.adults) + Number(trip.children) + Number(trip.infants)
  return (
    <div className="fade-in absolute bottom-36 right-8 hidden w-[400px] rounded-2xl bg-white/85 p-5 text-ink backdrop-blur-md [animation-delay:500ms] lg:block">
      <div className="flex items-center justify-between text-[13px] text-muted">
        <span>{trip.trip === 'round' ? 'Khứ hồi' : 'Một chiều'}</span>
        <span>{trip.date ? fmtDate(trip.date) : ''} · {people} khách</span>
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <div>
          <span className="block text-[28px] font-bold leading-none tracking-tight">{trip.origin}</span>
          <span className="text-[13px] text-muted">{cityOf(trip.origin)}</span>
        </div>
        <div key={trip.origin + trip.destination} className="relative mb-5 h-14 w-48 flex-none" aria-hidden="true">
          <svg viewBox="0 0 192 56" className="absolute inset-0 h-14 w-48 overflow-visible">
            <path d={ARC} fill="none" stroke="#cbd6e0" strokeWidth="2" strokeDasharray="4 5" />
            <path d={ARC} fill="none" stroke="#0284c7" strokeWidth="2" pathLength="1" strokeDasharray="1"
              style={{ animation: 'draw 2.6s var(--ease-in-out) both' }} />
          </svg>
          <span className="absolute left-0 top-0 grid h-6 w-6 place-items-center text-brand-strong"
            style={{ offsetPath: `path('${ARC}')`, offsetRotate: 'auto', animation: 'fly 2.6s var(--ease-in-out) both', offsetDistance: '100%' }}>
            <PlaneMark className="h-6 w-6" angle={90} />
          </span>
        </div>
        <div className="text-right">
          <span className="block text-[28px] font-bold leading-none tracking-tight">{trip.destination}</span>
          <span className="text-[13px] text-muted">{cityOf(trip.destination)}</span>
        </div>
      </div>
    </div>
  )
}

function SearchForm({ airports, onChange }) {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    trip: 'oneway', origin: 'HAN', destination: 'SGN',
    date: isoDate(new Date(Date.now() + 864e5)), returnDate: '', adults: 1, children: 0, infants: 0,
  })
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  useEffect(() => { onChange?.(form) }, [form])
  const sameAirport = form.origin === form.destination
  const tooMany = Number(form.adults) + Number(form.children) > 9

  const submit = (e) => {
    e.preventDefault()
    const { trip, returnDate, ...q } = form
    navigate('/search?' + new URLSearchParams(trip === 'round' ? { ...q, returnDate } : q))
  }

  const airportSelect = (k, label) => (
    <label className="block">
      <span className="label">{label}</span>
      <select className="input" value={form[k]} onChange={set(k)}>
        {airports.map((a) => <option key={a.iata_code} value={a.iata_code}>{a.city} ({a.iata_code})</option>)}
      </select>
    </label>
  )
  const counter = (k, label, min, max) => (
    <label className="block"><span className="label">{label}</span>
      <select className="input" value={form[k]} onChange={set(k)}>
        {Array.from({ length: max - min + 1 }, (_, i) => <option key={i}>{min + i}</option>)}
      </select>
    </label>
  )

  return (
    <form onSubmit={submit} className="space-y-5">
      <fieldset className="inline-flex gap-1 rounded-full border border-line p-1">
        <legend className="sr-only">Loại vé</legend>
        {[['oneway', 'Một chiều'], ['round', 'Khứ hồi']].map(([v, label]) => (
          <label key={v} className={`cursor-pointer rounded-full px-4 py-1.5 text-sm font-medium transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand ${form.trip === v ? 'bg-brand-tint text-brand-ink' : 'text-muted hover:text-ink'}`}>
            <input type="radio" name="trip" value={v} checked={form.trip === v} onChange={set('trip')} className="sr-only" /> {label}
          </label>
        ))}
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {airportSelect('origin', 'Điểm đi')}
        {airportSelect('destination', 'Điểm đến')}
        <label className="block"><span className="label">Ngày đi</span>
          <input type="date" className="input" required min={isoDate()} value={form.date} onChange={set('date')} />
        </label>
        <label className="block"><span className="label">Ngày về</span>
          <input type="date" className="input" disabled={form.trip !== 'round'} required={form.trip === 'round'}
                 min={form.date} value={form.returnDate} onChange={set('returnDate')} />
        </label>
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <div className="grid flex-1 grid-cols-3 gap-3 sm:max-w-md">
          {counter('adults', 'Người lớn', 1, 9)}
          {counter('children', 'Trẻ em 2–11', 0, 8)}
          {counter('infants', 'Em bé <2', 0, Number(form.adults))}
        </div>
        <button className="btn group h-12 w-full px-7 text-[15px] sm:ml-auto sm:w-auto" disabled={sameAirport || tooMany}>
          Tìm chuyến bay
          <PlaneMark className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1 group-hover:-translate-y-0.5" />
        </button>
      </div>
      {(sameAirport || tooMany) && (
        <p className="text-sm text-[#9a5b00]">{sameAirport ? 'Điểm đi và điểm đến phải khác nhau.' : 'Tối đa 9 khách (người lớn và trẻ em) mỗi lần đặt.'}</p>
      )}
    </form>
  )
}

function LookupForm({ checkin }) {
  const navigate = useNavigate()
  const [pnr, setPnr] = useState('')
  const [lastName, setLastName] = useState('')
  const submit = (e) => {
    e.preventDefault()
    navigate(`/bookings/${pnr.trim().toUpperCase()}?` + new URLSearchParams({ last_name: lastName.trim() }))
  }
  return (
    <form onSubmit={submit} className="rise grid gap-4 sm:grid-cols-[1fr_1.4fr_auto] sm:items-end">
      <p className="text-muted sm:col-span-3">
        {checkin ? 'Làm thủ tục trực tuyến từ 24 giờ đến 1 giờ trước giờ bay, nhận thẻ lên máy bay có mã QR.'
          : 'Xem hành trình, thanh toán, đổi chuyến, huỷ vé và hoàn tiền, không cần đăng nhập.'}
      </p>
      <label className="block"><span className="label">Mã đặt chỗ</span>
        <input className="input uppercase tracking-[0.12em]" required minLength={6} maxLength={6} value={pnr} onChange={(e) => setPnr(e.target.value)} />
      </label>
      <label className="block"><span className="label">Họ của hành khách (vd. Nguyễn)</span>
        <input className="input" required value={lastName} onChange={(e) => setLastName(e.target.value)} />
      </label>
      <button className="btn h-10 px-6">{checkin ? 'Làm thủ tục' : 'Tra cứu'}</button>
    </form>
  )
}
