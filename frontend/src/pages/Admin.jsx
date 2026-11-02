import { useEffect, useState } from 'react'
import { api, CABIN, fmtDate, fmtDateTime, fromLocalInput, money } from '../api.js'
import { ErrorText } from '../ui.jsx'

const TABS = { reports: 'Báo cáo', flight: 'Tạo chuyến bay', fleet: 'Đội bay & sân bay', users: 'Người dùng' }

export default function Admin() {
  const [tab, setTab] = useState('reports')
  const [catalog, setCatalog] = useState(null)
  const loadCatalog = () => api('/admin/catalog').then(setCatalog)
  useEffect(() => { loadCatalog() }, [])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {Object.entries(TABS).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={tab === k ? 'btn' : 'btn-outline'}>{label}</button>
        ))}
      </div>
      {tab === 'reports' && <Reports />}
      {tab === 'flight' && catalog && <CreateFlight catalog={catalog} />}
      {tab === 'fleet' && catalog && <Fleet catalog={catalog} reload={loadCatalog} />}
      {tab === 'users' && <Users />}
    </div>
  )
}

// Gửi form: hiển thị lỗi / thông báo thành công
function useSubmit() {
  const [status, setStatus] = useState({ error: '', ok: '' })
  const submit = (fn, ok) => async (e) => {
    e.preventDefault()
    setStatus({ error: '', ok: '' })
    try {
      await fn()
      setStatus({ error: '', ok })
    } catch (err) {
      setStatus({ error: err.message, ok: '' })
    }
  }
  const feedback = (
    <>
      <ErrorText>{status.error}</ErrorText>
      {status.ok && <p className="text-sm text-green-700">{status.ok}</p>}
    </>
  )
  return [submit, feedback]
}

