import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { api, fmtDate, isoDate } from '../api.js'
import { ErrorText, FlapText, PlaneMark } from '../ui.jsx'
import DestinationCards from '../components/DestinationCards.jsx'

// [nhãn đầy đủ, nhãn ngắn trên điện thoại]
const TABS = { book: ['Mua vé', 'Mua vé'], manage: ['Quản lý đặt chỗ', 'Quản lý vé'], checkin: ['Làm thủ tục', 'Thủ tục'] }

const STEPS = [
  ['Tìm chuyến hợp ví', 'Lịch giá theo ngày cho thấy hôm nào bay rẻ hơn, lọc theo giờ bay và hãng.'],
  ['Chọn ghế bạn thích', 'Sơ đồ ghế theo từng loại máy bay; ghế được giữ riêng cho bạn 15 phút khi thanh toán.'],
  ['Nhận vé, làm thủ tục', 'Vé điện tử gửi qua email, làm thủ tục trực tuyến và nhận thẻ lên máy bay có mã QR.'],
]

// Icon SVG viết tay (dự án chưa có thư viện icon), nét theo currentColor
const svgProps = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }
const ICONS = {
  tag: <svg {...svgProps}><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" /><circle cx="8" cy="8" r="1.5" /></svg>,
  bolt: <svg {...svgProps}><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" /></svg>,
  headset: <svg {...svgProps}><path d="M4 14v-2a8 8 0 0 1 16 0v2" /><rect x="3" y="14" width="4" height="6" rx="1.5" /><rect x="17" y="14" width="4" height="6" rx="1.5" /><path d="M19 20a3 3 0 0 1-3 2h-3" /></svg>,
  shield: <svg {...svgProps}><path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3z" /><path d="m8.5 12 2.5 2.5 4.5-5" /></svg>,
}

// NỘI DUNG TẠM: chỉnh lại câu chữ cho đúng dịch vụ thực tế. Chưa đưa số liệu cụ thể nào.
const REASONS = [
  ['tag', 'Giá minh bạch', 'Giá hiển thị đã gồm thuế và phí, không phát sinh phí ẩn khi thanh toán.'],
  ['bolt', 'Đặt vé nhanh', 'Tìm chuyến, chọn ghế và thanh toán ngay trên một trang, không cần ra quầy.'],
  ['headset', 'Hỗ trợ 24/7', 'Đội ngũ chăm sóc khách hàng và trợ lý ảo luôn sẵn sàng giải đáp mọi lúc.'],
  ['shield', 'Thanh toán an toàn', 'Thanh toán qua cổng thanh toán uy tín, thông tin của bạn được bảo mật.'],
]

// DỮ LIỆU TẠM: thay bằng dữ liệu thật khi có. CHAOBAN và BAYVUI100 khớp voucher trong database/03_seed.sql;
// HANHLY là mã minh hoạ, chưa có trong database nên nhập ở bước thanh toán sẽ không dùng được.
const PROMOS = [
  { title: 'Ưu đãi chào bạn mới', description: 'Giảm 10% cho đơn từ 500.000đ, tối đa 200.000đ.', code: 'CHAOBAN', validTo: '2026-12-31' },
  { title: 'Bay vui giảm ngay', description: 'Giảm 100.000đ cho đơn từ 1.500.000đ.', code: 'BAYVUI100', validTo: '2026-12-31' },
  { title: 'Ưu đãi hành lý', description: 'Ưu đãi khi mua thêm hành lý ký gửi cùng vé máy bay.', code: 'HANHLY', validTo: '2026-12-31' },
]

// Dự phòng khi trình duyệt không có Clipboard API (http không bảo mật, trình duyệt cũ) hoặc bị từ chối quyền
function legacyCopy(text) {
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0'
  document.body.appendChild(ta)
  ta.select()
  let ok = false
  try { ok = document.execCommand('copy') } catch { ok = false }
  document.body.removeChild(ta)
  return ok
}

async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch { /* bị từ chối: chuyển sang cách dự phòng */ }
  return legacyCopy(text)
}

