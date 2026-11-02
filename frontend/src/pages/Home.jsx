import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { api, fmtDate, isoDate } from '../api.js'

const TABS = { book: 'Mua vé', manage: 'Quản lý đặt chỗ', checkin: 'Làm thủ tục' }

export default function Home() {
  const [params, setParams] = useSearchParams()
  const tab = TABS[params.get('tab')] ? params.get('tab') : 'book'
  const [vouchers, setVouchers] = useState([])
  useEffect(() => { api('/vouchers/public').then(setVouchers).catch(() => {}) }, [])

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-gradient-to-r from-sky-600 to-indigo-600 p-8 text-white">
        <h1 className="text-3xl font-bold">Bay khắp Việt Nam và châu Á</h1>
        <p className="mt-2 text-sky-100">Tìm chuyến, chọn chỗ ngồi yêu thích, mua thêm hành lý, suất ăn, SIM du lịch và nhận vé điện tử trong vài phút.</p>
      </section>

      <div className="card">
        <div role="tablist" className="mb-4 flex flex-wrap gap-2 border-b border-slate-100 pb-3">
          {Object.entries(TABS).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setParams(k === 'book' ? {} : { tab: k })}
              className={tab === k ? 'btn' : 'btn-outline'}>{label}</button>
          ))}
        </div>
        {tab === 'book' ? <SearchForm /> : <LookupForm checkin={tab === 'checkin'} />}
      </div>

      {vouchers.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Khuyến mãi đang diễn ra</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {vouchers.map((v) => (
              <div key={v.code} className="card border-dashed border-amber-300 bg-amber-50">
                <div className="font-mono text-lg font-bold tracking-wider text-amber-700">{v.code}</div>
                <p className="text-sm">{v.description}</p>
                <p className="mt-1 text-xs text-slate-500">Hạn dùng: {fmtDate(v.valid_to)}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function SearchForm() {
  const navigate = useNavigate()
  const [airports, setAirports] = useState([])
  const [form, setForm] = useState({
    trip: 'oneway', origin: 'HAN', destination: 'SGN',
    date: isoDate(new Date(Date.now() + 864e5)), returnDate: '', adults: 1, children: 0, infants: 0,
  })
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  useEffect(() => { api('/airports').then(setAirports) }, [])

  const submit = (e) => {
    e.preventDefault()
    const { trip, returnDate, ...q } = form
    navigate('/search?' + new URLSearchParams(trip === 'round' ? { ...q, returnDate } : q))
  }

  const airportSelect = (k, label) => (
    <label className="block">
      <span className="label">{label}</span>
      <select className="input" value={form[k]} onChange={set(k)}>
        {airports.map((a) => <option key={a.iata_code} value={a.iata_code}>{a.city} ({a.iata_code})</option>)}
      </select>
    </label>
  )
  const counter = (k, label, min, max) => (
    <label className="block"><span className="label">{label}</span>
      <select className="input" value={form[k]} onChange={set(k)}>
        {Array.from({ length: max - min + 1 }, (_, i) => <option key={i}>{min + i}</option>)}
      </select>
    </label>
  )

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex gap-4 text-sm">
        {[['oneway', 'Một chiều'], ['round', 'Khứ hồi']].map(([v, label]) => (
          <label key={v} className="flex items-center gap-2">
            <input type="radio" name="trip" value={v} checked={form.trip === v} onChange={set('trip')} /> {label}
          </label>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {airportSelect('origin', 'Điểm đi')}
        {airportSelect('destination', 'Điểm đến')}
        <label className="block"><span className="label">Ngày đi</span>
          <input type="date" className="input" required min={isoDate()} value={form.date} onChange={set('date')} />
        </label>
        <label className="block"><span className="label">Ngày về</span>
          <input type="date" className="input" disabled={form.trip !== 'round'} required={form.trip === 'round'}
                 min={form.date} value={form.returnDate} onChange={set('returnDate')} />
        </label>
      </div>
      <div className="grid grid-cols-3 gap-3 sm:max-w-md">
        {counter('adults', 'Người lớn', 1, 9)}
        {counter('children', 'Trẻ em 2–11', 0, 8)}
        {counter('infants', 'Em bé <2', 0, Number(form.adults))}
      </div>
      <button className="btn" disabled={form.origin === form.destination || Number(form.adults) + Number(form.children) > 9}>
        Tìm chuyến bay
      </button>
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
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-3 sm:items-end">
      <p className="text-sm text-slate-600 sm:col-span-3">
        {checkin ? 'Làm thủ tục trực tuyến từ 24 giờ đến 1 giờ trước giờ bay, nhận thẻ lên máy bay có mã QR.'
          : 'Xem hành trình, thanh toán, đổi chuyến, huỷ vé và hoàn tiền — không cần đăng nhập.'}
      </p>
      <label className="block"><span className="label">Mã đặt chỗ</span>
        <input className="input font-mono uppercase" required minLength={6} maxLength={6} value={pnr} onChange={(e) => setPnr(e.target.value)} />
      </label>
      <label className="block"><span className="label">Họ của hành khách (vd. Nguyễn)</span>
        <input className="input" required value={lastName} onChange={(e) => setLastName(e.target.value)} />
      </label>
      <button className="btn">{checkin ? 'Làm thủ tục' : 'Tra cứu'}</button>
    </form>
  )
}
