import { useEffect, useState } from 'react'
import { BrowserRouter, Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router'
import { api, getToken, setToken } from './api.js'
import { AuthContext, useAuth } from './ui.jsx'
import Home from './pages/Home.jsx'
import Results from './pages/Results.jsx'
import Booking from './pages/Booking.jsx'
import MyBookings from './pages/MyBookings.jsx'
import BookingDetail from './pages/BookingDetail.jsx'
import FlightStatus from './pages/FlightStatus.jsx'
import Login from './pages/Login.jsx'
import Staff from './pages/Staff.jsx'
import Admin from './pages/Admin.jsx'

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
        <Header />
        <main className="mx-auto max-w-6xl px-4 py-6">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/search" element={<Results />} />
            <Route path="/status" element={<FlightStatus />} />
            <Route path="/login" element={<Login />} />
            <Route path="/booking" element={<RequireAuth><Booking /></RequireAuth>} />
            <Route path="/bookings" element={<RequireAuth><MyBookings /></RequireAuth>} />
            <Route path="/bookings/:pnr" element={<RequireAuth><BookingDetail /></RequireAuth>} />
            <Route path="/staff" element={<RequireAuth roles={['STAFF', 'ADMIN']}><Staff /></RequireAuth>} />
            <Route path="/admin" element={<RequireAuth roles={['ADMIN']}><Admin /></RequireAuth>} />
            <Route path="*" element={<p>Không tìm thấy trang.</p>} />
          </Routes>
        </main>
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

function Header() {
  const { user, logout } = useAuth()
  const link = ({ isActive }) => `rounded-md px-3 py-2 text-sm ${isActive ? 'bg-sky-700 text-white' : 'text-sky-50 hover:bg-sky-500'}`
  return (
    <header className="bg-sky-600">
      <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-1 px-4 py-2">
        <Link to="/" className="mr-4 text-lg font-bold text-white">✈ SkyBooking</Link>
        <NavLink to="/" end className={link}>Tìm chuyến bay</NavLink>
        <NavLink to="/status" className={link}>Trạng thái chuyến bay</NavLink>
        {user && <NavLink to="/bookings" className={link}>Vé của tôi</NavLink>}
        {['STAFF', 'ADMIN'].includes(user?.role) && <NavLink to="/staff" className={link}>Nhân viên</NavLink>}
        {user?.role === 'ADMIN' && <NavLink to="/admin" className={link}>Quản trị</NavLink>}
        <span className="ml-auto" />
        {user ? (
          <>
            <span className="px-2 text-sm text-sky-50">{user.full_name}</span>
            <button onClick={logout} className="rounded-md px-3 py-2 text-sm text-sky-50 hover:bg-sky-500">Đăng xuất</button>
          </>
        ) : (
          <NavLink to="/login" className={link}>Đăng nhập</NavLink>
        )}
      </nav>
    </header>
  )
}
