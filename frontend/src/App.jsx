import { useEffect, useRef, useState } from 'react'
import { BrowserRouter, Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router'
import { api, getToken, setToken } from './api.js'
import { AuthContext, Logo, useAuth } from './ui.jsx'
import Home from './pages/Home.jsx'
import Results from './pages/Results.jsx'
import Booking from './pages/Booking.jsx'
import MyBookings from './pages/MyBookings.jsx'
import BookingDetail from './pages/BookingDetail.jsx'
import FlightStatus from './pages/FlightStatus.jsx'
import Login from './pages/Login.jsx'
import Staff from './pages/Staff.jsx'
import Admin from './pages/Admin.jsx'
import ChatWidget from './components/ChatWidget.jsx'

export default function App() {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(!getToken())

  useEffect(() => {
    if (getToken()) api('/auth/me').then(setUser).catch(() => {}).finally(() => setReady(true))
  }, [])

  const login = ({ token, user }) => { setToken(token); setUser(user) }
  const logout = () => { setToken(null); setUser(null) }

  if (!ready) return null
  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      <BrowserRouter>
        <div className="flex min-h-screen flex-col">
          <Header />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/search" element={<Results />} />
              <Route path="/status" element={<FlightStatus />} />
              <Route path="/login" element={<Login />} />
              <Route path="/booking" element={<RequireAuth><Booking /></RequireAuth>} />
              <Route path="/bookings" element={<RequireAuth><MyBookings /></RequireAuth>} />
              <Route path="/bookings/:pnr" element={<BookingDetail />} />
              <Route path="/staff" element={<RequireAuth roles={['STAFF', 'ADMIN']}><Staff /></RequireAuth>} />
              <Route path="/admin" element={<RequireAuth roles={['ADMIN']}><Admin /></RequireAuth>} />
              <Route path="*" element={<p>Không tìm thấy trang.</p>} />
            </Routes>
          </main>
          <Footer />
        </div>
        <ChatWidget />
      </BrowserRouter>
    </AuthContext.Provider>
  )
}

function RequireAuth({ roles, children }) {
  const { user } = useAuth()
  const location = useLocation()
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  if (roles && !roles.includes(user.role)) return <p>Bạn không có quyền truy cập trang này.</p>
  return children
}

const ROLE = { PASSENGER: 'Hành khách', STAFF: 'Nhân viên', ADMIN: 'Quản trị viên' }

// Mục trong menu tài khoản theo vai trò; dùng chung cho menu thả xuống và bảng menu điện thoại
function accountLinks(user) {
  return [
    ['/bookings', 'Vé của tôi'],
    ...(['STAFF', 'ADMIN'].includes(user.role) ? [['/staff', 'Điều hành chuyến bay']] : []),
    ...(user.role === 'ADMIN' ? [['/admin', 'Quản trị hệ thống']] : []),
  ]
}

const MAIN_LINKS = [['/', 'Tìm chuyến bay'], ['/?tab=manage', 'Quản lý đặt chỗ'], ['/status', 'Trạng thái chuyến bay']]

