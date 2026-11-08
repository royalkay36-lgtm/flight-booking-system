import QRCode from 'qrcode'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { fmtDateTime } from '../api.js'
import { ErrorText, PlaneMark } from '../ui.jsx'
import styles from './BoardingPass.module.css'

export default function BoardingPass({ tickets, pnr, onClose }) {
  const dialogRef = useRef(null)
  const [qrCodes, setQrCodes] = useState([])
  const [loadedIds, setLoadedIds] = useState(() => new Set())
  const [error, setError] = useState('')

  useEffect(() => {
    const dialog = dialogRef.current
    dialog.showModal()
    return () => dialog.close()
  }, [])

  useEffect(() => {
    let active = true
    Promise.all(tickets.map((ticket) => QRCode.toDataURL(
      `${pnr}|${ticket.ticket_number}|${ticket.flight_number}|${ticket.seat_code ?? ''}|${ticket.full_name}`,
      { width: 512, margin: 4, color: { dark: '#000000', light: '#ffffff' } },
    )))
      .then((codes) => { if (active) setQrCodes(codes) })
      .catch(() => { if (active) setError('Không tạo được mã QR. Hãy đóng và mở lại thẻ.') })
    return () => { active = false }
  }, [tickets, pnr])

  const ready = loadedIds.size === tickets.length && !error

  return createPortal(
    <dialog
      ref={dialogRef}
      aria-labelledby="boarding-pass-title"
      className={styles.dialog}
      onCancel={(event) => { event.preventDefault(); onClose() }}
    >
      <header className={styles.toolbar}>
        <div>
          <h2 id="boarding-pass-title" className="text-lead font-bold">Thẻ lên máy bay</h2>
          <p className="text-meta text-muted">Mã đặt chỗ {pnr}{tickets.length > 1 && ` · ${tickets.length} thẻ đã cấp`}</p>
        </div>
        <button type="button" className="btn-outline" onClick={onClose} autoFocus>Đóng</button>
      </header>
      <div className={styles.cards}>
        {tickets.map((ticket, index) => (
          <PassCard
            key={ticket.id}
            ticket={ticket}
            pnr={pnr}
            qr={qrCodes[index]}
            onQrLoad={() => setLoadedIds((previous) => new Set(previous).add(ticket.id))}
            onQrError={() => setError('Không hiển thị được mã QR. Hãy đóng và mở lại thẻ.')}
          />
        ))}
      </div>
      <footer className={styles.toolbar}>
        {error ? <ErrorText>{error}</ErrorText> : (
          <p role="status" className="text-meta text-muted">
            {ready ? `Sẵn sàng in ${tickets.length} thẻ` : 'Đang chuẩn bị mã QR…'}
          </p>
        )}
        <button type="button" className="btn" disabled={!ready} onClick={() => window.print()}>
          {tickets.length === 1 ? 'In thẻ lên máy bay' : `In ${tickets.length} thẻ lên máy bay`}
        </button>
      </footer>
    </dialog>,
    document.body,
  )
}

function PassCard({ ticket, pnr, qr, onQrLoad, onQrError }) {
  const seat = ticket.seat_code ?? (ticket.passenger_type === 'INFANT' ? 'Không có ghế riêng' : 'Chưa có số ghế')

  return (
    <article className={styles.ticket} aria-label={`Thẻ ${ticket.full_name} · ${ticket.flight_number}`}>
      <div className={styles.main}>
        <header className={styles.brand}>
          <PlaneMark className="h-6 w-6 shrink-0" />
          <div>
            <strong>SkyBooking</strong>
            {ticket.airline_name && <span>{ticket.airline_name}</span>}
          </div>
          <span className={styles.flightNumber}>{ticket.flight_number}</span>
        </header>

        <div className={styles.details}>
          <div className={styles.route}>
            <div>
              <span className={styles.caption}>Điểm đi</span>
              <strong className={styles.airportCode}>{ticket.origin}</strong>
              <span>{ticket.origin_city}</span>
            </div>
            <PlaneMark className={styles.routeIcon} angle={90} />
            <div>
              <span className={styles.caption}>Điểm đến</span>
              <strong className={styles.airportCode}>{ticket.destination}</strong>
              <span>{ticket.destination_city}</span>
            </div>
          </div>

          <dl className={styles.passenger}>
            <div>
              <dt className={styles.caption}>Hành khách</dt>
              <dd className={styles.name}>{ticket.full_name}</dd>
            </div>
            <div className={styles.seat}>
              <dt className={styles.caption}>Ghế</dt>
              <dd className={ticket.seat_code ? styles.seatCode : undefined}>{seat}</dd>
            </div>
          </dl>

          <dl className={styles.facts}>
            <div>
              <dt className={styles.caption}>Khởi hành (UTC+7)</dt>
              <dd>{fmtDateTime(ticket.departure_time)}</dd>
            </div>
            {ticket.estimated_departure && (
              <div>
                <dt className={styles.caption}>Khởi hành dự kiến (UTC+7)</dt>
                <dd>{fmtDateTime(ticket.estimated_departure)}</dd>
              </div>
            )}
            {ticket.fare_name && (
              <div><dt className={styles.caption}>Hạng vé</dt><dd>{ticket.fare_name}</dd></div>
            )}
            <div><dt className={styles.caption}>Mã đặt chỗ</dt><dd>{pnr}</dd></div>
            <div><dt className={styles.caption}>Số vé</dt><dd>{ticket.ticket_number}</dd></div>
          </dl>
        </div>
      </div>

      <div className={styles.stub}>
        <strong className={styles.caption}>Cuống thẻ</strong>
        <p className={styles.stubRoute}>{ticket.origin} → {ticket.destination}</p>
        <p>{ticket.flight_number}{ticket.seat_code && ` · Ghế ${ticket.seat_code}`}</p>
        <div className={styles.qr}>
          {qr && (
            <img
              src={qr}
              width={512}
              height={512}
              alt={`Mã QR thẻ của ${ticket.full_name}, chuyến ${ticket.flight_number}`}
              onLoad={onQrLoad}
              onError={onQrError}
            />
          )}
        </div>
        <span className={styles.caption}>Quét mã khi lên máy bay</span>
      </div>
    </article>
  )
}