function Reports() {
  const [data, setData] = useState(null)
  useEffect(() => { api('/admin/reports').then(setData) }, [])
  if (!data) return null

  const revenue = data.revenue.reduce((s, r) => s + Number(r.revenue), 0)
  const tickets = data.revenue.reduce((s, r) => s + Number(r.tickets_sold), 0)
  const lf = data.load_factor
  const avgLoad = lf.length ? lf.reduce((s, r) => s + Number(r.load_factor_pct ?? 0), 0) / lf.length : 0

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        {[['Doanh thu', money(revenue)], ['Vé đã bán', tickets], ['Tỷ lệ lấp đầy TB', `${avgLoad.toFixed(1)}%`]].map(([label, value]) => (
          <div key={label} className="card"><span className="label">{label}</span><span className="text-2xl font-semibold">{value}</span></div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card overflow-x-auto">
          <h2 className="mb-2 font-semibold">Doanh thu theo ngày bay</h2>
          <table className="table">
            <thead><tr><th>Ngày bay</th><th>Hãng</th><th>Vé</th><th>Doanh thu</th></tr></thead>
            <tbody>
              {data.revenue.map((r) => (
                <tr key={r.flight_date + r.airline_code}>
                  <td>{fmtDate(r.flight_date)}</td><td>{r.airline_code}</td><td>{r.tickets_sold}</td><td>{money(r.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card max-h-[32rem] overflow-auto">
          <h2 className="mb-2 font-semibold">Tỷ lệ lấp đầy ghế</h2>
          <table className="table">
            <thead><tr><th>Chuyến</th><th>Khởi hành</th><th>Đã bán</th><th className="w-40">Load factor</th></tr></thead>
            <tbody>
              {lf.map((r) => (
                <tr key={r.flight_id}>
                  <td>{r.flight_number} <span className="text-xs text-slate-500">{r.origin}→{r.destination}</span></td>
                  <td>{fmtDateTime(r.departure_time)}</td>
                  <td>{r.booked}/{r.capacity}</td>
                  <td>
                    <div className="h-2 rounded bg-slate-100" role="img" aria-label={`${r.load_factor_pct}%`}>
                      <div className="h-2 rounded bg-sky-600" style={{ width: `${r.load_factor_pct ?? 0}%` }} />
                    </div>
                    <span className="text-xs">{r.load_factor_pct}%</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function CreateFlight({ catalog }) {
  const [f, setF] = useState({
    flight_number: '', aircraft_reg: catalog.aircraft[0]?.registration ?? '',
    origin: 'HAN', destination: 'SGN', dep: '', arr: '', fares: {},
  })
  const [submit, feedback] = useSubmit()
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const save = submit(async () => {
    const fares = Object.fromEntries(Object.entries(f.fares).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)]))
    await api('/admin/flights', {
      method: 'POST',
      body: {
        flight_number: f.flight_number.toUpperCase(), aircraft_reg: f.aircraft_reg, origin: f.origin, destination: f.destination,
        departure_time: fromLocalInput(f.dep), arrival_time: fromLocalInput(f.arr), fares,
      },
    })
  }, 'Đã tạo chuyến bay; sơ đồ ghế được sinh tự động theo tàu bay.')

  const airportSelect = (k, label) => (
    <label><span className="label">{label}</span>
      <select className="input" value={f[k]} onChange={set(k)}>
        {catalog.airports.map((a) => <option key={a.iata_code} value={a.iata_code}>{a.iata_code} — {a.city}</option>)}
      </select>
    </label>
  )

  return (
    <form onSubmit={save} className="card grid max-w-3xl gap-3 sm:grid-cols-2">
      <label><span className="label">Số hiệu chuyến bay</span>
        <input className="input uppercase" required placeholder="VN215" value={f.flight_number} onChange={set('flight_number')} /></label>
      <label><span className="label">Tàu bay</span>
        <select className="input" value={f.aircraft_reg} onChange={set('aircraft_reg')}>
          {catalog.aircraft.map((a) => <option key={a.registration} value={a.registration}>{a.registration} · {a.model_name} · {a.airline_code}</option>)}
        </select></label>
      {airportSelect('origin', 'Điểm đi')}
      {airportSelect('destination', 'Điểm đến')}
      <label><span className="label">Cất cánh (giờ VN)</span>
        <input type="datetime-local" className="input" required value={f.dep} onChange={set('dep')} /></label>
      <label><span className="label">Hạ cánh (giờ VN)</span>
        <input type="datetime-local" className="input" required value={f.arr} onChange={set('arr')} /></label>
      <fieldset className="grid gap-3 sm:col-span-2 sm:grid-cols-3">
        <legend className="label">Giá vé cơ bản (để trống nếu không mở bán)</legend>
        {catalog.fare_classes.map((fc) => (
          <label key={fc.code}><span className="label">{fc.name} ({CABIN[fc.cabin_class]})</span>
            <input type="number" min={0} step={10000} className="input" value={f.fares[fc.code] ?? ''}
              onChange={(e) => setF({ ...f, fares: { ...f.fares, [fc.code]: e.target.value } })} /></label>
        ))}
      </fieldset>
      <div className="sm:col-span-2">{feedback}</div>
      <button className="btn sm:col-span-2">Tạo chuyến bay</button>
    </form>
  )
}

function Fleet({ catalog, reload }) {
  const [airport, setAirport] = useState({ iata_code: '', name: '', city: '', country: 'Vietnam', timezone: 'Asia/Ho_Chi_Minh' })
  const [model, setModel] = useState({ code: '', manufacturer: 'Airbus', name: '', layouts: 'BUSINESS 1-4 AC-DF\nECONOMY 5-32 ABC-DEF' })
  const [aircraft, setAircraft] = useState({ registration: '', model_code: catalog.models[0]?.code ?? '', airline_code: catalog.airlines[0]?.iata_code ?? '' })
  const [submit, feedback] = useSubmit()

  const post = (path, body) => api(path, { method: 'POST', body }).then(reload)
  // Mỗi dòng: "<HẠNG> <hàng đầu>-<hàng cuối> <cột ghế, '-' là lối đi>", ví dụ "ECONOMY 5-32 ABC-DEF"
  const parseLayouts = (text) => text.trim().split('\n').map((line) => {
    const [cabin_class, rows, seat_columns] = line.trim().split(/\s+/)
    const [first_row, last_row] = (rows ?? '').split('-').map(Number)
    return { cabin_class: cabin_class?.toUpperCase(), first_row, last_row, seat_columns: seat_columns?.toUpperCase() }
  })

  const field = (state, setState, k, label, props = {}) => (
    <label><span className="label">{label}</span>
      <input className="input" required value={state[k]} onChange={(e) => setState({ ...state, [k]: e.target.value })} {...props} /></label>
  )

  return (
    <div className="space-y-4">
      {feedback}
      <div className="grid gap-4 lg:grid-cols-3">
        <form className="card space-y-3" onSubmit={submit(() => post('/admin/airports', { ...airport, iata_code: airport.iata_code.toUpperCase() }), 'Đã thêm sân bay')}>
          <h2 className="font-semibold">Thêm sân bay</h2>
          {field(airport, setAirport, 'iata_code', 'Mã IATA', { maxLength: 3, className: 'input uppercase' })}
          {field(airport, setAirport, 'name', 'Tên sân bay')}
          {field(airport, setAirport, 'city', 'Thành phố')}
          {field(airport, setAirport, 'country', 'Quốc gia')}
          {field(airport, setAirport, 'timezone', 'Múi giờ (IANA)')}
          <button className="btn">Thêm</button>
        </form>

        <form className="card space-y-3" onSubmit={submit(() => post('/admin/aircraft-models', { ...model, layouts: parseLayouts(model.layouts) }), 'Đã tạo chủng loại máy bay và sơ đồ ghế')}>
          <h2 className="font-semibold">Chủng loại & sơ đồ ghế</h2>
          {field(model, setModel, 'code', 'Mã (vd. A350)')}
          {field(model, setModel, 'manufacturer', 'Hãng sản xuất')}
          {field(model, setModel, 'name', 'Tên')}
          <label><span className="label">Bố cục khoang (mỗi dòng: HẠNG hàng-hàng CỘT)</span>
            <textarea className="input font-mono" rows={3} value={model.layouts} onChange={(e) => setModel({ ...model, layouts: e.target.value })} /></label>
          <button className="btn">Tạo</button>
          <ul className="text-xs text-slate-500">{catalog.models.map((m) => <li key={m.code}>{m.code} — {m.name}: {m.seats} ghế</li>)}</ul>
        </form>

        <form className="card space-y-3" onSubmit={submit(() => post('/admin/aircraft', { ...aircraft, registration: aircraft.registration.toUpperCase() }), 'Đã thêm tàu bay')}>
          <h2 className="font-semibold">Thêm tàu bay</h2>
          {field(aircraft, setAircraft, 'registration', 'Số đăng ký (vd. VN-A622)', { className: 'input uppercase' })}
          <label><span className="label">Chủng loại</span>
            <select className="input" value={aircraft.model_code} onChange={(e) => setAircraft({ ...aircraft, model_code: e.target.value })}>
              {catalog.models.map((m) => <option key={m.code} value={m.code}>{m.code} — {m.name}</option>)}
            </select></label>
          <label><span className="label">Hãng</span>
            <select className="input" value={aircraft.airline_code} onChange={(e) => setAircraft({ ...aircraft, airline_code: e.target.value })}>
              {catalog.airlines.map((a) => <option key={a.iata_code} value={a.iata_code}>{a.name}</option>)}
            </select></label>
          <button className="btn">Thêm</button>
          <ul className="text-xs text-slate-500">{catalog.aircraft.map((a) => <li key={a.registration}>{a.registration} — {a.model_name} ({a.airline_code})</li>)}</ul>
        </form>
      </div>
    </div>
  )
}

function Users() {
  const [users, setUsers] = useState([])
  const [error, setError] = useState('')
  const load = () => api('/admin/users').then(setUsers)
  useEffect(() => { load() }, [])

  const update = async (u, body) => {
    setError('')
    try {
      await api(`/admin/users/${u.id}`, { method: 'PATCH', body })
      await load()
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div className="card space-y-3 overflow-x-auto">
      <ErrorText>{error}</ErrorText>
      <table className="table">
        <thead><tr><th>Email</th><th>Họ tên</th><th>Vai trò</th><th>Hoạt động</th><th>Ngày tạo</th></tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.email}</td>
              <td>{u.full_name}</td>
              <td>
                <select className="input w-36" aria-label={`Vai trò ${u.email}`} value={u.role} onChange={(e) => update(u, { role: e.target.value })}>
                  <option value="PASSENGER">Hành khách</option><option value="STAFF">Nhân viên</option><option value="ADMIN">Quản trị</option>
                </select>
              </td>
              <td><input type="checkbox" aria-label={`Kích hoạt ${u.email}`} checked={u.is_active} onChange={(e) => update(u, { is_active: e.target.checked })} /></td>
              <td>{fmtDate(u.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
