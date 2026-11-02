import { useEffect, useState } from 'react'
import { api, CABIN, money } from '../api.js'

const SEAT_TYPE = { WINDOW: 'Cửa sổ', MIDDLE: 'Giữa', AISLE: 'Lối đi' }
// Màu theo khu giá, xếp từ rẻ đến đắt (không phụ thuộc mức phí cụ thể admin đặt)
const ZONE_CLS = ['border-slate-400 bg-white', 'border-sky-400 bg-sky-50', 'border-amber-500 bg-amber-50',
  'border-emerald-500 bg-emerald-50', 'border-rose-400 bg-rose-50']

// Sơ đồ ghế dạng lưới: hàng = seat_row, cột = grid_col (cột trống là lối đi).
// selected: flight_seat_id đã gán cho từng hành khách (index = số thứ tự khách).
export default function SeatMap({ flightId, cabin, selected = [], onPick, refreshKey }) {
  const [seats, setSeats] = useState([])

  useEffect(() => {
    const load = () => api(`/flights/${flightId}/seats`).then(setSeats).catch(() => {})
    load()
    const timer = setInterval(load, 10000) // thấy ghế người khác vừa giữ / đặt
    return () => clearInterval(timer)
  }, [flightId, refreshKey])

  const fees = [...new Set(seats.filter((s) => s.cabin_class === cabin).map((s) => s.seat_fee))].sort((a, b) => a - b)
  const zones = fees.map((fee, i) => [fee, ZONE_CLS[Math.min(i, ZONE_CLS.length - 1)]])
  const zoneCls = Object.fromEntries(zones)

  return (
    <div className="space-y-6 overflow-x-auto">
      {['BUSINESS', 'ECONOMY'].map((c) => {
        const list = seats.filter((s) => s.cabin_class === c)
        if (!list.length) return null
        const cols = Math.max(...list.map((s) => s.grid_col))
        const letters = Object.fromEntries(list.map((s) => [s.grid_col, s.seat_letter]))
        const at = new Map(list.map((s) => [`${s.seat_row}-${s.grid_col}`, s]))
        const rows = [...new Set(list.map((s) => s.seat_row))]
        return (
          <div key={c}>
            <h4 className="mb-2 text-sm font-semibold">Khoang {CABIN[c]}</h4>
            <div className="inline-grid gap-1" style={{ gridTemplateColumns: `1.5rem repeat(${cols}, 2.25rem)` }}>
              <span />
              {Array.from({ length: cols }, (_, i) => (
                <span key={`h-${i}`} className="text-center text-xs text-slate-400">{letters[i + 1] ?? ''}</span>
              ))}
              {rows.map((r) => [
                <span key={`r-${r}`} className="self-center text-right text-xs text-slate-400">{r}</span>,
                ...Array.from({ length: cols }, (_, i) => {
                  const s = at.get(`${r}-${i + 1}`)
                  return s
                    ? <Seat key={`s-${s.flight_seat_id}`} seat={s} index={selected.indexOf(s.flight_seat_id)}
                        enabled={c === cabin} zoneCls={zoneCls[s.seat_fee]} onPick={onPick} />
                    : <span key={`g-${r}-${i}`} />
                }),
              ])}
            </div>
          </div>
        )
      })}
      <div className="flex flex-wrap gap-4 text-xs text-slate-600">
        {zones.map(([fee, cls]) => (
          <span key={fee} className="flex items-center gap-1"><i className={`h-4 w-4 rounded border ${cls}`} />
            {Number(fee) ? money(fee) : 'Miễn phí'}</span>
        ))}
        <span className="flex items-center gap-1"><i className="h-4 w-4 rounded bg-sky-600" /> Bạn đã chọn</span>
        <span className="flex items-center gap-1"><i className="h-4 w-4 rounded bg-slate-300" /> Đã có người giữ / đặt</span>
        <span className="flex items-center gap-1"><i className="h-4 w-4 rounded border border-slate-200 bg-slate-100" /> Khác hạng vé</span>
      </div>
    </div>
  )
}

function Seat({ seat, index, enabled, zoneCls, onPick }) {
  const chosen = index >= 0
  const free = seat.status === 'AVAILABLE' || seat.mine
  const fee = Number(seat.seat_fee) ? money(seat.seat_fee) : 'miễn phí'
  const cls = chosen ? 'border-sky-700 bg-sky-600 text-white'
    : !free ? 'border-slate-300 bg-slate-300 text-slate-400'
    : enabled ? `${zoneCls} hover:ring-2 hover:ring-sky-300`
    : 'border-slate-200 bg-slate-100 text-slate-300'
  return (
    <button type="button" disabled={!enabled || !free || chosen} onClick={() => onPick(seat)}
      title={`Ghế ${seat.seat_code} · ${SEAT_TYPE[seat.seat_type]} · ${fee}`}
      aria-label={`Ghế ${seat.seat_code}, ${SEAT_TYPE[seat.seat_type]}, ${fee}${chosen ? `, đã chọn cho khách ${index + 1}` : free ? '' : ', đã có người'}`}
      className={`h-9 rounded-md border text-xs font-medium ${cls}`}>
      {chosen ? `K${index + 1}` : seat.seat_letter}
    </button>
  )
}
