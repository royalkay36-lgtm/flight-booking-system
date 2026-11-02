import { createContext, useContext } from 'react'

export const AuthContext = createContext(null)
export const useAuth = () => useContext(AuthContext)

// map = một trong các bảng *_STATUS trong api.js
export function Badge({ map, value }) {
  const [label, cls] = map[value] ?? [value, 'bg-slate-100 text-slate-700']
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>
}

export function ErrorText({ children }) {
  return children ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{children}</p> : null
}
