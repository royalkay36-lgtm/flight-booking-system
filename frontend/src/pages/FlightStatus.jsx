import { useEffect, useState } from 'react'
import { api, fmtDate, fmtTime, FLIGHT_STATUS, isoDate } from '../api.js'
import { PageHeader } from '../ui.jsx'

// Màu trạng thái trên bảng điện tử nền tối (sáng, đủ tương phản trên #101418)
const BOARD_TONE = {
  ON_TIME: 'text-[#5fd394]',
  DELAYED: 'text-[#f5c25b]',
  CANCELLED: 'text-[#ff8a94]',
  BOARDING: 'text-[#8fd0fa]',
  DEPARTED: 'text-[#6fd6c8]',
}

export default function FlightStatus() {
  const [date, setDate] = useState(isoDate())
  const [query, setQuery] = useState('')
  const [flights, setFlights] = useState(null)
  const [error, setError] = useState('')
  const [changed, setChanged] = useState(null)

  useEffect(() => {
    setFlights(null)
    setError('')
    const load = () => api(`/flight-status?date=${date}`).then((f) => { setFlights(f); setError('') }).catch((e) => setError(e.message))
    load()
    const id = setInterval(load, 15000)  // dự phòng khi không có realtime (bản demo trên Vercel)
    return () => clearInterval(id)
  }, [date])

  // Realtime: server đẩy sự kiện mỗi khi nhân viên đổi trạng thái chuyến bay
  useEffect(() => {
    const source = new EventSource('/api/flight-status/stream')
    source.onmessage = (e) => {
      const u = JSON.parse(e.data)
      setFlights((fs) => fs && fs.map((f) => (f.id === u.flight_id ? { ...f, status: u.status, estimated_departure: u.estimated_departure } : f)))
      setChanged({ id: u.flight_id, at: Date.now() })
    }
    return () => source.close()
  }, [])

  const q = query.trim().toLowerCase()
  const shown = (flights ?? []).filter((f) => !q || [f.flight_number, f.origin_city, f.destination_city, f.origin, f.destination].some((v) => v?.toLowerCase().includes(q)))
  const count = (s) => (flights ?? []).filter((f) => f.status === s).length
  const dayLabel = date === isoDate() ? 'Hôm nay' : fmtDate(date)

  return (
    <div className="space-y-6">
      <PageHeader title="Trạng thái chuyến bay" actions={<>
        <label className="w-full sm:w-64">
          <span className="sr-only">Tìm theo số hiệu hoặc thành phố</span>
          <input className="input" placeholder="Số hiệu hoặc thành phố" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <label className="w-full sm:w-44">
          <span className="sr-only">Ngày bay</span>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </>}>
        <p className="flex flex-wrap items-center gap-x-3">
          <span>
            {dayLabel}: {flights ? <><b className="font-semibold text-ink">{flights.length}</b> chuyến · {count('DELAYED')} hoãn · {count('CANCELLED')} huỷ</> : 'đang tải…'}
          </span>
          <span className="inline-flex items-center gap-1.5 text-meta text-[#1f7a4c]">
            <span className="relative flex h-2 w-2" aria-hidden="true"><span className="ping absolute inset-0 rounded-full bg-[#2fa866]" /><span className="relative h-2 w-2 rounded-full bg-[#2fa866]" /></span> Cập nhật trực tiếp
          </span>
        </p>
      </PageHeader>

      <section aria-label="Bảng giờ bay" className="overflow-hidden rounded-3xl bg-board text-white">
        <div className="hidden grid-cols-[96px_110px_1fr_96px_96px_170px] gap-4 px-6 pb-3 pt-5 text-meta text-[#a9b4bf] md:grid">
          <span>Giờ đi</span><span>Chuyến bay</span><span>Hành trình</span><span>Dự kiến</span><span>Giờ đến</span><span>Trạng thái</span>
        </div>
        <ul>
          {shown.map((f, i) => {
            const tone = BOARD_TONE[f.status] ?? 'text-[#c4ccd4]'
            return (
              <li key={f.id} style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }} className={`rise relative grid grid-cols-[72px_1fr_auto] gap-x-4 gap-y-1 border-t border-board-row px-5 py-4 md:grid-cols-[96px_110px_1fr_96px_96px_170px] md:items-center md:px-6`}>
                {changed?.id === f.id && <span key={changed.at} className="flash pointer-events-none absolute inset-0" aria-hidden="true" />}
                <span className={`num text-title font-semibold leading-none ${f.status === 'CANCELLED' ? 'text-[#8d98a3] line-through' : ''}`}>{fmtTime(f.departure_time)}</span>
                <span className="text-ui font-medium tracking-wide text-[#dfe6ec]">{f.flight_number}</span>
                <span className="col-span-3 row-start-2 text-ui md:col-span-1 md:row-start-auto">
                  {f.origin_city} <span className="text-[#a9b4bf]">{f.origin}</span>
                  <span className="mx-2 text-[#a9b4bf]" aria-hidden="true">→</span>
                  {f.destination_city} <span className="text-[#a9b4bf]">{f.destination}</span>
                </span>
                <span className={`num hidden md:block ${f.estimated_departure ? BOARD_TONE.DELAYED : 'text-[#6f7b86]'}`}>
                  {f.estimated_departure ? fmtTime(f.estimated_departure) : '—'}
                </span>
                <span className="num hidden text-[#c4ccd4] md:block">{fmtTime(f.arrival_time)}</span>
                <span className={`col-start-3 row-start-1 flex items-center justify-end gap-2 text-ui font-medium md:col-start-auto md:row-start-auto md:justify-start ${tone}`}>
                  <span className="h-2 w-2 flex-none rounded-full bg-current" aria-hidden="true" />
                  {FLIGHT_STATUS[f.status]?.[0] ?? f.status}
                  {f.estimated_departure && <span className="num md:hidden">· {fmtTime(f.estimated_departure)}</span>}
                </span>
              </li>
            )
          })}
        </ul>
        {error && <p className="border-t border-board-row px-6 py-6 text-[#ff8a94]">Không tải được lịch bay: {error}</p>}
        {flights && !shown.length && !error && (
          <p className="border-t border-board-row px-6 py-8 text-[#c4ccd4]">
            {q ? `Không có chuyến nào khớp “${query}” trong ngày này.` : 'Không có chuyến bay nào trong ngày này.'}
          </p>
        )}
        {!flights && !error && <p className="border-t border-board-row px-6 py-8 text-[#c4ccd4]">Đang tải lịch bay…</p>}
      </section>
    </div>
  )
}
