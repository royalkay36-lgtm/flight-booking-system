import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { api, fmtDate, isoDate } from '../api.js'
import { ErrorText, FlapText, PlaneMark } from '../ui.jsx'
import DestinationCards from '../components/DestinationCards.jsx'
import TripDatePicker from '../components/TripDatePicker.jsx'

// Dữ liệu sân bay mặc định (dữ liệu tạm khi máy chủ chưa phản hồi)
const DEFAULT_AIRPORTS = [
  { iata_code: 'HAN', name: 'Noi Bai International Airport', city: 'Hà Nội', country: 'Việt Nam' },
  { iata_code: 'SGN', name: 'Tan Son Nhat International Airport', city: 'TP. Hồ Chí Minh', country: 'Việt Nam' },
  { iata_code: 'DAD', name: 'Da Nang International Airport', city: 'Đà Nẵng', country: 'Việt Nam' },
  { iata_code: 'CXR', name: 'Cam Ranh International Airport', city: 'Nha Trang', country: 'Việt Nam' },
  { iata_code: 'PQC', name: 'Phu Quoc International Airport', city: 'Phú Quốc', country: 'Việt Nam' },
  { iata_code: 'HPH', name: 'Cat Bi International Airport', city: 'Hải Phòng', country: 'Việt Nam' },
  { iata_code: 'VII', name: 'Vinh International Airport', city: 'Vinh', country: 'Việt Nam' },
  { iata_code: 'HUI', name: 'Phu Bai International Airport', city: 'Huế', country: 'Việt Nam' },
  { iata_code: 'DLI', name: 'Lien Khuong Airport', city: 'Đà Lạt', country: 'Việt Nam' },
  { iata_code: 'VCA', name: 'Can Tho International Airport', city: 'Cần Thơ', country: 'Việt Nam' },
  { iata_code: 'BKK', name: 'Suvarnabhumi Airport', city: 'Bangkok', country: 'Thái Lan' },
  { iata_code: 'SIN', name: 'Singapore Changi Airport', city: 'Singapore', country: 'Singapore' },
  { iata_code: 'ICN', name: 'Incheon International Airport', city: 'Seoul', country: 'Hàn Quốc' },
  { iata_code: 'NRT', name: 'Narita International Airport', city: 'Tokyo', country: 'Nhật Bản' },
]

// Hàm loại bỏ dấu tiếng Việt để tìm kiếm không phân biệt hoa/thường và dấu
function removeVietnameseTones(str) {
  if (!str) return ''
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim()
}

function getSearchableAirportText(a) {
  let extra = ''
  if (a.iata_code === 'SGN') extra = ' sài gòn sai gon hcm tphcm'
  if (a.iata_code === 'HAN') extra = ' thủ đô thu do'
  return removeVietnameseTones(`${a.city} ${a.name} ${a.iata_code} ${a.country ?? ''}${extra}`)
}

