import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { api, fmtTime, FLIGHT_STATUS, fromLocalInput, isoDate, TICKET_STATUS, toLocalInput } from '../api.js'
import { Badge, ErrorText } from '../ui.jsx'

export default function Staff() {
  const navigate = useNavigate()
  const [date, setDate] = useState(isoDate())
  const [flights, setFlights] = useState([])
  const [edits, setEdits] = useState({}) // flight id -> { status, est }
  const [selected, setSelected] = useState(null)
  const [manifest, setManifest] = useState([])
  const [pnr, setPnr] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const loadFlights = () => api(`/flight-status?date=${date}`).then(setFlights)
  const loadManifest = (f) => api(`/staff/flights/${f.id}/passengers`).then(setManifest)
  useEffect(() => { loadFlights() }, [date]) // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (fn, ok) => {
    setError('')
    setMessage('')
    try {
      const result = await fn()
      setMessage(typeof ok === 'function' ? ok(result) : ok)
    } catch (e) {
      setError(e.message)
    }
  }

  const edit = (f) => edits[f.id] ?? { status: f.status, est: f.estimated_departure ? toLocalInput(f.estimated_departure) : '' }
  const setEdit = (f, k) => (e) => setEdits({ ...edits, [f.id]: { ...edit(f), [k]: e.target.value } })

  const saveStatus = (f) => run(async () => {
    const { status, est } = edit(f)
    await api(`/staff/flights/${f.id}/status`, { method: 'PATCH', body: { status, estimated_departure: fromLocalInput(est) } })
    await loadFlights()
  }, `Đã cập nhật trạng thái ${f.flight_number}`)

  const ticketAction = (t, action) => run(async () => {
    const r = await api(`/staff/tickets/${t.ticket_id}/${action}`, { method: 'POST' })
    await loadManifest(selected)
    return r
  }, (r) => `${t.full_name}: ${action === 'board' ? 'đã lên máy bay' : 'đã làm thủ tục'}${r.assigned_seat ? `, xếp ghế ${r.assigned_seat}` : ''}`)

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-end gap-3">
        <h1 className="mr-auto text-lg font-semibold">Điều hành chuyến bay</h1>
        <form onSubmit={(e) => { e.preventDefault(); navigate(`/bookings/${pnr.trim()}`) }} className="flex gap-2">
          <input className="input w-40 font-mono uppercase" aria-label="Mã đặt chỗ" placeholder="Tra cứu PNR" required value={pnr} onChange={(e) => setPnr(e.target.value)} />
          <button className="btn-outline">Tra cứu</button>
        </form>
        <input type="date" className="input w-44" aria-label="Ngày bay" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <ErrorText>{error}</ErrorText>
      {message && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{message}</p>}

      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Chuyến</th><th>Hành trình</th><th>Giờ đi</th><th>Trạng thái</th><th>Giờ đi dự kiến</th><th /></tr></thead>
          <tbody>
            {flights.map((f) => (
              <tr key={f.id} className={selected?.id === f.id ? 'bg-sky-50' : ''}>
                <td className="font-semibold">{f.flight_number}</td>
                <td>{f.origin} → {f.destination}</td>
                <td>{fmtTime(f.departure_time)}</td>
                <td>
                  <select className="input w-40" aria-label={`Trạng thái ${f.flight_number}`} value={edit(f).status} onChange={setEdit(f, 'status')}>
                    {Object.entries(FLIGHT_STATUS).map(([k, [label]]) => <option key={k} value={k}>{label}</option>)}
                  </select>
                </td>
                <td>
                  <input type="datetime-local" className="input w-52" aria-label={`Giờ dự kiến ${f.flight_number}`} value={edit(f).est} onChange={setEdit(f, 'est')} />
                </td>
                <td className="space-x-2 whitespace-nowrap">
                  <button className="btn-outline" onClick={() => saveStatus(f)}>Lưu</button>
                  <button className="btn-outline" onClick={() => { setSelected(f); loadManifest(f) }}>Hành khách</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="card overflow-x-auto">
          <h2 className="mb-3 font-semibold">
            Danh sách hành khách {selected.flight_number} <Badge map={FLIGHT_STATUS} value={selected.status} />
          </h2>
          <table className="table">
            <thead><tr><th>Ghế</th><th>Hành khách</th><th>Giấy tờ</th><th>PNR</th><th>Số vé</th><th>Trạng thái</th><th /></tr></thead>
            <tbody>
              {manifest.map((t) => (
                <tr key={t.ticket_id}>
                  <td className="font-semibold">{t.seat_code ?? '—'}</td>
                  <td>{t.full_name}</td>
                  <td>{t.id_number}</td>
                  <td className="font-mono">{t.pnr}</td>
                  <td className="font-mono">{t.ticket_number}</td>
                  <td><Badge map={TICKET_STATUS} value={t.status} /></td>
                  <td>
                    {t.status === 'ISSUED' && <button className="btn-outline" onClick={() => ticketAction(t, 'check-in')}>Làm thủ tục</button>}
                    {t.status === 'CHECKED_IN' && <button className="btn-outline" onClick={() => ticketAction(t, 'board')}>Lên máy bay</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!manifest.length && <p className="text-sm text-slate-500">Chưa có vé nào được xuất.</p>}
        </div>
      )}
    </div>
  )
}
