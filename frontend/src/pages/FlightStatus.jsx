import { useEffect, useState } from 'react'
import { api, fmtTime, FLIGHT_STATUS, isoDate } from '../api.js'
import { Badge } from '../ui.jsx'

export default function FlightStatus() {
  const [date, setDate] = useState(isoDate())
  const [query, setQuery] = useState('')
  const [flights, setFlights] = useState([])
  const [changed, setChanged] = useState(null)

  useEffect(() => { api(`/flight-status?date=${date}`).then(setFlights) }, [date])

  // Realtime: server đẩy sự kiện mỗi khi nhân viên đổi trạng thái chuyến bay
  useEffect(() => {
    const source = new EventSource('/api/flight-status/stream')
    source.onmessage = (e) => {
      const u = JSON.parse(e.data)
      setFlights((fs) => fs.map((f) => (f.id === u.flight_id ? { ...f, status: u.status, estimated_departure: u.estimated_departure } : f)))
      setChanged(u.flight_id)
    }
    return () => source.close()
  }, [])

  const q = query.trim().toLowerCase()
  const shown = flights.filter((f) => !q || [f.flight_number, f.origin_city, f.destination_city].some((v) => v?.toLowerCase().includes(q)))

  return (
    <div className="card space-y-4 overflow-x-auto">
      <div className="flex flex-wrap items-end gap-3">
        <h1 className="mr-auto text-lg font-semibold">
          Trạng thái chuyến bay <span className="ml-2 text-xs font-normal text-green-700">● cập nhật trực tiếp</span>
        </h1>
        <input className="input w-56" aria-label="Tìm theo số hiệu hoặc thành phố" placeholder="Số hiệu hoặc thành phố" value={query} onChange={(e) => setQuery(e.target.value)} />
        <input type="date" className="input w-44" aria-label="Ngày bay" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <table className="table">
        <thead><tr><th>Chuyến bay</th><th>Hành trình</th><th>Giờ đi</th><th>Dự kiến</th><th>Giờ đến</th><th>Trạng thái</th></tr></thead>
        <tbody>
          {shown.map((f) => (
            <tr key={f.id} className={changed === f.id ? 'bg-amber-50 transition-colors' : ''}>
              <td className="font-semibold">{f.flight_number}</td>
              <td>{f.origin_city} ({f.origin}) → {f.destination_city} ({f.destination})</td>
              <td>{fmtTime(f.departure_time)}</td>
              <td className="text-amber-700">{f.estimated_departure ? fmtTime(f.estimated_departure) : ''}</td>
              <td>{fmtTime(f.arrival_time)}</td>
              <td><Badge map={FLIGHT_STATUS} value={f.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {!shown.length && <p className="text-sm text-slate-500">Không có chuyến bay.</p>}
    </div>
  )
}
