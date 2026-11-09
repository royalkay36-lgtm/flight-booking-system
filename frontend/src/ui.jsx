import { createContext, useContext, useEffect, useRef, useState } from 'react'

export const AuthContext = createContext(null)
export const useAuth = () => useContext(AuthContext)

// map = một trong các bảng *_STATUS trong api.js
export function Badge({ map, value }) {
  const [label, cls] = map[value] ?? [value, 'bg-slate-100 text-slate-700']
  return <span className={`inline-flex flex-none items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-meta font-medium ${cls}`}>{label}</span>
}

export function ErrorText({ children }) {
  return children ? <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-ui text-red-800">{children}</p> : null
}

// Biểu tượng máy bay của SkyBooking (dùng cho logo, favicon cùng hình)
// angle: 45 = mũi chếch lên phải (logo), 90 = mũi sang phải (bay dọc đường bay)
export function PlaneMark({ className = 'h-6 w-6', angle = 45 }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path transform={`rotate(${angle} 12 12)`} fill="currentColor"
        d="M12 2c.9 0 1.5 1 1.5 2.5V9l8 4.5v2l-8-2.5v4.5l2.5 2V21L12 20l-4 1v-1.5l2.5-2V13l-8 2.5v-2l8-4.5V4.5C10.5 3 11.1 2 12 2z" />
    </svg>
  )
}

export const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

const FLAP_CHARS = 'ABCDEGHIKLMNOPQRSTUVXY'

// Bảng lật chữ: các ô chữ quay ngẫu nhiên rồi dừng dần từ trái sang phải, như bảng giờ bay ở sân bay.
// Lần hiện đầu tiên đứng yên (đọc được ngay); chỉ lật khi chữ đổi.
export function FlapText({ text, className = '' }) {
  const [shown, setShown] = useState(text)
  const prev = useRef(text)   // so với chữ trước đó (không dùng cờ "lần đầu" vì StrictMode chạy effect 2 lần)
  useEffect(() => {
    if (prev.current === text || reducedMotion()) { setShown(text); return }
    prev.current = text
    let frame = 0
    const last = 6 + Math.ceil(text.length * 1.5)
    const id = setInterval(() => {
      frame += 1
      setShown([...text].map((ch, i) => (ch === ' ' || frame > 6 + i * 1.5 ? ch : FLAP_CHARS[(Math.random() * FLAP_CHARS.length) | 0])).join(''))
      if (frame >= last) clearInterval(id)
    }, 40)
    return () => clearInterval(id)
  }, [text])

  // Tách theo từ để tên dài (TP. Hồ Chí Minh) xuống dòng nguyên từ trên điện thoại
  let pos = 0
  return (
    <span className={`inline-flex flex-wrap gap-x-[0.28em] gap-y-[0.12em] ${className}`} aria-hidden="true">
      {text.split(' ').map((word, w) => {
        const start = pos
        pos += word.length + 1
        return (
          <span key={w} className="inline-flex gap-[0.06em]">
            {[...word].map((ch, i) => {
              // lượt render đầu sau khi đổi thành phố, `shown` vẫn là chữ cũ (khác độ dài) nên bỏ qua
              const now = shown.length === text.length && shown[start + i] !== ' ' ? shown[start + i] : FLAP_CHARS[(start + i) * 7 % FLAP_CHARS.length]
              return <span key={i} className="flap" data-moving={now !== ch ? '' : undefined}>{now}</span>
            })}
          </span>
        )
      })}
    </span>
  )
}

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2 text-lead font-bold tracking-tight text-ink">
      <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-brand text-white">
        <PlaneMark className="h-5 w-5" />
      </span>
      SkyBooking
    </span>
  )
}

// Mở trợ lý ảo từ bất kỳ đâu (menu điện thoại, footer); ChatWidget lắng nghe sự kiện này
export const openChat = () => window.dispatchEvent(new Event('open-chat'))

// Đầu trang dùng chung: một h1 + dòng mô tả, bên phải là ô lọc / nút (nếu có)
export function PageHeader({ title, children, actions }) {
  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="mr-auto min-w-0">
        <h1 className="text-title font-bold tracking-tight">{title}</h1>
        {children && <div className="mt-1 text-muted">{children}</div>}
      </div>
      {actions}
    </div>
  )
}

// Luật mật khẩu, khớp với password_ok() ở backend/app/auth.py
const PASSWORD_RULES = [
  ['Ít nhất 8 ký tự', (p) => p.length >= 8],
  ['Có chữ cái', (p) => /\p{L}/u.test(p)],
  ['Có chữ số', (p) => /\d/.test(p)],
  ['Có ký tự đặc biệt như @ # ! .', (p) => /[^\p{L}\p{N}\s]/u.test(p)],
]
export const passwordOk = (p) => PASSWORD_RULES.every(([, test]) => test(p))

export function PasswordRules({ id, value }) {
  return (
    <ul id={id} className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-meta">
      {PASSWORD_RULES.map(([label, test]) => {
        const ok = test(value)
        return (
          <li key={label} className={`flex items-center gap-1.5 ${ok ? 'text-[#1f7a4c]' : 'text-muted'}`}>
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 flex-none" aria-hidden="true">
              {ok ? <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                : <circle cx="8" cy="8" r="5" fill="none" stroke="currentColor" strokeWidth="1.5" />}
            </svg>
            {label}<span className="sr-only">{ok ? ': đạt' : ': chưa đạt'}</span>
          </li>
        )
      })}
    </ul>
  )
}
