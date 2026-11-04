import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { api } from '../api.js'
import { ErrorText, PasswordRules, passwordOk } from '../ui.jsx'

// Mở từ link trong email "Đặt lại mật khẩu": /reset-password?token=...
export default function ResetPassword() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!passwordOk(password)) return setError('Mật khẩu chưa đủ mạnh, xem các điều kiện ngay dưới ô mật khẩu.')
    if (password !== confirm) return setError('Hai lần nhập mật khẩu chưa khớp.')
    setBusy(true)
    try {
      await api('/auth/reset-password', { method: 'POST', body: { token, password } })
      navigate('/login', { replace: true, state: { notice: 'Đã đặt lại mật khẩu. Đăng nhập bằng mật khẩu mới.' } })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mx-auto max-w-md rounded-3xl border border-line bg-white px-6 py-10 sm:px-10">
      <h1 className="text-title font-bold tracking-tight">Đặt lại mật khẩu</h1>
      {!token ? (
        <>
          <p className="mt-2 text-muted">Link này thiếu mã xác nhận. Hãy mở đúng link trong email, hoặc yêu cầu link mới.</p>
          <Link to="/login" state={{ mode: 'forgot' }} className="btn mt-6 h-11 w-full">Yêu cầu link mới</Link>
        </>
      ) : (
        <>
          <p className="mt-2 text-muted">Chọn mật khẩu mới cho tài khoản SkyBooking của bạn.</p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="new-password" className="label">Mật khẩu mới</label>
              <div className="relative">
                <input id="new-password" type={show ? 'text' : 'password'} className="input pr-16" required maxLength={72}
                  autoComplete="new-password" aria-describedby="password-rules" value={password} onChange={(e) => setPassword(e.target.value)} />
                <button type="button" onClick={() => setShow((v) => !v)} aria-pressed={show} aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  className="absolute inset-y-1 right-1 rounded-lg px-3 text-meta font-medium text-brand-ink hover:bg-brand-wash">
                  {show ? 'Ẩn' : 'Hiện'}
                </button>
              </div>
              <PasswordRules id="password-rules" value={password} />
            </div>
            <label className="block"><span className="label">Nhập lại mật khẩu mới</span>
              <input type={show ? 'text' : 'password'} className="input" required maxLength={72} autoComplete="new-password"
                value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </label>
            <ErrorText>{error}</ErrorText>
            <button className="btn h-11 w-full" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu mật khẩu mới'}</button>
          </form>
          <p className="mt-4 text-meta text-muted">
            Link hết hạn hoặc đã dùng? <Link to="/login" state={{ mode: 'forgot' }} className="font-medium text-brand-ink">Yêu cầu link mới</Link>
          </p>
        </>
      )}
    </section>
  )
}
