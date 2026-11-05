import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { api } from '../api.js'
import { ErrorText, PasswordRules, passwordOk, useAuth } from '../ui.jsx'

// Tài khoản trong dữ liệu mẫu (database/03_seed.sql) để demo; bỏ khi triển khai thật
const DEMO_ACCOUNTS = [['khach@flight.test', 'Hành khách'], ['staff@flight.test', 'Nhân viên'], ['admin@flight.test', 'Quản trị']]

const COPY = {
  login: ['Đăng nhập', 'Xem vé của bạn, thanh toán và làm thủ tục nhanh hơn.'],
  register: ['Tạo tài khoản', 'Tạo xong, bạn đăng nhập bằng email và mật khẩu vừa đặt.'],
  forgot: ['Quên mật khẩu', 'Nhập email đã đăng ký, chúng tôi gửi link đặt lại mật khẩu (dùng được trong 30 phút).'],
}

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [mode, setMode] = useState(location.state?.mode === 'forgot' ? 'forgot' : 'login')
  const [form, setForm] = useState({ email: '', password: '', full_name: '', phone: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(location.state?.notice || '')   // thông báo thành công (đăng ký, đặt lại mật khẩu)
  const [sent, setSent] = useState(false)                              // đã gửi link quên mật khẩu
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const isLogin = mode === 'login'

  const switchMode = (m) => { setMode(m); setError(''); setNotice(''); setSent(false); setShowPassword(false) }

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (mode === 'register' && !passwordOk(form.password)) {
      setError('Mật khẩu chưa đủ mạnh, xem các điều kiện ngay dưới ô mật khẩu.')
      return
    }
    setBusy(true)
    try {
      if (mode === 'login') {
        login(await api('/auth/login', { method: 'POST', body: { email: form.email, password: form.password } }))
        navigate(location.state?.from || '/', { replace: true })
      } else if (mode === 'register') {
        await api('/auth/register', { method: 'POST', body: form })
        // Đăng ký xong quay về màn đăng nhập, giữ sẵn email
        switchMode('login')
        setForm({ email: form.email, password: '', full_name: '', phone: '' })
        setNotice('Tạo tài khoản thành công. Đăng nhập bằng email và mật khẩu vừa tạo.')
      } else {
        await api('/auth/forgot-password', { method: 'POST', body: { email: form.email } })
        setSent(true)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const [title, subtitle] = COPY[mode]
  return (
    <div className="grid overflow-hidden rounded-3xl border border-line bg-white lg:grid-cols-[1fr_1.05fr]">
      <section className="px-6 py-10 sm:px-12 sm:py-14">
        <div className="mx-auto max-w-sm">
          <h1 className="text-title font-bold tracking-tight">{title}</h1>
          <p className="mt-2 text-muted">{subtitle}</p>

          {mode !== 'forgot' && (
            <div role="group" aria-label="Chọn đăng nhập hoặc đăng ký" className="segmented mt-6">
              {[['login', 'Đăng nhập'], ['register', 'Đăng ký']].map(([m, label]) => (
                <button key={m} type="button" aria-pressed={mode === m} onClick={() => switchMode(m)} className="segmented-item px-5">{label}</button>
              ))}
            </div>
          )}

          {notice && <p role="status" className="mt-6 rounded-xl bg-[#e8f6ee] px-3 py-2 text-[#1f5c3a]">{notice}</p>}

          {mode === 'forgot' && sent ? (
            <div className="rise mt-6 space-y-4">
              <p role="status" className="rounded-xl bg-brand-wash px-4 py-3">
                Nếu <b className="font-semibold">{form.email}</b> có tài khoản, link đặt lại mật khẩu đã được gửi tới hộp thư.
                Hãy kiểm tra cả mục Thư rác.
              </p>
              <button type="button" onClick={() => switchMode('login')} className="btn h-11 w-full">Quay lại đăng nhập</button>
            </div>
          ) : (
            <form key={mode} onSubmit={submit} className="rise mt-6 space-y-4">
              {mode === 'register' && (
                <>
                  <label className="block"><span className="label">Họ tên</span>
                    <input className="input" required autoComplete="name" value={form.full_name} onChange={set('full_name')} /></label>
                  <label className="block"><span className="label">Số điện thoại</span>
                    <input className="input" type="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} /></label>
                </>
              )}
              <label className="block"><span className="label">Email</span>
                <input type="email" className="input" required autoComplete="email" value={form.email} onChange={set('email')} /></label>
              {mode !== 'forgot' && (
                <div>
                  <div className="mb-1.5 flex items-baseline justify-between">
                    <label htmlFor="password" className="font-medium">Mật khẩu</label>
                    {isLogin && (
                      <button type="button" onClick={() => switchMode('forgot')} className="text-meta font-medium text-brand-ink underline-offset-4 hover:underline">
                        Quên mật khẩu?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <input id="password" type={showPassword ? 'text' : 'password'} className="input pr-16" required maxLength={72}
                      aria-describedby={isLogin ? undefined : 'password-rules'} autoComplete={isLogin ? 'current-password' : 'new-password'}
                      value={form.password} onChange={set('password')} />
                    <button type="button" onClick={() => setShowPassword((v) => !v)} aria-pressed={showPassword}
                      aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                      className="absolute inset-y-1 right-1 rounded-lg px-3 text-meta font-medium text-brand-ink hover:bg-brand-wash">
                      {showPassword ? 'Ẩn' : 'Hiện'}
                    </button>
                  </div>
                  {mode === 'register' && <PasswordRules id="password-rules" value={form.password} />}
                </div>
              )}
              <ErrorText>{error}</ErrorText>
              <button className="btn h-11 w-full" disabled={busy}>
                {busy ? 'Đang xử lý…' : { login: 'Đăng nhập', register: 'Tạo tài khoản', forgot: 'Gửi link đặt lại' }[mode]}
              </button>
              {mode === 'forgot' && (
                <button type="button" onClick={() => switchMode('login')} className="btn-outline h-11 w-full">Quay lại đăng nhập</button>
              )}
            </form>
          )}

          {isLogin && (
            <div className="mt-8 rounded-2xl bg-brand-wash p-4">
              <p className="font-medium">Tài khoản dùng thử</p>
              <p className="mt-0.5 text-meta text-muted">Mật khẩu chung là 123456 (tạo trước khi có luật mật khẩu mới). Bấm để điền sẵn.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {DEMO_ACCOUNTS.map(([email, role]) => (
                  <button key={email} type="button" onClick={() => setForm({ ...form, email, password: '123456' })} className="btn-outline">{role}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Trên điện thoại ảnh thành một dải ở đầu thẻ; từ màn hình lớn là cột bên phải */}
      <figure className="relative order-first h-36 lg:order-none lg:h-auto lg:min-h-[560px]">
        <img src="/images/cua-so-may-bay.webp" alt="Dãy núi phủ tuyết nhìn qua cửa sổ máy bay giữa trời xanh"
          className="settle absolute inset-0 h-full w-full object-cover" />
        <figcaption className="rise absolute inset-x-0 bottom-0 hidden bg-[rgba(16,20,24,0.55)] px-8 py-6 text-white [animation-delay:300ms] lg:block">
          <p className="text-lead font-semibold">Chạm để cất cánh. Ghế cạnh cửa sổ, chọn từ lúc đặt vé.</p>
          <p className="mt-1 text-white/85">Sơ đồ ghế theo từng loại máy bay, giữ chỗ 15 phút khi bạn thanh toán.</p>
        </figcaption>
      </figure>
    </div>
  )
}
