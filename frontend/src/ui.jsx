import { createContext, useContext } from 'react'

export const AuthContext = createContext(null)
export const useAuth = () => useContext(AuthContext)

// map = một trong các bảng *_STATUS trong api.js
export function Badge({ map, value }) {
  const [label, cls] = map[value] ?? [value, 'bg-slate-100 text-slate-700']
  return <span className={`inline-flex flex-none items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>{label}</span>
}

export function ErrorText({ children }) {
  return children ? <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{children}</p> : null
}

// Biểu tượng máy bay của SkyBooking (dùng cho logo, favicon cùng hình)
export function PlaneMark({ className = 'h-6 w-6' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path transform="rotate(45 12 12)" fill="currentColor"
        d="M12 2c.9 0 1.5 1 1.5 2.5V9l8 4.5v2l-8-2.5v4.5l2.5 2V21L12 20l-4 1v-1.5l2.5-2V13l-8 2.5v-2l8-4.5V4.5C10.5 3 11.1 2 12 2z" />
    </svg>
  )
}

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2 text-lg font-bold tracking-tight text-ink">
      <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-brand text-white">
        <PlaneMark className="h-5 w-5" />
      </span>
      SkyBooking
    </span>
  )
}
