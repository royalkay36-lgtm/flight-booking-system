import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { api } from '../api.js'
import { ErrorText, useAuth } from '../ui.jsx'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ email: '', password: '', full_name: '', phone: '' })
  const [error, setError] = useState('')
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    try {
      login(await api(`/auth/${mode}`, { method: 'POST', body: form }))
      navigate(location.state?.from || '/', { replace: true })
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="mx-auto max-w-sm card">
      <div className="mb-4 flex gap-2">
        {[['login', 'Đăng nhập'], ['register', 'Đăng ký']].map(([m, label]) => (
          <button key={m} onClick={() => setMode(m)} className={mode === m ? 'btn' : 'btn-outline'}>{label}</button>
        ))}
      </div>
      <form onSubmit={submit} className="space-y-3">
        {mode === 'register' && (
          <>
            <label className="block"><span className="label">Họ tên</span><input className="input" required value={form.full_name} onChange={set('full_name')} /></label>
            <label className="block"><span className="label">Số điện thoại</span><input className="input" value={form.phone} onChange={set('phone')} /></label>
          </>
        )}
        <label className="block"><span className="label">Email</span><input type="email" className="input" required value={form.email} onChange={set('email')} /></label>
        <label className="block"><span className="label">Mật khẩu</span><input type="password" className="input" required minLength={6} value={form.password} onChange={set('password')} /></label>
        <ErrorText>{error}</ErrorText>
        <button className="btn w-full">{mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}</button>
      </form>
      <p className="mt-4 text-xs text-slate-500">
        Tài khoản mẫu (mật khẩu 123456): khach@flight.test, staff@flight.test, admin@flight.test
      </p>
    </div>
  )
}
