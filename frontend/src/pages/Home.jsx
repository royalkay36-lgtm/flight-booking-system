import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { api, isoDate } from '../api.js'

export default function Home() {
  const navigate = useNavigate()
  const [airports, setAirports] = useState([])
  const [form, setForm] = useState({
    trip: 'oneway', origin: 'HAN', destination: 'SGN',
    date: isoDate(new Date(Date.now() + 864e5)), returnDate: '', passengers: 1,
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

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-gradient-to-r from-sky-600 to-indigo-600 p-8 text-white">
        <h1 className="text-3xl font-bold">Bay khắp Việt Nam và châu Á</h1>
        <p className="mt-2 text-sky-100">Tìm chuyến, chọn chỗ ngồi yêu thích trên sơ đồ ghế và nhận vé điện tử trong vài phút.</p>
      </section>

      <form onSubmit={submit} className="card space-y-4">
        <div className="flex gap-4 text-sm">
          {[['oneway', 'Một chiều'], ['round', 'Khứ hồi']].map(([v, label]) => (
            <label key={v} className="flex items-center gap-2">
              <input type="radio" name="trip" value={v} checked={form.trip === v} onChange={set('trip')} /> {label}
            </label>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {airportSelect('origin', 'Điểm đi')}
          {airportSelect('destination', 'Điểm đến')}
          <label className="block"><span className="label">Ngày đi</span>
            <input type="date" className="input" required min={isoDate()} value={form.date} onChange={set('date')} />
          </label>
          <label className="block"><span className="label">Ngày về</span>
            <input type="date" className="input" disabled={form.trip !== 'round'} required={form.trip === 'round'}
                   min={form.date} value={form.returnDate} onChange={set('returnDate')} />
          </label>
          <label className="block"><span className="label">Hành khách</span>
            <input type="number" className="input" min={1} max={9} value={form.passengers} onChange={set('passengers')} />
          </label>
        </div>
        <button className="btn" disabled={form.origin === form.destination}>Tìm chuyến bay</button>
      </form>
    </div>
  )
}
