import { useEffect, useRef, useState } from 'react'
import { api, CABIN, money } from '../api.js'
import { ErrorText } from '../ui.jsx'
import { createSeatMapLoader } from './seatMapData.js'
import { getSeedExitRows } from './seatMapLayout.js'
import useSeatMapViewport, { MIN_ZOOM, MAX_ZOOM } from './useSeatMapViewport.js'
import styles from './SeatMap.module.css'

const SEAT_TYPE = { WINDOW: 'Cửa sổ', MIDDLE: 'Giữa', AISLE: 'Lối đi' }
const ZONES = [styles.zone0, styles.zone1, styles.zone2, styles.zone3, styles.zone4]

export default function SeatMap({ flightId, cabin, selected = [], onPick, refreshKey, onSeatsChange }) {
  const [data, setData] = useState({ flightId: null, seats: [], loaded: false })
  const [retry, setRetry] = useState(0)
  const notify = useRef(onSeatsChange)
  notify.current = onSeatsChange
  const seats = data.flightId === flightId ? data.seats : []
  const loaded = data.flightId === flightId && data.loaded
  const loading = !loaded && (data.flightId !== flightId || data.loading)
  const error = data.flightId === flightId ? data.error : ''

  useEffect(() => {
    const initial = data.flightId === flightId ? { seats: data.seats, loaded: data.loaded, error: data.error } : {}
    const loader = createSeatMapLoader(() => api(`/flights/${flightId}/seats`), state => {
      setData({ flightId, ...state })
    }, initial)
    let cancelled = false
    const load = () => loader.load().then(rows => {
      if (!cancelled && rows) notify.current?.(rows, { flightId, refreshKey })
    })
    load()
    const timer = setInterval(load, 10000)
    return () => { cancelled = true; loader.stop(); clearInterval(timer) }
  }, [flightId, refreshKey, retry]) // eslint-disable-line react-hooks/exhaustive-deps

  const fees = [...new Set(seats.filter(s => s.cabin_class === cabin).map(s => Number(s.seat_fee)))].sort((a, b) => a - b)
  const exitRows = getSeedExitRows(seats)
  const maxColumns = Math.max(7, ...seats.map(s => s.grid_col))
  const planeWidth = 144 + 42 + 24 + maxColumns * 42
  const view = useSeatMapViewport(planeWidth, flightId)

  return (
    <section className={styles.root} aria-label="Sơ đồ ghế máy bay">
      <div className={styles.header}>
        <h3 className={styles.heading}>Chọn vị trí yêu thích</h3>
        <span className="text-meta text-muted">Khoang {CABIN[cabin]}</span>
      </div>
      <p className={styles.hint}>Chạm vào ghế còn trống để chọn. Phí chọn ghế hiển thị theo từng khu.</p>
      <div className={styles.toolbar} role="group" aria-label="Điều khiển khung nhìn">
        <button type="button" className="btn-outline" disabled={view.zoom <= MIN_ZOOM} onClick={() => view.zoomBy(-0.25)} aria-label="Thu nhỏ sơ đồ">−</button>
        <output className={styles.zoomLabel} aria-live="polite" aria-label="Mức thu phóng">{Math.round(view.zoom * 100)}%</output>
        <button type="button" className="btn-outline" disabled={view.zoom >= MAX_ZOOM} onClick={() => view.zoomBy(0.25)} aria-label="Phóng to sơ đồ">+</button>
        <button type="button" className="btn-outline" onClick={view.reset}>Đặt lại</button>
      </div>
      <p className={styles.hint}>Kéo để xem sơ đồ, chụm hai ngón để thu phóng. Cuộn trang ở bên ngoài khung.</p>
      {error && <div className={styles.notice}>
        <ErrorText>{error}</ErrorText>
        {seats.length > 0 && <p className={styles.hint}>Đang hiển thị dữ liệu gần nhất. Hãy tải lại trước khi chọn ghế.</p>}
        <button type="button" className="btn-outline mt-2" disabled={data.refreshing} onClick={() => setRetry(value => value + 1)}>Thử tải lại sơ đồ ghế</button>
      </div>}
      {loading && <p role="status" className={styles.notice}>Đang tải sơ đồ ghế…</p>}
      {loaded && !seats.length && !error && <div className={styles.notice}>
        <p role="status">Chuyến bay hiện chưa có dữ liệu sơ đồ ghế. Bạn có thể để hệ thống xếp ghế khi làm thủ tục.</p>
        <button type="button" className="btn-outline mt-2" onClick={() => setRetry(value => value + 1)}>Tải lại sơ đồ ghế</button>
      </div>}
      <div ref={view.viewportRef} className={styles.viewport} tabIndex={0} role="region" aria-label="Khung xem sơ đồ ghế"
        {...view.handlers} onDragStart={event => event.preventDefault()}>
        <div className={styles.canvas} style={view.canvasStyle}>
          <div ref={view.planeRef} className={styles.plane} style={view.planeStyle}>
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
                              enabled={c === cabin} blocked={!!error} zone={fees.indexOf(Number(seat.seat_fee))} onPick={onPick} /> : <span key={`aisle-${i}`} aria-hidden="true" />
                          })}
                        </div>
                      </div>
                    ))}
                  </section>
                )
              })}
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

function Seat({ seat, index, enabled, blocked, zone, onPick }) {
  const chosen = index >= 0
  const free = seat.status === 'AVAILABLE' || seat.mine
  const fee = Number(seat.seat_fee) ? money(seat.seat_fee) : 'miễn phí'
  const status = chosen ? `đã chọn cho khách ${index + 1}` : blocked ? 'chưa xác minh tình trạng ghế' : !free ? 'đã có người giữ, đặt hoặc khóa' : !enabled ? 'khác khoang' : 'còn trống'
  const stateClass = chosen ? styles.seatSelected : !free ? styles.seatUnavailable : !enabled || blocked ? styles.seatOther : ZONES[Math.min(zone, ZONES.length - 1)]
  return (
    <button type="button" disabled={!enabled || !free || chosen || blocked} onClick={() => onPick(seat)} aria-pressed={chosen}
      title={`Ghế ${seat.seat_code} · ${SEAT_TYPE[seat.seat_type]} · ${fee} · ${status}`}
      aria-label={`Ghế ${seat.seat_code}, ${SEAT_TYPE[seat.seat_type]}, ${fee}, ${status}`}
      className={`${styles.seat} ${stateClass}`}>
      {chosen ? `K${index + 1}` : seat.seat_code}
      <span className={styles.seatMark} aria-hidden="true">{chosen ? '✓' : !free ? '×' : !enabled ? '—' : zone + 1}</span>
    </button>
  )
}
