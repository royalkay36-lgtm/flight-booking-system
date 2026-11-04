import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { api } from '../api.js'
import { ErrorText, useAuth } from '../ui.jsx'

// Tài khoản trong dữ liệu mẫu (database/03_seed.sql) để demo; bỏ khi triển khai thật
const DEMO_ACCOUNTS = [['khach@flight.test', 'Hành khách'], ['staff@flight.test', 'Nhân viên'], ['admin@flight.test', 'Quản trị']]

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ email: '', password: '', full_name: '', phone: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const isLogin = mode === 'login'

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      login(await api(`/auth/${mode}`, { method: 'POST', body: form }))
      navigate(location.state?.from || '/', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid overflow-hidden rounded-3xl border border-line bg-white lg:grid-cols-[1fr_1.05fr]">
      <section className="px-6 py-10 sm:px-12 sm:py-14">
        <div className="mx-auto max-w-sm">
          <h1 className="text-[28px] font-bold leading-tight tracking-tight">{isLogin ? 'Đăng nhập' : 'Tạo tài khoản'}</h1>
          <p className="mt-2 text-muted">
            {isLogin ? 'Xem vé của bạn, thanh toán và làm thủ tục nhanh hơn.' : 'Chỉ cần email và mật khẩu để bắt đầu đặt vé.'}
          </p>

          <div role="tablist" aria-label="Chọn đăng nhập hoặc đăng ký" className="mt-6 inline-flex rounded-full bg-ground p-1">
            {[['login', 'Đăng nhập'], ['register', 'Đăng ký']].map(([m, label]) => (
              <button key={m} role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setError('') }}
                className={`h-9 rounded-full px-5 text-sm font-medium transition-colors ${mode === m ? 'bg-white text-ink shadow-[0_1px_2px_rgba(15,23,32,0.08)]' : 'text-muted hover:text-ink'}`}>
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="mt-6 space-y-4">
            {!isLogin && (
              <>
                <label className="block"><span className="label">Họ tên</span>
                  <input className="input" required autoComplete="name" value={form.full_name} onChange={set('full_name')} /></label>
                <label className="block"><span className="label">Số điện thoại</span>
                  <input className="input" type="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} /></label>
              </>
            )}
            <label className="block"><span className="label">Email</span>
              <input type="email" className="input" required autoComplete="email" value={form.email} onChange={set('email')} /></label>
            <div>
              <label htmlFor="password" className="label">Mật khẩu</label>
              <div className="relative">
                <input id="password" type={showPassword ? 'text' : 'password'} className="input pr-16" required minLength={6}
                  aria-describedby={isLogin ? undefined : 'password-rule'} autoComplete={isLogin ? 'current-password' : 'new-password'}
                  value={form.password} onChange={set('password')} />
                <button type="button" onClick={() => setShowPassword((v) => !v)} aria-pressed={showPassword}
                  className="absolute inset-y-1 right-1 rounded-lg px-3 text-[13px] font-medium text-brand-ink hover:bg-brand-wash">
                  {showPassword ? 'Ẩn' : 'Hiện'}
                </button>
              </div>
              {!isLogin && <p id="password-rule" className="mt-1.5 text-[13px] text-muted">Ít nhất 6 ký tự.</p>}
            </div>
            <ErrorText>{error}</ErrorText>
            <button className="btn h-11 w-full text-[15px]" disabled={busy}>{busy ? 'Đang xử lý…' : isLogin ? 'Đăng nhập' : 'Tạo tài khoản'}</button>
          </form>

          {isLogin && (
            <div className="mt-8 rounded-2xl bg-brand-wash p-4">
              <p className="text-sm font-medium">Tài khoản dùng thử</p>
              <p className="mt-0.5 text-[13px] text-muted">Mật khẩu chung là 123456. Bấm để điền sẵn.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {DEMO_ACCOUNTS.map(([email, role]) => (
                  <button key={email} type="button" onClick={() => setForm({ ...form, email, password: '123456' })} className="btn-outline">{role}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <figure className="relative hidden min-h-[560px] lg:block">
        <img src="/images/cua-so-may-bay.webp" alt="Dãy núi phủ tuyết nhìn qua cửa sổ máy bay giữa trời xanh"
          className="absolute inset-0 h-full w-full object-cover" />
        <figcaption className="absolute inset-x-0 bottom-0 bg-[rgba(16,20,24,0.55)] px-8 py-6 text-white">
          <p className="text-xl font-semibold leading-snug">Ghế cạnh cửa sổ, chọn từ lúc đặt vé.</p>
          <p className="mt-1 text-[15px] text-white/85">Sơ đồ ghế theo từng loại máy bay, giữ chỗ 15 phút khi bạn thanh toán.</p>
        </figcaption>
      </figure>
    </div>
  )
}