function formatPassengerSummary(adults, children, infants) {
  const parts = []
  if (adults > 0) parts.push(`${adults} người lớn`)
  if (children > 0) parts.push(`${children} trẻ em`)
  if (infants > 0) parts.push(`${infants} em bé`)
  return parts.join(', ') || '1 người lớn'
}

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
  // Khuyến mãi lấy từ GET /vouchers/public: [{ code, description, valid_to }]. Không dùng dữ liệu cứng làm dự phòng.
  const [vouchers, setVouchers] = useState([])
  const [vouchersStatus, setVouchersStatus] = useState('loading')   // loading | ready | error
  const [airports, setAirports] = useState([])
  const [airportsError, setAirportsError] = useState(false)
  const [trip, setTrip] = useState(null)        // giá trị hiện tại của form tìm chuyến
  const loadVouchers = () => {
    setVouchersStatus('loading')
    api('/vouchers/public')
      .then((data) => {
        // Backend đã lọc mã hết hạn; lọc lại phía trình duyệt phòng khi trang mở lâu qua thời điểm hết hạn
        setVouchers((Array.isArray(data) ? data : []).filter((v) => new Date(v.valid_to) > new Date()))
        setVouchersStatus('ready')
      })
      .catch(() => setVouchersStatus('error'))
  }
  useEffect(() => {
    loadVouchers()
    api('/airports').then(setAirports).catch(() => setAirportsError(true))
  }, [])

  const airportList = airports.length > 0 ? airports : DEFAULT_AIRPORTS
  const cityOf = (code) => airportList.find((a) => a.iata_code === code)?.city ?? code
  // Tiêu đề hiện ngay điểm đến đang chọn; chỉ lật chữ khi người dùng đổi điểm đến
  const destCity = trip && airportList.length ? cityOf(trip.destination) : ''

  return (
    // --overlap: phần khung tìm kiếm đè lên đáy hero. Khung tìm kiếm, thẻ HAN→SGN và padding khẩu hiệu đều tính theo biến này
    <div className="[--overlap:9rem] sm:[--overlap:11rem]">
      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="relative isolate overflow-hidden rounded-[28px] bg-[#0b3a5c] sm:rounded-[36px]"
        style={{ minHeight: '70vh' }}>
        <img src="/images/canh-may-bay.jpg" alt="" fetchPriority="high" decoding="async"
          className="settle absolute inset-0 -z-10 h-full w-full object-cover object-[62%_30%]" />
        {/* lớp phủ tối đảm bảo chữ luôn đọc được ở mọi màn hình */}
        <div className="absolute inset-0 -z-10 bg-[rgba(8,12,16,0.52)] md:bg-[linear-gradient(110deg,rgba(8,12,16,0.78)_0%,rgba(8,12,16,0.52)_50%,rgba(8,12,16,0.18)_100%)]" />

        {/* Nội dung slogan – đặt giữa phía trên theo chiều dọc hero.
            lg (1024–1279px): thẻ HAN→SGN nằm ngang hàng khẩu hiệu nên chừa thêm chỗ cho thẻ:
            --overlap + 1.5rem (khe dưới thẻ) + 9rem (chiều cao thẻ) + 1.5rem (khe trên thẻ) = --overlap + 12rem.
            Từ xl, thẻ nằm hẳn bên phải khẩu hiệu nên chỉ cần --overlap + 4rem như trước. */}
        <div className="flex min-h-[70vh] flex-col justify-center px-6 pb-[calc(var(--overlap)+2rem)] pt-16 sm:px-12 sm:pt-20 lg:pb-[calc(var(--overlap)+12rem)] xl:pb-[calc(var(--overlap)+4rem)]">
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

        {trip && airportList.length > 0 && <TripPreview trip={trip} cityOf={cityOf} />}
      </section>

      {/* ── KHUNG TÌM KIẾM NỔI – đè lên mép dưới hero ──────────────────── */}
      <div className="rise relative z-10 mt-[calc(var(--overlap)*-1)] rounded-3xl border border-line bg-white p-5 shadow-2xl [animation-delay:200ms] sm:mx-8 sm:p-7">
        <div role="group" aria-label="Chọn việc cần làm" className="segmented mb-6">
          {Object.entries(TABS).map(([k, [label, short]]) => (
            <button key={k} type="button" aria-pressed={tab === k} onClick={() => setParams(k === 'book' ? {} : { tab: k })}
              className="segmented-item px-3 sm:px-4">
              <span className="sm:hidden">{short}</span><span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
        {/* SearchForm luôn được giữ (chỉ ẩn) để không mất lựa chọn khi đổi tab */}
        <div hidden={tab !== 'book'}><SearchForm airports={airportList} error={airportsError} onChange={setTrip} /></div>
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

      {/* 3. Khuyến mãi (từ API). Rỗng thì ẩn cả mục; lỗi thì báo và cho thử lại, không hiện dữ liệu cứng */}
      {(vouchersStatus !== 'ready' || vouchers.length > 0) && (
        <section className="mt-24 space-y-5" aria-labelledby="deals-title" aria-busy={vouchersStatus === 'loading'}>
          <div className="reveal">
            <h2 id="deals-title" className="text-title font-bold tracking-tight">Khuyến mãi đang diễn ra</h2>
            <p className="mt-1 text-muted">Nhập mã ở bước thanh toán để được giảm giá.</p>
          </div>
          {vouchersStatus === 'loading' && (
            <div className="flex gap-4 overflow-hidden lg:grid lg:grid-cols-3">
              <span className="sr-only">Đang tải khuyến mãi…</span>
              {[1, 2, 3].map((n) => (
                <div key={n} aria-hidden="true" className="h-44 w-[85%] flex-none animate-pulse rounded-2xl border border-[#f3d9a4] bg-[#fffaf0] sm:w-[60%] lg:w-auto" />
              ))}
            </div>
          )}
          {vouchersStatus === 'error' && (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white p-5">
              <p className="text-muted">Không tải được khuyến mãi.</p>
              <button type="button" className="btn-outline" onClick={loadVouchers}>Thử lại</button>
            </div>
          )}
          {vouchersStatus === 'ready' && (
            // Điện thoại/máy tính bảng cuộn ngang trong khung, máy tính 3 cột
            <ul className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 lg:grid lg:grid-cols-3 lg:overflow-visible lg:pb-0">
              {vouchers.map((v) => <PromoCard key={v.code} voucher={v} />)}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}

// Thẻ khuyến mãi: chỉ hiện các trường API trả về (code, description, valid_to)
function PromoCard({ voucher }) {
  const [status, setStatus] = useState('idle')   // idle | copied | failed
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])

  const copy = async () => {
    const ok = await copyText(voucher.code)
    setStatus(ok ? 'copied' : 'failed')
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setStatus('idle'), 2000)
  }

  return (
    <li className="relative flex w-[85%] flex-none snap-start flex-col rounded-2xl border border-[#f3d9a4] bg-[#fffaf0] p-5 sm:w-[60%] lg:w-auto">
      <p className="flex-1 font-medium">{voucher.description}</p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-[#e9c27a] pt-4">
        <div>
          <span className="block text-meta text-[#7a4a00]">Mã</span>
          <span className="font-bold tracking-[0.06em] text-[#7a4a00]">{voucher.code}</span>
        </div>
        <button type="button" onClick={copy} aria-label={`Sao chép mã ${voucher.code}`} className="btn-outline">
          {status === 'copied' ? 'Đã sao chép' : status === 'failed' ? 'Hãy chép tay' : 'Sao chép mã'}
        </button>
      </div>
      {/* fmtDate định dạng dd/mm/yyyy theo giờ Việt Nam (Asia/Ho_Chi_Minh), không lệch ngày */}
      <p className="mt-3 text-meta text-muted">Hạn dùng đến {fmtDate(voucher.valid_to)}</p>
      <span className="sr-only" aria-live="polite">
        {status === 'copied' ? `Đã sao chép mã ${voucher.code}` : status === 'failed' ? `Không sao chép được, mã là ${voucher.code}` : ''}
      </span>
    </li>
  )
}

// Thẻ xem trước hành trình: đổi điểm đi/đến trong form thì máy bay bay lại từ đầu
const ARC = 'M 6 52 Q 80 -10 154 52'
function TripPreview({ trip, cityOf }) {
  const people = Number(trip.adults) + Number(trip.children) + Number(trip.infants)
  return (
    <div className="fade-in absolute bottom-[calc(var(--overlap)+1.5rem)] right-8 hidden w-[440px] rounded-2xl bg-white p-5 text-ink [animation-delay:500ms] lg:block">
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

function AirportPicker({ label, value, onChange, otherValue, airports }) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [inputText, setInputText] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const containerRef = useRef(null)
  const listRef = useRef(null)

  // Cập nhật text hiển thị khi value thay đổi (ví dụ khi đảo điểm đi/đến)
  useEffect(() => {
    const current = airports.find((a) => a.iata_code === value)
    setInputText(current ? `${current.city} (${current.iata_code})` : (value || ''))
  }, [value, airports])

  // Lọc sân bay theo tên, thành phố, mã IATA, bỏ dấu tiếng Việt và loại trừ sân bay ở ô còn lại
  const available = airports.filter((a) => a.iata_code !== otherValue)
  const q = removeVietnameseTones(query)
  const filtered = q
    ? available.filter((a) => getSearchableAirportText(a).includes(q))
    : available

  // Tự động cuộn đến item được highlight khi dùng phím mũi tên
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const item = listRef.current.children[highlightedIndex]
      item?.scrollIntoView({ block: 'nearest' })
    }
  }, [highlightedIndex])

  // Đóng khi click ra ngoài hoặc nhấn Esc
  useEffect(() => {
    if (!isOpen) return
    const handlePointerDown = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        closeDropdown()
      }
    }
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        closeDropdown()
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, value, airports, query])

  const closeDropdown = () => {
    setIsOpen(false)
    setHighlightedIndex(-1)
    const exactMatch = available.find(
      (a) =>
        a.iata_code.toLowerCase() === query.trim().toLowerCase() ||
        removeVietnameseTones(a.city) === removeVietnameseTones(query)
    )
    if (exactMatch) {
      handleSelect(exactMatch.iata_code)
      return
    }
    const current = airports.find((a) => a.iata_code === value)
    setInputText(current ? `${current.city} (${current.iata_code})` : (value || ''))
    setQuery('')
  }

  const handleSelect = (code) => {
    onChange(code)
    const selected = airports.find((a) => a.iata_code === code)
    setInputText(selected ? `${selected.city} (${selected.iata_code})` : code)
    setQuery('')
    setIsOpen(false)
    setHighlightedIndex(-1)
  }

  const handleKeyDown = (e) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        setIsOpen(true)
        setHighlightedIndex(0)
      }
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex((prev) => (filtered.length ? (prev + 1) % filtered.length : -1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex((prev) => (filtered.length ? (prev - 1 + filtered.length) % filtered.length : -1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (highlightedIndex >= 0 && highlightedIndex < filtered.length) {
        handleSelect(filtered[highlightedIndex].iata_code)
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      closeDropdown()
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <label className="block">
        <span className="label">{label}</span>
        <div className="relative">
          <input
            type="text"
            className="input pr-8"
            placeholder="Tìm sân bay, thành phố..."
            value={inputText}
            onFocus={(e) => {
              setIsOpen(true)
              e.target.select()
            }}
            onChange={(e) => {
              setInputText(e.target.value)
              setQuery(e.target.value)
              setIsOpen(true)
              setHighlightedIndex(0)
            }}
            onKeyDown={handleKeyDown}
            aria-haspopup="listbox"
            aria-expanded={isOpen}
            autoComplete="off"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted text-xs">
            ▼
          </span>
        </div>
      </label>

      {isOpen && (
        <ul
          ref={listRef}
          role="listbox"
          className="absolute left-0 right-0 top-full z-40 mt-1.5 max-h-64 overflow-y-auto rounded-2xl border border-line bg-white py-1.5 shadow-xl"
        >
          {filtered.length === 0 ? (
            <li className="px-4 py-3 text-center text-meta text-muted">
              Không tìm thấy sân bay
            </li>
          ) : (
            filtered.map((a, index) => (
              <li
                key={a.iata_code}
                role="option"
                aria-selected={highlightedIndex === index}
                onMouseDown={(e) => {
                  e.preventDefault()
                  handleSelect(a.iata_code)
                }}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={`flex cursor-pointer items-center justify-between gap-3 px-3.5 py-2.5 transition-colors ${
                  highlightedIndex === index ? 'bg-brand-wash text-brand-ink' : 'hover:bg-ground'
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-ink">{a.city}</span>
                    {a.country && <span className="text-meta text-muted">· {a.country}</span>}
                  </div>
                  <div className="text-meta text-muted truncate">{a.name}</div>
                </div>
                <span className="flex-none rounded-lg bg-ground px-2 py-0.5 font-mono text-xs font-bold text-brand-strong">
                  {a.iata_code}
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}

function PassengerPicker({ adults, children, infants, onChange }) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef(null)

  const total = adults + children + infants
  const maxTotal = 9

  useEffect(() => {
    if (!isOpen) return
    const handlePointerDown = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  const updateCount = (key, delta) => {
    let newAdults = adults
    let newChildren = children
    let newInfants = infants

    if (key === 'adults') newAdults += delta
    if (key === 'children') newChildren += delta
    if (key === 'infants') newInfants += delta

    if (newAdults < 1) return
    if (newChildren < 0) return
    if (newInfants < 0) return
    if (newInfants > newAdults) return
    if (newAdults + newChildren + newInfants > maxTotal) return

    onChange({ adults: newAdults, children: newChildren, infants: newInfants })
  }

  const summary = formatPassengerSummary(adults, children, infants)

  const rows = [
    {
      key: 'adults',
      title: 'Người lớn',
      subtitle: 'Từ 12 tuổi trở lên',
      count: adults,
      minusDisabled: adults <= 1 || adults <= infants,
      plusDisabled: total >= maxTotal,
    },
    {
      key: 'children',
      title: 'Trẻ em',
      subtitle: 'Từ 2 – 11 tuổi',
      count: children,
      minusDisabled: children <= 0,
      plusDisabled: total >= maxTotal,
    },
    {
      key: 'infants',
      title: 'Em bé',
      subtitle: 'Dưới 2 tuổi (ngồi chung)',
      count: infants,
      minusDisabled: infants <= 0,
      plusDisabled: infants >= adults || total >= maxTotal,
    },
  ]

  return (
    <div ref={containerRef} className="relative">
      <span className="label">Số khách</span>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        className="input flex items-center justify-between text-left cursor-pointer"
      >
        <span className="truncate">{summary}</span>
        <span
          className="ml-2 text-muted text-xs transition-transform duration-200"
          style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }}
        >
          ▼
        </span>
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="Chọn số hành khách"
          className="absolute left-0 top-full z-40 mt-1.5 w-full sm:w-80 rounded-2xl border border-line bg-white p-4 shadow-xl"
        >
          <div className="space-y-3.5">
            {rows.map((r) => (
              <div key={r.key} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-ink text-ui">{r.title}</div>
                  <div className="text-meta text-muted">{r.subtitle}</div>
                </div>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    aria-label={`Giảm ${r.title}`}
                    disabled={r.minusDisabled}
                    onClick={() => updateCount(r.key, -1)}
                    className="grid h-8 w-8 place-items-center rounded-full border border-control text-ink transition-colors hover:border-brand hover:bg-brand-wash disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-control disabled:hover:bg-transparent cursor-pointer"
                  >
                    −
                  </button>
                  <span className="w-5 text-center font-bold text-ink num">{r.count}</span>
                  <button
                    type="button"
                    aria-label={`Tăng ${r.title}`}
                    disabled={r.plusDisabled}
                    onClick={() => updateCount(r.key, 1)}
                    className="grid h-8 w-8 place-items-center rounded-full border border-control text-ink transition-colors hover:border-brand hover:bg-brand-wash disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-control disabled:hover:bg-transparent cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 border-t border-rule pt-2.5 text-meta text-muted">
            Tối đa 9 khách. Em bé không vượt quá số người lớn.
          </div>

          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="btn mt-3 h-9 w-full text-sm font-semibold"
          >
            Xong
          </button>
        </div>
      )}
    </div>
  )
}

function SearchForm({ airports, error, onChange }) {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    trip: 'oneway',
    origin: 'HAN',
    destination: 'SGN',
    date: isoDate(new Date(Date.now() + 864e5)),
    returnDate: '',
    adults: 1,
    children: 0,
    infants: 0,
  })

  const set = (k) => (e) => setForm((prev) => ({ ...prev, [k]: e.target.value }))
  useEffect(() => { onChange?.(form) }, [form])

  const swapAirports = () => {
    setForm((prev) => ({
      ...prev,
      origin: prev.destination,
      destination: prev.origin,
    }))
  }

  const sameAirport = Boolean(form.origin && form.destination && form.origin === form.destination)
  const totalGuests = Number(form.adults) + Number(form.children) + Number(form.infants)
  const tooMany = totalGuests > 9
  const missingReturn = form.trip === 'round' && !form.returnDate

  const submit = (e) => {
    e.preventDefault()
    if (sameAirport || tooMany || missingReturn) return
    const { trip, returnDate, ...q } = form
    navigate('/search?' + new URLSearchParams(trip === 'round' ? { ...q, returnDate } : q))
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {error && <ErrorText>Không tải được danh sách sân bay từ máy chủ. Đang dùng dữ liệu sân bay có sẵn.</ErrorText>}
      <fieldset className="segmented">
        <legend className="sr-only">Loại vé</legend>
        {[['oneway', 'Một chiều'], ['round', 'Khứ hồi']].map(([v, label]) => (
          <label key={v} className="segmented-item">
            <input type="radio" name="trip" value={v} checked={form.trip === v} onChange={set('trip')} className="sr-only" /> {label}
          </label>
        ))}
      </fieldset>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Cụm Điểm đi - Đảo - Điểm đến */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
          <AirportPicker
            label="Điểm đi"
            value={form.origin}
            onChange={(code) => setForm((prev) => ({ ...prev, origin: code }))}
            otherValue={form.destination}
            airports={airports}
          />

          <div className="flex items-center justify-center sm:pb-0.5">
            <button
              type="button"
              onClick={swapAirports}
              aria-label="Đổi điểm đi và điểm đến"
              title="Đổi điểm đi và điểm đến"
              className="grid h-10 w-10 place-items-center rounded-full border border-control bg-white text-muted shadow-sm transition-all hover:border-brand hover:bg-brand-wash hover:text-brand active:scale-95 cursor-pointer"
            >
              <span className="text-base leading-none select-none sm:hidden" aria-hidden="true">⇅</span>
              <span className="hidden text-base leading-none select-none sm:inline" aria-hidden="true">⇄</span>
            </button>
          </div>

          <AirportPicker
            label="Điểm đến"
            value={form.destination}
            onChange={(code) => setForm((prev) => ({ ...prev, destination: code }))}
            otherValue={form.origin}
            airports={airports}
          />
        </div>

        {/* Cụm Ngày đi và Ngày về: một lịch chung, có giá rẻ nhất mỗi ngày */}
        <TripDatePicker
          trip={form.trip}
          date={form.date}
          returnDate={form.returnDate}
          origin={form.origin}
          destination={form.destination}
          passengers={Number(form.adults) + Number(form.children)}
          onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
        />
      </div>

      {/* Row 2: Số khách và Nút tìm kiếm */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="w-full sm:w-72">
          <PassengerPicker
            adults={Number(form.adults)}
            children={Number(form.children)}
            infants={Number(form.infants)}
            onChange={(counts) => setForm((prev) => ({ ...prev, ...counts }))}
          />
        </div>

        <button
          type="submit"
          className="btn group h-12 w-full px-7 sm:ml-auto sm:w-auto"
          disabled={sameAirport || tooMany || missingReturn}
        >
          Tìm chuyến bay
          <PlaneMark className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1 group-hover:-translate-y-0.5" />
        </button>
      </div>

      {(sameAirport || tooMany || missingReturn) && (
        <p className="text-[#9a5b00] text-sm">
          {sameAirport
            ? 'Điểm đi và điểm đến không được trùng nhau.'
            : tooMany ? 'Tối đa 9 khách mỗi lần đặt.' : 'Chọn ngày về cho vé khứ hồi.'}
        </p>
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