export default function Home() {
  const [params, setParams] = useSearchParams()
  const tab = TABS[params.get('tab')] ? params.get('tab') : 'book'
  const [airports, setAirports] = useState([])
  const [airportsError, setAirportsError] = useState(false)
  const [trip, setTrip] = useState(null)        // giá trị hiện tại của form tìm chuyến
  useEffect(() => {
    api('/airports').then(setAirports).catch(() => setAirportsError(true))
  }, [])

  const cityOf = (code) => airports.find((a) => a.iata_code === code)?.city ?? code
  // Tiêu đề hiện ngay điểm đến đang chọn; chỉ lật chữ khi người dùng đổi điểm đến
  const destCity = trip && airports.length ? cityOf(trip.destination) : ''

  return (
    <div>
      <section className="relative isolate overflow-hidden rounded-[28px] bg-[#0b3a5c] sm:rounded-[36px]">
        <img src="/images/canh-may-bay.jpg" alt="" fetchPriority="high" decoding="async"
          className="settle absolute inset-0 -z-10 h-full w-full object-cover object-[62%_30%]" />
        {/* lớp phủ trung tính trên ảnh để chữ trắng đủ tương phản */}
        <div className="absolute inset-0 -z-10 bg-[rgba(8,12,16,0.5)] md:bg-[linear-gradient(100deg,rgba(8,12,16,0.72)_0%,rgba(8,12,16,0.45)_45%,rgba(8,12,16,0)_85%)]" />
        <div className="px-6 pb-32 pt-12 sm:px-12 sm:pb-40 sm:pt-16 lg:min-h-[540px]">
          <h1 className="rise max-w-3xl text-[clamp(32px,5.4vw,62px)] font-bold leading-[1.08] tracking-tight text-white">
            <span className="sr-only">Cất cánh tới {destCity || 'mọi điểm đến'}</span>
            <span aria-hidden="true" className="block">Cất cánh tới</span>
            <span className="mt-3 block min-h-[1.5em] text-[0.82em]">{destCity && <FlapText text={destCity.toLocaleUpperCase('vi')} />}</span>
          </h1>
          <p className="rise mt-6 max-w-lg text-lead text-white/90 [animation-delay:120ms]">
            <b className="font-semibold text-white">Chạm để cất cánh.</b> Tìm chuyến, chọn ghế cạnh cửa sổ và nhận vé điện tử
            trong vài phút, bay khắp Việt Nam và châu Á.
          </p>
        </div>
        {trip && airports.length > 0 && <TripPreview trip={trip} cityOf={cityOf} />}
      </section>

      <div className="rise relative z-10 -mt-20 rounded-3xl border border-line bg-white p-5 [animation-delay:200ms] sm:mx-8 sm:-mt-28 sm:p-7">
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

      {/* 1. Điểm đến (component của B, đã có sẵn tiêu đề và tự ẩn khi API lỗi) */}
      <DestinationCards />

      {/* 2. Vì sao chọn SkyBooking */}
      <section className="mt-24" aria-labelledby="why-title">
        <h2 id="why-title" className="reveal text-title font-bold tracking-tight">Vì sao chọn SkyBooking</h2>
        <p className="reveal mt-1 text-muted">Đặt vé máy bay đơn giản, rõ ràng và yên tâm từ đầu đến cuối.</p>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {REASONS.map(([icon, title, text]) => (
            <li key={title} className="reveal card">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-tint text-brand-strong [&>svg]:h-6 [&>svg]:w-6">
                {ICONS[icon]}
              </span>
              <h3 className="mt-4 text-lead font-semibold">{title}</h3>
              <p className="mt-1 text-muted">{text}</p>
            </li>
          ))}
        </ul>
      </section>

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

      {/* 3. Khuyến mãi: điện thoại/máy tính bảng cuộn ngang trong khung, máy tính 3 cột */}
      <section className="mt-24 space-y-5" aria-labelledby="deals-title">
        <div className="reveal">
          <h2 id="deals-title" className="text-title font-bold tracking-tight">Khuyến mãi đang diễn ra</h2>
          <p className="mt-1 text-muted">Nhập mã ở bước thanh toán để được giảm giá.</p>
        </div>
        <ul className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 lg:grid lg:grid-cols-3 lg:overflow-visible lg:pb-0">
          {PROMOS.map((p) => <PromoCard key={p.code} promo={p} />)}
        </ul>
      </section>
    </div>
  )
}

function PromoCard({ promo }) {
  const [status, setStatus] = useState('idle')   // idle | copied | failed
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])

  const copy = async () => {
    const ok = await copyText(promo.code)
    setStatus(ok ? 'copied' : 'failed')
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setStatus('idle'), 2000)
  }

  return (
    <li className="relative flex w-[85%] flex-none snap-start flex-col rounded-2xl border border-[#f3d9a4] bg-[#fffaf0] p-5 sm:w-[60%] lg:w-auto">
      <h3 className="text-lead font-semibold">{promo.title}</h3>
      <p className="mt-1 flex-1 text-muted">{promo.description}</p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-[#e9c27a] pt-4">
        <div>
          <span className="block text-meta text-[#7a4a00]">Mã</span>
          <span className="font-bold tracking-[0.06em] text-[#7a4a00]">{promo.code}</span>
        </div>
        <button type="button" onClick={copy} aria-label={`Sao chép mã ${promo.code}`} className="btn-outline">
          {status === 'copied' ? 'Đã sao chép' : status === 'failed' ? 'Hãy chép tay' : 'Sao chép mã'}
        </button>
      </div>
      <p className="mt-3 text-meta text-muted">Hạn dùng đến {fmtDate(promo.validTo)}</p>
      <span className="sr-only" aria-live="polite">
        {status === 'copied' ? `Đã sao chép mã ${promo.code}` : status === 'failed' ? `Không sao chép được, mã là ${promo.code}` : ''}
      </span>
    </li>
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
