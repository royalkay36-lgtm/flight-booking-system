import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { api, fmtDate, isoDate } from '../api.js'
import { ErrorText, FlapText, PlaneMark } from '../ui.jsx'

// [nhãn đầy đủ, nhãn ngắn trên điện thoại]
const TABS = { book: ['Mua vé', 'Mua vé'], manage: ['Quản lý đặt chỗ', 'Quản lý vé'], checkin: ['Làm thủ tục', 'Thủ tục'] }

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
  const [airportsError, setAirportsError] = useState(false)
  const [trip, setTrip] = useState(null)        // giá trị hiện tại của form tìm chuyến
  useEffect(() => {
    api('/vouchers/public').then(setVouchers).catch(() => { })
    api('/airports').then(setAirports).catch(() => setAirportsError(true))
  }, [])

  const cityOf = (code) => airports.find((a) => a.iata_code === code)?.city ?? code
  // Tiêu đề hiện ngay điểm đến đang chọn; chỉ lật chữ khi người dùng đổi điểm đến
  const destCity = trip && airports.length ? cityOf(trip.destination) : ''

  return (
    <div>
      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="relative isolate overflow-hidden rounded-[28px] bg-[#0b3a5c] sm:rounded-[36px]"
        style={{ minHeight: '70vh' }}>
        <img src="/images/canh-may-bay.jpg" alt="" fetchPriority="high" decoding="async"
          className="settle absolute inset-0 -z-10 h-full w-full object-cover object-[62%_30%]" />
        {/* lớp phủ tối đảm bảo chữ luôn đọc được ở mọi màn hình */}
        <div className="absolute inset-0 -z-10 bg-[rgba(8,12,16,0.52)] md:bg-[linear-gradient(110deg,rgba(8,12,16,0.78)_0%,rgba(8,12,16,0.52)_50%,rgba(8,12,16,0.18)_100%)]" />

        {/* Nội dung slogan – đặt giữa phía trên theo chiều dọc hero */}
        <div className="flex min-h-[70vh] flex-col justify-center px-6 pb-44 pt-16 sm:px-12 sm:pb-52 sm:pt-20 lg:pb-60">
          <h1 className="rise max-w-3xl text-[clamp(36px,5.8vw,68px)] font-bold leading-[1.06] tracking-tight text-white drop-shadow-md">
            <span className="sr-only">Cất cánh tới {destCity || 'mọi điểm đến'}</span>
            <span aria-hidden="true" className="block">Cất cánh tới</span>
            <span className="mt-3 block min-h-[1.5em] text-[0.82em]">
              {destCity
                ? <FlapText text={destCity.toLocaleUpperCase('vi')} />
                : <span className="text-[#7dd3fc]">mọi điểm đến</span>}
            </span>
          </h1>
          {/* Slogan phụ — nội dung tạm */}
          <p className="rise mt-6 max-w-lg text-[clamp(15px,1.6vw,20px)] leading-relaxed text-white/90 drop-shadow [animation-delay:120ms]">
            <b className="font-semibold text-white">Chạm để cất cánh.</b> Tìm chuyến, chọn ghế cạnh cửa sổ và nhận vé điện tử
            trong vài phút — bay khắp Việt Nam và châu Á.
          </p>
        </div>

        {trip && airports.length > 0 && <TripPreview trip={trip} cityOf={cityOf} />}
      </section>

      {/* ── KHUNG TÌM KIẾM NỔI – đè lên mép dưới hero ──────────────────── */}
      <div className="rise relative z-10 -mt-36 rounded-3xl border border-line bg-white p-5 shadow-2xl [animation-delay:200ms] sm:mx-8 sm:-mt-44 sm:p-7">
        <div role="group" aria-label="Chọn việc cần làm" className="segmented mb-6">
          {Object.entries(TABS).map(([k, [label, short]]) => (
            <button key={k} type="button" aria-pressed={tab === k} onClick={() => setParams(k === 'book' ? {} : { tab: k })}
              className="segmented-item px-3 sm:px-4">
              <span className="sm:hidden">{short}</span><span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
        {/* SearchForm luôn được giữ (chỉ ẩn) để không mất lựa chọn khi đổi tab */}
        <div hidden={tab !== 'book'}><SearchForm airports={airports} error={airportsError} onChange={setTrip} /></div>
        {tab !== 'book' && <LookupForm key={tab} checkin={tab === 'checkin'} />}
      </div>

      <section className="mt-24" aria-labelledby="steps-title">
        <h2 id="steps-title" className="reveal text-title font-bold tracking-tight">Từ lúc chọn chuyến đến lúc lên máy bay</h2>
        <p className="reveal mt-1 text-muted">Ba chặng, làm hết trên một trang, không cần ra quầy.</p>
        <div className="relative mt-10">
          <div className="absolute inset-x-0 top-3 hidden border-t-2 border-dashed border-control md:block" aria-hidden="true" />
          <span className="scroll-glide absolute -top-0.5 hidden h-7 w-7 place-items-center text-brand md:grid" aria-hidden="true">
            <PlaneMark className="h-7 w-7" angle={90} />
          </span>
          <ol className="grid gap-8 border-l-2 border-dashed border-control pl-6 md:grid-cols-3 md:border-0 md:pl-0">
            {STEPS.map(([title, text], i) => (
              <li key={title} className="reveal relative md:pt-12">
                <span className="absolute -left-[33px] top-1.5 h-4 w-4 rounded-full border-4 border-ground bg-brand md:left-0 md:top-1" aria-hidden="true" />
                <h3 className="text-lead font-semibold"><span className="sr-only">Bước {i + 1}: </span>{title}</h3>
                <p className="mt-1 max-w-xs">{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {vouchers.length > 0 && (
        <section className="mt-24 space-y-5" aria-labelledby="deals-title">
          <div className="reveal">
            <h2 id="deals-title" className="text-title font-bold tracking-tight">Khuyến mãi đang diễn ra</h2>
            <p className="mt-1 text-muted">Nhập mã ở bước thanh toán để được giảm giá.</p>
          </div>
          {/* auto-fit: 2 hay 3 phiếu đều phủ kín chiều ngang, không chừa ô trống */}
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr))]">
            {vouchers.map((v) => (
              <div key={v.code} className="reveal relative flex overflow-hidden rounded-2xl border border-[#f3d9a4] bg-[#fffaf0]">
                <div className="flex w-36 flex-none flex-col justify-center border-r border-dashed border-[#e9c27a] px-4 py-5">
                  <span className="text-meta text-[#7a4a00]">Mã</span>
                  <span className="font-bold tracking-[0.06em] text-[#7a4a00]">{v.code}</span>
                </div>
                <span className="absolute left-[136px] -top-2 h-4 w-4 rounded-full border border-[#f3d9a4] bg-ground" aria-hidden="true" />
                <span className="absolute -bottom-2 left-[136px] h-4 w-4 rounded-full border border-[#f3d9a4] bg-ground" aria-hidden="true" />
                <div className="min-w-0 flex-1 p-4">
                  <p className="font-medium">{v.description}</p>
                  <p className="mt-1 text-meta text-muted">Hạn dùng đến {fmtDate(v.valid_to)}</p>
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
const ARC = 'M 6 52 Q 80 -10 154 52'
function TripPreview({ trip, cityOf }) {
  const people = Number(trip.adults) + Number(trip.children) + Number(trip.infants)
  return (
    <div className="fade-in absolute bottom-36 right-8 hidden w-[440px] rounded-2xl bg-white p-5 text-ink [animation-delay:500ms] lg:block">
      <div className="flex items-center justify-between text-meta text-muted">
        <span>{trip.trip === 'round' ? 'Khứ hồi' : 'Một chiều'}</span>
        <span>{trip.date ? fmtDate(trip.date) : ''} · {people} khách</span>
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <span className="block text-title font-bold leading-none tracking-tight">{trip.origin}</span>
          <span className="whitespace-nowrap text-meta text-muted">{cityOf(trip.origin)}</span>
        </div>
        <div key={trip.origin + trip.destination} className="relative mb-5 h-14 w-40 flex-none" aria-hidden="true">
          <svg viewBox="0 0 160 56" className="absolute inset-0 h-14 w-40 overflow-visible">
            <path d={ARC} fill="none" stroke="#cbd6e0" strokeWidth="2" strokeDasharray="4 5" />
            <path d={ARC} fill="none" stroke="#0284c7" strokeWidth="2" pathLength="1" strokeDasharray="1"
              style={{ animation: 'draw 2.6s var(--ease-in-out) both' }} />
          </svg>
          <span className="absolute left-0 top-0 grid h-6 w-6 place-items-center text-brand-strong"
            style={{ offsetPath: `path('${ARC}')`, offsetRotate: 'auto', animation: 'fly 2.6s var(--ease-in-out) both', offsetDistance: '100%' }}>
            <PlaneMark className="h-6 w-6" angle={90} />
          </span>
        </div>
        <div className="min-w-0 text-right">
          <span className="block text-title font-bold leading-none tracking-tight">{trip.destination}</span>
          <span className="whitespace-nowrap text-meta text-muted">{cityOf(trip.destination)}</span>
        </div>
      </div>
    </div>
  )
}

function SearchForm({ airports, error, onChange }) {
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
      {error && <ErrorText>Không tải được danh sách sân bay. Kiểm tra kết nối rồi tải lại trang.</ErrorText>}
      <fieldset className="segmented">
        <legend className="sr-only">Loại vé</legend>
        {[['oneway', 'Một chiều'], ['round', 'Khứ hồi']].map(([v, label]) => (
          <label key={v} className="segmented-item">
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
        <button className="btn group h-12 w-full px-7 sm:ml-auto sm:w-auto" disabled={sameAirport || tooMany}>
          Tìm chuyến bay
          <PlaneMark className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1 group-hover:-translate-y-0.5" />
        </button>
      </div>
      {(sameAirport || tooMany) && (
        <p className="text-[#9a5b00]">{sameAirport ? 'Điểm đi và điểm đến phải khác nhau.' : 'Tối đa 9 khách (người lớn và trẻ em) mỗi lần đặt.'}</p>
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