function Header() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)    // bảng menu trên điện thoại
  const [accountOpen, setAccountOpen] = useState(false)
  const accountRef = useRef(null)

  // Đóng menu khi chuyển trang
  useEffect(() => { setMenuOpen(false); setAccountOpen(false) }, [location.pathname, location.search])

  // Đóng menu tài khoản khi bấm ra ngoài hoặc nhấn Esc
  useEffect(() => {
    if (!accountOpen) return
    const onClick = (e) => { if (!accountRef.current?.contains(e.target)) setAccountOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setAccountOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey) }
  }, [accountOpen])

  const isActive = (to) => {
    const [path, query] = to.split('?')
    return location.pathname === path && (query ? location.search === `?${query}` : !location.search.includes('tab='))
  }
  const navCls = (to) => `rounded-full px-3.5 py-2 text-sm font-medium transition-colors ${
    isActive(to) ? 'bg-brand-tint text-brand-ink' : 'text-ink hover:bg-brand-wash'}`

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white">
      <nav aria-label="Điều hướng chính" className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 sm:px-6">
        <Link to="/" className="mr-4 rounded-lg" aria-label="SkyBooking — trang chủ"><Logo /></Link>

        <div className="hidden items-center gap-1 md:flex">
          {MAIN_LINKS.map(([to, label]) => <Link key={to} to={to} className={navCls(to)}>{label}</Link>)}
        </div>

        <div className="ml-auto hidden md:block">
          {user ? (
            <div className="relative" ref={accountRef}>
              <button onClick={() => setAccountOpen((v) => !v)} aria-haspopup="menu" aria-expanded={accountOpen}
                className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm font-medium hover:bg-brand-wash">
                <Avatar name={user.full_name} />
                <span className="max-w-40 truncate">{user.full_name}</span>
                <svg viewBox="0 0 20 20" className={`h-4 w-4 text-muted transition-transform ${accountOpen ? 'rotate-180' : ''}`} aria-hidden="true">
                  <path d="M5 7.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {accountOpen && (
                <div role="menu" className="absolute right-0 mt-2 w-64 rounded-2xl border border-line bg-white p-2 shadow-[0_12px_32px_rgba(15,23,32,0.12)]">
                  <div className="px-3 pb-2 pt-1">
                    <p className="truncate text-sm font-semibold">{user.full_name}</p>
                    <p className="truncate text-[13px] text-muted">{user.email} · {ROLE[user.role]}</p>
                  </div>
                  {accountLinks(user).map(([to, label]) => (
                    <Link key={to} role="menuitem" to={to} className="block rounded-xl px-3 py-2 text-sm hover:bg-brand-wash">{label}</Link>
                  ))}
                  <button role="menuitem" onClick={logout} className="mt-1 block w-full rounded-xl px-3 py-2 text-left text-sm text-red-800 hover:bg-red-50">Đăng xuất</button>
                </div>
              )}
            </div>
          ) : (
            <Link to="/login" className="btn">Đăng nhập</Link>
          )}
        </div>

        <button onClick={() => setMenuOpen((v) => !v)} aria-expanded={menuOpen} aria-controls="mobile-menu"
          aria-label={menuOpen ? 'Đóng menu' : 'Mở menu'} className="ml-auto grid h-10 w-10 place-items-center rounded-full hover:bg-brand-wash md:hidden">
          <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
            <path d={menuOpen ? 'M6 6l12 12M18 6L6 18' : 'M4 7h16M4 12h16M4 17h16'} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </nav>

      {menuOpen && (
        <div id="mobile-menu" className="border-t border-line bg-white px-4 pb-5 pt-2 md:hidden">
          {MAIN_LINKS.map(([to, label]) => (
            <Link key={to} to={to} className={`block rounded-xl px-3 py-3 text-base ${isActive(to) ? 'bg-brand-tint font-medium text-brand-ink' : ''}`}>{label}</Link>
          ))}
          <div className="mt-3 border-t border-line pt-3">
            {user ? (
              <>
                <div className="flex items-center gap-3 px-3 pb-2">
                  <Avatar name={user.full_name} />
                  <div className="min-w-0"><p className="truncate font-medium">{user.full_name}</p><p className="truncate text-[13px] text-muted">{ROLE[user.role]}</p></div>
                </div>
                {accountLinks(user).map(([to, label]) => <Link key={to} to={to} className="block rounded-xl px-3 py-3 text-base">{label}</Link>)}
                <button onClick={logout} className="block w-full rounded-xl px-3 py-3 text-left text-base text-red-800">Đăng xuất</button>
              </>
            ) : (
              <Link to="/login" className="btn w-full">Đăng nhập</Link>
            )}
          </div>
        </div>
      )}
    </header>
  )
}

function Avatar({ name }) {
  const initial = (name || '?').trim().split(/\s+/).pop()[0]?.toUpperCase()
  return <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-brand-tint text-sm font-semibold text-brand-ink" aria-hidden="true">{initial}</span>
}

function Footer() {
  return (
    <footer className="mt-16 bg-brand-wash">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 pb-8 pt-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="max-w-sm">
          <Logo />
          <p className="mt-4 text-[15px] text-muted">
            Đặt vé máy bay, chọn chỗ ngồi trên sơ đồ ghế, quản lý đặt chỗ và làm thủ tục trực tuyến ở một nơi.
          </p>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Đặt vé</h2>
          <ul className="mt-3 space-y-2 text-[15px]">
            <li><Link to="/" className="text-muted hover:text-brand-ink">Tìm chuyến bay</Link></li>
            <li><Link to="/?tab=manage" className="text-muted hover:text-brand-ink">Quản lý đặt chỗ</Link></li>
            <li><Link to="/?tab=checkin" className="text-muted hover:text-brand-ink">Làm thủ tục trực tuyến</Link></li>
            <li><Link to="/status" className="text-muted hover:text-brand-ink">Trạng thái chuyến bay</Link></li>
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Hỗ trợ</h2>
          <ul className="mt-3 space-y-2 text-[15px] text-muted">
            <li>Tổng đài 1900 6868 (mẫu)</li>
            <li>hotro@skybooking.test</li>
            <li>Hoặc hỏi trợ lý ảo ở góc phải màn hình</li>
          </ul>
        </div>
      </div>
      <div className="mx-auto max-w-6xl overflow-hidden px-4 sm:px-6">
        <p aria-hidden="true" className="select-none text-[clamp(56px,13vw,176px)] font-bold leading-[0.85] tracking-[-0.04em] text-brand">SkyBooking</p>
      </div>
      <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-2 px-4 py-5 text-[13px] text-muted sm:px-6">
        <p>© 2026 SkyBooking · Đề tài xây dựng hệ thống website quản lý và đặt vé máy bay</p>
        <p>Ảnh trang đăng nhập: “View airplane window vast mountainous”, CC0, qua rawpixel</p>
      </div>
    </footer>
  )
}
