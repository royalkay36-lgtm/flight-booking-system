import { useEffect, useState } from 'react'
import { api, CABIN, money } from '../api.js'
import { getSeedExitRows } from './seatMapLayout.js'
import styles from './SeatMap.module.css'

const SEAT_TYPE = { WINDOW: 'Cửa sổ', MIDDLE: 'Giữa', AISLE: 'Lối đi' }
const ZONES = [styles.zone0, styles.zone1, styles.zone2, styles.zone3, styles.zone4]

export default function SeatMap({ flightId, cabin, selected = [], onPick, refreshKey }) {
  const [seats, setSeats] = useState([])

  useEffect(() => {
    let cancelled = false
    const load = () => api(`/flights/${flightId}/seats`).then(data => {
      if (!cancelled) setSeats(data)
    }).catch(() => {})
    setSeats([])
    load()
    const timer = setInterval(load, 10000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [flightId, refreshKey])

  const fees = [...new Set(seats.filter(s => s.cabin_class === cabin).map(s => Number(s.seat_fee)))].sort((a, b) => a - b)
  const exitRows = getSeedExitRows(seats)
  const maxColumns = Math.max(7, ...seats.map(s => s.grid_col))
  const planeWidth = 144 + 42 + 24 + maxColumns * 42

  return (
    <section className={styles.root} aria-label="Sơ đồ ghế máy bay">
      <div className={styles.header}>
        <h3 className={styles.heading}>Chọn vị trí yêu thích</h3>
        <span className="text-meta text-muted">Khoang {CABIN[cabin]}</span>
      </div>
      <p className={styles.hint}>Chạm vào ghế còn trống để chọn. Phí chọn ghế hiển thị theo từng khu.</p>
      <div className={styles.viewport} tabIndex={0} role="region" aria-label="Khung xem sơ đồ ghế">
        <div className={styles.canvas}>
          <div className={styles.plane} style={{ width: planeWidth }}>
            <div aria-hidden="true" className={`${styles.wing} ${styles.wingLeft}`} />
            <div aria-hidden="true" className={`${styles.wing} ${styles.wingRight}`} />
            <div className={styles.fuselage}>
              <svg className={styles.cockpit} aria-hidden="true" viewBox="0 0 90 36">
                <path fill="currentColor" d="M5 25Q13 6 41 3v22H5Zm44 0V3q28 3 36 22H49Z" />
              </svg>
              <span className={styles.noseLabel}>Đầu máy bay</span>
              {['BUSINESS', 'ECONOMY'].map(c => {
                const list = seats.filter(s => s.cabin_class === c)
                if (!list.length) return null
                const cols = Math.max(...list.map(s => s.grid_col))
                const letters = Object.fromEntries(list.map(s => [s.grid_col, s.seat_letter]))
                const at = new Map(list.map(s => [`${s.seat_row}-${s.grid_col}`, s]))
                const rows = [...new Set(list.map(s => s.seat_row))].sort((a, b) => a - b)
                const columns = { gridTemplateColumns: `24px repeat(${cols}, 36px)` }
                return (
                  <section key={c} className={styles.cabin} aria-label={`Khoang ${CABIN[c]}`}>
                    <h4 className={styles.cabinTitle}>Khoang {CABIN[c]}</h4>
                    <div className={styles.row} style={columns} aria-hidden="true">
                      <span />
                      {Array.from({ length: cols }, (_, i) => <span key={i} className={styles.column}>{letters[i + 1] ?? ''}</span>)}
                    </div>
                    {rows.map(row => (
                      <div key={row}>
                        {exitRows?.has(row) && <div className={styles.exit}>← Thoát hiểm · Hàng {row} →</div>}
                        <div className={styles.row} style={columns}>
                          <span className={styles.rowNumber}>{row}</span>
                          {Array.from({ length: cols }, (_, i) => {
                            const seat = at.get(`${row}-${i + 1}`)
                            return seat ? <Seat key={seat.flight_seat_id} seat={seat} index={selected.indexOf(seat.flight_seat_id)}
                              enabled={c === cabin} zone={fees.indexOf(Number(seat.seat_fee))} onPick={onPick} /> : <span key={`aisle-${i}`} aria-hidden="true" />
                          })}
                        </div>
                      </div>
                    ))}
                  </section>
                )
              })}
              {!seats.length && <p className={styles.hint} role="status">Đang tải sơ đồ ghế…</p>}
              <div className={styles.tail}>Đuôi máy bay</div>
            </div>
          </div>
        </div>
      </div>
      <div className={styles.legend} aria-label="Chú thích khu giá">
        {fees.map((fee, i) => <span key={fee} className={styles.legendItem}>
          <span className={`${styles.swatch} ${ZONES[Math.min(i, ZONES.length - 1)]}`}>{i + 1}</span>
          Khu {i + 1} · {fee ? money(fee) : 'Miễn phí'}
        </span>)}
      </div>
      <div className={styles.legend} aria-label="Chú thích trạng thái ghế">
        <span>Mã ghế · Còn trống</span><span>K1 ✓ · Bạn đã chọn</span>
        <span>× · Đã giữ, đặt hoặc khóa</span><span>— · Khác khoang</span>
      </div>
      {seats.length > 0 && <p className={styles.hint}>{exitRows ? 'Lối thoát hiểm theo bố cục máy bay trong dữ liệu mẫu.' : 'Sơ đồ này chưa có thông tin vị trí lối thoát hiểm.'}</p>}
    </section>
  )
}

function Seat({ seat, index, enabled, zone, onPick }) {
  const chosen = index >= 0
  const free = seat.status === 'AVAILABLE' || seat.mine
  const fee = Number(seat.seat_fee) ? money(seat.seat_fee) : 'miễn phí'
  const status = chosen ? `đã chọn cho khách ${index + 1}` : !free ? 'đã có người giữ, đặt hoặc khóa' : !enabled ? 'khác khoang' : 'còn trống'
  const stateClass = chosen ? styles.seatSelected : !free ? styles.seatUnavailable : !enabled ? styles.seatOther : ZONES[Math.min(zone, ZONES.length - 1)]
  return (
    <button type="button" disabled={!enabled || !free || chosen} onClick={() => onPick(seat)} aria-pressed={chosen}
      title={`Ghế ${seat.seat_code} · ${SEAT_TYPE[seat.seat_type]} · ${fee} · ${status}`}
      aria-label={`Ghế ${seat.seat_code}, ${SEAT_TYPE[seat.seat_type]}, ${fee}, ${status}`}
      className={`${styles.seat} ${stateClass}`}>
      {chosen ? `K${index + 1}` : seat.seat_code}
      <span className={styles.seatMark} aria-hidden="true">{chosen ? '✓' : !free ? '×' : !enabled ? '—' : zone + 1}</span>
    </button>
  )
}
