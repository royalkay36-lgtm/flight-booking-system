import { useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import {
  api,
  BOOKING_STATUS,
  CABIN,
  duration,
  fmtDate,
  fmtDateTime,
  fmtTime,
  FLIGHT_STATUS,
  isoDate,
  money,
  PAX,
  TICKET_STATUS,
} from '../api.js'
import { Badge, ErrorText, openChat, PageHeader, PlaneMark, useAuth } from '../ui.jsx'
import {
  bookingProgress,
  cancelReason,
  changeReason,
  checkInReason,
  groupLegs,
} from '../components/bookingDetailState.js'
import BoardingPass from '../components/BoardingPass.jsx'
import styles from './BookingDetail.module.css'

const METHODS = {
  VNPAY: 'VNPAY',
  MOMO: 'Ví MoMo',
  ZALOPAY: 'ZaloPay',
  CARD: 'Thẻ quốc tế',
}

function fareLabel(ticket) {
  const cabin = CABIN[ticket.cabin_class]
  return cabin && ticket.fare_name?.startsWith(cabin)
    ? ticket.fare_name
    : [cabin, ticket.fare_name].filter(Boolean).join(' · ')
}

export default function BookingDetail() {
  const { pnr } = useParams()
  const [params] = useSearchParams()
  const lastName = params.get('last_name')
  const guest = lastName
    ? `?${new URLSearchParams({ last_name: lastName })}`
    : ''
  return <BookingContent key={pnr + guest} pnr={pnr} guest={guest} />
}

function BookingContent({ pnr, guest }) {
  const { user } = useAuth()
  const [booking, setBooking] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [feedbackArea, setFeedbackArea] = useState('')
  const [loading, setLoading] = useState(true)
  const [stale, setStale] = useState(false)
  const [busy, setBusy] = useState('')
  const lock = useRef(false)
  const mounted = useRef(false)
  const [changing, setChanging] = useState(null)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [pass, setPass] = useState(null)
  const [now, setNow] = useState(Date.now())
  const path = `/bookings/${pnr}${guest}`
  const load = async () => {
    const data = await api(path)
    if (mounted.current) {
      setBooking(data)
      setStale(false)
    }
  }
  useEffect(() => {
    mounted.current = true
    let cancelled = false
    api(path)
      .then((data) => {
        if (!cancelled) setBooking(data)
      })
      .catch((e) => {
        if (!cancelled) setError(e.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    const timer = setInterval(() => setNow(Date.now()), 15000)
    return () => {
      mounted.current = false
      cancelled = true
      clearInterval(timer)
    }
  }, [path])

  const refresh = async () => {
    if (lock.current) return
    lock.current = true
    setBusy('refresh')
    setError('')
    setLoading(true)
    try {
      await load()
    } catch (e) {
      setError(e.message)
      setStale(true)
    } finally {
      lock.current = false
      if (mounted.current) {
        setBusy('')
        setLoading(false)
      }
    }
  }
  const run = async (key, fn, ok) => {
    if (lock.current || stale) return false
    lock.current = true
    setBusy(key)
    setFeedbackArea(key === 'pay' ? 'payment' : 'actions')
    setError('')
    setMessage('')
    let applied = false
    try {
      const result = await fn()
      applied = true
      await load()
      if (mounted.current)
        setMessage(typeof ok === 'function' ? ok(result) : ok)
      return true
    } catch (e) {
      if (mounted.current) {
        setError(
          applied
            ? `Máy chủ đã xử lý thao tác, nhưng chưa tải được trạng thái mới: ${e.message}. Hãy tải lại dữ liệu trước khi tiếp tục.`
            : e.message,
        )
        if (applied) setStale(true)
      }
      return false
    } finally {
      lock.current = false
      if (mounted.current) setBusy('')
    }
  }
  if (!booking)
    return (
      <div className={styles.page}>
        <PageHeader title="Chi tiết đặt chỗ" />
        {loading && <p role="status">Đang tải đặt chỗ…</p>}
        <ErrorText>{error}</ErrorText>
        {!loading && (
          <>
            <button className="btn-outline" onClick={refresh}>
              Thử tải lại
            </button>
            <Link className="text-brand-ink underline" to="/?tab=manage">
              Tra cứu lại bằng mã đặt chỗ và họ
            </Link>
          </>
        )}
      </div>
    )

  const canAct =
    !!guest ||
    user?.id === booking.user_id ||
    ['STAFF', 'ADMIN'].includes(user?.role)
  const active = booking.tickets.filter((t) => t.status !== 'CANCELLED')
  const issuedPasses = active.filter((ticket) => ['CHECKED_IN', 'BOARDED'].includes(ticket.status))
  const history = booking.tickets.filter((t) => t.status === 'CANCELLED')
  const legs = groupLegs(active.length ? active : history)
  const progress = bookingProgress(booking)
  const blocked = !!busy || stale
  const cancelWhy = cancelReason(booking)
  const expiredPending =
    booking.status === 'PENDING' &&
    booking.expires_at &&
    new Date(booking.expires_at).getTime() <= now
  const checkable = active.filter((t) => !checkInReason(booking, t, now))
  const airlineCancelled =
    active.some((t) => t.flight_status === 'CANCELLED') &&
    booking.status === 'CONFIRMED'
  const cancel = async () => {
    const ok = await run(
      'cancel',
      () => api(`/bookings/${pnr}/cancel${guest}`, { method: 'POST' }),
      (r) => `Đã hủy toàn bộ đặt chỗ ${pnr}. Số tiền hoàn: ${money(r.refund)}.`,
    )
    if (ok) {
      setConfirmCancel(false)
      setChanging(null)
    }
  }

  const feedback = (
    <>
      <ErrorText>{error}</ErrorText>
      {message && (
        <p role="status" className="rounded-xl bg-green-50 p-3 text-green-800">
          {message}
        </p>
      )}
      {stale && (
        <button className="btn-outline" disabled={!!busy} onClick={refresh}>
          Tải lại dữ liệu đặt chỗ
        </button>
      )}
    </>
  )

  return (
    <div className={styles.page}>
      <PageHeader title="Chi tiết đặt chỗ">
        Hành trình, trạng thái và các thao tác cho chuyến đi của bạn.
      </PageHeader>
      <section
        aria-label="Thông tin đặt chỗ"
        className={`card ${styles.header}`}
      >
        <div>
          <span className="text-meta text-muted">Mã đặt chỗ (PNR)</span>
          <p className="font-mono text-title font-bold tracking-widest">
            {booking.pnr}
          </p>
        </div>
        <Badge map={BOOKING_STATUS} value={booking.status} />
        <button type="button" className="btn-outline min-h-11 lg:hidden" onClick={openChat}>
          Hỏi trợ lý về đặt chỗ
        </button>
        <div className="text-meta text-muted">
          <p>{booking.contact_email}</p>
          <p>{booking.contact_phone}</p>
        </div>
        <div className={styles.amount}>
          <p className="text-meta text-muted">Tổng tiền đặt chỗ</p>
          <p className="text-lead font-bold">{money(booking.total_amount)}</p>
          {Number(booking.discount_amount) > 0 && (
            <p className="text-meta text-muted">
              Đã giảm {money(booking.discount_amount)} · {booking.voucher_code}
            </p>
          )}
        </div>
      </section>
      {!feedbackArea && feedback}
      {airlineCancelled && (
        <p className="rounded-xl bg-red-50 p-3 text-red-800">
          Có chuyến bay bị hãng hủy. Bạn có thể xem báo giá đổi chuyến miễn phí
          hoặc hoàn tiền theo chính sách của chặng bị hủy.
        </p>
      )}

      <section aria-labelledby="itinerary-title" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="itinerary-title" className="text-lead font-bold">
            {progress.stopped ? 'Lịch sử hành trình' : 'Hành trình của bạn'}
          </h2>
          {issuedPasses.length > 1 && (
            <button className="btn-outline" onClick={() => setPass(issuedPasses)}>
              Xem tất cả thẻ lên máy bay ({issuedPasses.length})
            </button>
          )}
        </div>
        <p className="text-meta text-muted">
          Ngày giờ hiển thị theo giờ Việt Nam (UTC+7).
          {progress.stopped &&
            ' Các vé dưới đây không còn hiệu lực, bao gồm vé đã đổi trước đó nếu có.'}
        </p>
        {!legs.length && (
          <p className="card">Chưa có dữ liệu vé cho hành trình này.</p>
        )}
        {legs.map((leg, index) => (
          <article
            key={leg.flight_id}
            className="card space-y-3"
            aria-label={`Chặng ${index + 1}: ${leg.origin} đến ${leg.destination}`}
          >
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-meta text-muted">Chặng {index + 1}</span>
              <h3 className="font-bold">{leg.flight_number}</h3>
              {leg.airline_name && <span>{leg.airline_name}</span>}
              <Badge map={FLIGHT_STATUS} value={leg.flight_status} />
            </div>
            <div className={styles.route}>
              <div className={styles.endpoint}>
                <strong className="text-title">{leg.origin}</strong>
                <span>{leg.origin_city}</span>
                <strong className="text-lead">
                  {fmtTime(leg.departure_time)}
                </strong>
                <span className="text-meta text-muted">
                  {fmtDate(leg.departure_time)}
                </span>
              </div>
              <div className={styles.connector}>
                <PlaneMark angle={90} className="h-7 w-7" />
                <span>{duration(leg.departure_time, leg.arrival_time)}</span>
                <span aria-hidden="true">────────</span>
              </div>
              <div className={styles.endpoint}>
                <strong className="text-title">{leg.destination}</strong>
                <span>{leg.destination_city}</span>
                <strong className="text-lead">
                  {fmtTime(leg.arrival_time)}
                </strong>
                <span className="text-meta text-muted">
                  {fmtDate(leg.arrival_time)}
                </span>
              </div>
            </div>
            {leg.estimated_departure && (
              <p className="text-meta text-amber-800">
                Giờ khởi hành dự kiến: {fmtDateTime(leg.estimated_departure)}
              </p>
            )}
            <div className={styles.passengers}>
              {leg.tickets.map((ticket) => (
                <div key={ticket.id} className={styles.passenger}>
                  <div className="flex flex-wrap items-center gap-2">
                    <strong>{ticket.full_name}</strong>
                    <Badge map={TICKET_STATUS} value={ticket.status} />
                  </div>
                  <p className="text-meta text-muted">
                    {PAX[ticket.passenger_type]}
                  </p>
                  <dl className={styles.facts}>
                    <div>
                      <dt>Ghế</dt>
                      <dd className="font-semibold">
                        {ticket.seat_code ??
                          (ticket.passenger_type === 'INFANT'
                            ? 'Không có ghế riêng'
                            : 'Xếp khi check-in')}
                      </dd>
                    </div>
                    <div>
                      <dt>Hạng vé</dt>
                      <dd>
                        {fareLabel(ticket)}
                      </dd>
                    </div>
                    <div>
                      <dt>Số vé</dt>
                      <dd className="font-mono text-meta">
                        {ticket.ticket_number}
                      </dd>
                    </div>
                    <div>
                      <dt>Hành lý</dt>
                      <dd className="text-meta">
                        {ticket.checked_baggage_kg}kg ký gửi ·{' '}
                        {ticket.carry_on_kg}kg xách tay
                      </dd>
                    </div>
                  </dl>
                  {ticket.checked_in_at && (
                    <p className="text-meta text-muted">
                      Đã check-in: {fmtDateTime(ticket.checked_in_at)}
                    </p>
                  )}
                  {issuedPasses.includes(ticket) && (
                    <button
                      className="btn-outline"
                      onClick={() => setPass([ticket])}
                    >
                      Thẻ lên máy bay · {ticket.full_name} ·{' '}
                      {ticket.flight_number}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className="card" aria-labelledby="progress-title">
        <h2 id="progress-title" className="text-lead font-bold">
          Trạng thái đặt chỗ
        </h2>
        {progress.stopped && (
          <p className="mt-2 rounded-xl bg-red-50 p-3 text-red-800">
            {booking.status === 'CANCELLED'
              ? 'Đặt chỗ đã hủy. Hành trình không còn hiệu lực.'
              : 'Đặt chỗ đã hết hạn thanh toán. Hãy tìm và đặt chuyến mới.'}
          </p>
        )}
        <ol className={styles.timeline}>
          {progress.steps.map((step, index) => (
            <li
              key={step.label}
              className={styles.step}
              data-state={step.state}
              aria-current={step.state === 'current' ? 'step' : undefined}
            >
              <span className={styles.marker} aria-hidden="true">
                {step.state === 'done'
                  ? '✓'
                  : step.state === 'stopped'
                    ? '–'
                    : index + 1}
              </span>
              <strong>{step.label}</strong>
              <p className="mt-1 text-meta text-muted">{step.detail}</p>
              {step.time && (
                <p className="mt-1 text-meta text-muted">
                  {fmtDateTime(step.time)}
                </p>
              )}
            </li>
          ))}
        </ol>
      </section>

      {booking.status === 'PENDING' && canAct && (
        <>
          {expiredPending ? (
            <div className="card space-y-3">
              <p>
                Đã qua hạn thanh toán hiển thị. Tải lại để kiểm tra trạng thái
                từ hệ thống.
              </p>
              <button
                className="btn-outline"
                disabled={blocked}
                onClick={refresh}
              >
                Kiểm tra trạng thái
              </button>
            </div>
          ) : (
            <PayBox
              booking={booking}
              busy={blocked}
              onPay={(method) =>
                run(
                  'pay',
                  () =>
                    api(`/bookings/${pnr}/pay${guest}`, {
                      method: 'POST',
                      body: { method },
                    }),
                  'Thanh toán thành công. Vé điện tử đã được phát hành.',
                )
              }
            />
          )}
        </>
      )}

      {feedbackArea === 'payment' && feedback}
      <section className="card space-y-4" aria-labelledby="actions-title">
        <h2 id="actions-title" className="text-lead font-bold">
          Quản lý chuyến đi
        </h2>
        {!canAct && (
          <p>
            Bạn cần đăng nhập bằng tài khoản đặt vé hoặc tra cứu bằng mã đặt chỗ
            và họ để thao tác.
          </p>
        )}
        <div className={styles.actions}>
          <div className={styles.action}>
            <h3>Đổi chuyến</h3>
            <p>
              Áp dụng cho toàn bộ hành khách trên chặng được chọn. Xem báo giá
              trước khi xác nhận.
            </p>
            {legs.map((leg) => {
              const reason = changeReason(booking, leg, now)
              return (
                <div key={leg.flight_id} className="w-full space-y-2">
                  <button
                    className="btn-outline w-full"
                    disabled={blocked || !canAct || !!reason}
                    aria-expanded={changing === leg.flight_id}
                    aria-controls={
                      changing === leg.flight_id
                        ? `change-${leg.flight_id}`
                        : undefined
                    }
                    onClick={() =>
                      setChanging(
                        changing === leg.flight_id ? null : leg.flight_id,
                      )
                    }
                  >
                    Đổi chuyến {leg.flight_number}
                  </button>
                  {reason && <p>{reason}</p>}
                </div>
              )
            })}
          </div>
          <div className={styles.action}>
            <h3>Hủy đặt chỗ</h3>
            <p>
              Hủy toàn bộ đặt chỗ {booking.pnr}, gồm tất cả hành khách và chặng
              còn hiệu lực.
            </p>
            {booking.refund?.notes?.map((note) => (
              <p key={note}>{note}</p>
            ))}
            {booking.status === 'CONFIRMED' &&
              booking.refund?.amount != null && (
                <p>
                  Tiền hoàn theo báo giá:{' '}
                  <strong>{money(booking.refund.amount)}</strong>
                </p>
              )}
            {cancelWhy && !booking.refund?.notes?.includes(cancelWhy) && (
              <p>{cancelWhy}</p>
            )}
            <button
              className="btn-outline border-red-300 text-red-800"
              disabled={blocked || !canAct || !!cancelWhy}
              onClick={() => setConfirmCancel(true)}
            >
              Hủy đặt chỗ
            </button>
          </div>
          <div className={styles.action}>
            <h3>Check-in</h3>
            <p>
              Làm thủ tục riêng cho từng vé. {progress.completed}/
              {progress.total} vé còn hiệu lực đã check-in.
            </p>
            {active.map((ticket) => {
              const reason = checkInReason(booking, ticket, now)
              return (
                <div key={ticket.id} className="w-full space-y-2">
                  <p className="font-semibold">
                    {ticket.full_name} · {ticket.flight_number}
                  </p>
                  {['CHECKED_IN', 'BOARDED'].includes(ticket.status) ? (
                    <span className="text-meta">Đã check-in ✓</span>
                  ) : (
                    <>
                      <button
                        className="btn-outline w-full"
                        disabled={blocked || !canAct || !!reason}
                        onClick={() =>
                          run(
                            `check-${ticket.id}`,
                            () =>
                              api(`/tickets/${ticket.id}/check-in${guest}`, {
                                method: 'POST',
                              }),
                            (r) =>
                              r.assigned_seat
                                ? `Check-in thành công cho ${ticket.full_name}, ghế ${r.assigned_seat}.`
                                : `Check-in thành công cho ${ticket.full_name}.`,
                          )
                        }
                      >
                        {busy === `check-${ticket.id}`
                          ? 'Đang check-in…'
                          : `Check-in · ${ticket.full_name} · ${ticket.flight_number}`}
                      </button>
                      {reason && <p>{reason}</p>}
                    </>
                  )}
                </div>
              )
            })}
            {!active.length && <p>Không có vé còn hiệu lực để check-in.</p>}
            {!!checkable.length && (
              <p>{checkable.length} vé đang trong thời gian check-in.</p>
            )}
          </div>
        </div>
        {changing &&
          legs
            .filter(
              (leg) =>
                leg.flight_id === changing && !changeReason(booking, leg, now),
            )
            .map((leg) => (
              <div id={`change-${leg.flight_id}`} key={leg.flight_id}>
                <ChangePanel
                  leg={leg}
                  pnr={pnr}
                  guest={guest}
                  seats={
                    leg.tickets.filter((t) => t.passenger_type !== 'INFANT')
                      .length
                  }
                  busy={blocked}
                  run={run}
                  onDone={() => setChanging(null)}
                />
              </div>
            ))}
        {feedbackArea === 'actions' && feedback}
        {busy && <p role="status">Đang xử lý, vui lòng chờ…</p>}
      </section>
      {booking.ancillaries.length > 0 && (
        <section className="card">
          <h2 className="mb-3 text-lead font-bold">Dịch vụ bổ trợ</h2>
          <ul className="space-y-2">
            {booking.ancillaries.map((a, i) => (
              <li key={i}>
                {a.full_name}: {a.name}
                {a.flight_number && ` (${a.flight_number})`} — {money(a.price)}
              </li>
            ))}
          </ul>
        </section>
      )}
      {history.length > 0 && active.length > 0 && (
        <details className="card">
          <summary className="cursor-pointer font-semibold">
            Vé đã hủy / đã đổi ({history.length})
          </summary>
          <ul className="mt-3 space-y-2 text-meta text-muted">
            {history.map((t) => (
              <li key={t.id}>
                {t.ticket_number} · {t.full_name} · {t.flight_number} ·{' '}
                {fmtDate(t.departure_time)}
              </li>
            ))}
          </ul>
        </details>
      )}
      {booking.payments.length > 0 && (
        <section className="card">
          <h2 className="mb-3 text-lead font-bold">Lịch sử thanh toán</h2>
          <ul className="space-y-3">
            {booking.payments.map((p, i) => (
              <li key={p.provider_txn_id ?? i} className="text-meta">
                <strong>
                  {p.status === 'REFUNDED'
                    ? 'Hoàn tiền'
                    : p.status === 'SUCCESS'
                      ? 'Thanh toán thành công'
                      : `Thanh toán · ${p.status}`}
                </strong>{' '}
                · {METHODS[p.method] ?? p.method} · {money(p.amount)}
                <p className="text-muted">
                  Mã GD: {p.provider_txn_id ?? 'Chưa có'}
                  {p.paid_at && ` · ${fmtDateTime(p.paid_at)}`}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
      {confirmCancel && (
        <Dialog
          title="Xác nhận hủy toàn bộ đặt chỗ"
          busy={!!busy}
          onClose={() => setConfirmCancel(false)}
        >
          <p>
            Bạn đang hủy đặt chỗ <strong>{booking.pnr}</strong> cho tất cả hành
            khách và chặng còn hiệu lực.
          </p>
          {booking.status === 'CONFIRMED' && booking.refund?.amount != null ? (
            <p className="mt-3">
              Số tiền hoàn theo báo giá:{' '}
              <strong>{money(booking.refund.amount)}</strong>.
            </p>
          ) : (
            <p className="mt-3">Đặt chỗ chưa thanh toán.</p>
          )}
          <ErrorText>{error}</ErrorText>
          <div className={styles.dialogFooter}>
            <button
              className="btn-outline"
              disabled={blocked}
              onClick={() => setConfirmCancel(false)}
            >
              Giữ đặt chỗ
            </button>
            <button
              className="btn bg-red-700"
              disabled={blocked || !!cancelWhy}
              onClick={cancel}
            >
              {busy === 'cancel' ? 'Đang hủy…' : 'Xác nhận hủy toàn bộ'}
            </button>
          </div>
        </Dialog>
      )}
      {pass && <BoardingPass tickets={pass} pnr={booking.pnr} onClose={() => setPass(null)} />}
    </div>
  )
}

function Dialog({ title, children, onClose, busy = false }) {
  const ref = useRef(null)
  useEffect(() => {
    const dialog = ref.current
    dialog.showModal()
    return () => dialog.close()
  }, [])
  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault()
        if (!busy) onClose()
      }}
    >
      <h2 className="mb-4 text-lead font-bold">{title}</h2>
      {children}
    </dialog>
  )
}

function PayBox({ booking, busy, onPay }) {
  const [method, setMethod] = useState('VNPAY')
  return (
    <section
      className="card space-y-4 border-amber-300 bg-amber-50"
      aria-label="Thanh toán đặt chỗ"
    >
      <h2 className="text-lead font-bold">Hoàn tất thanh toán</h2>
      <p>Thanh toán trước {fmtDateTime(booking.expires_at)} để giữ chỗ.</p>
      <fieldset disabled={busy}>
        <legend className="mb-2 font-medium">Phương thức thanh toán</legend>
        <div className="flex flex-wrap gap-4">
          {Object.entries(METHODS).map(([key, label]) => (
            <label key={key} className="flex min-h-11 items-center gap-2">
              <input
                type="radio"
                name="method"
                checked={method === key}
                onChange={() => setMethod(key)}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <button
        className={`btn ${styles.button} w-full sm:w-auto`}
        disabled={busy}
        onClick={() => onPay(method)}
      >
        Thanh toán {money(booking.total_amount)} (mô phỏng)
      </button>
    </section>
  )
}

function ChangePanel({ leg, pnr, guest, seats, busy, run, onDone }) {
  const [date, setDate] = useState(() =>
    [isoDate(new Date(leg.departure_time)), isoDate()].sort().at(-1),
  )
  const [options, setOptions] = useState([])
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [quoting, setQuoting] = useState(false)
  const sequence = useRef(0)
  const quoteLock = useRef(false)
  useEffect(() => {
    let cancelled = false
    sequence.current++
    setPreview(null)
    setOptions([])
    setError('')
    setLoading(true)
    api(
      '/flights/search?' +
        new URLSearchParams({
          origin: leg.origin,
          destination: leg.destination,
          date,
          passengers: Math.max(seats, 1),
        }),
    )
      .then((rows) => {
        if (!cancelled)
          setOptions(
            rows.filter(
              (r) =>
                r.fare_class === leg.fare_class &&
                r.flight_id !== leg.flight_id,
            ),
          )
      })
      .catch((e) => {
        if (!cancelled) setError(e.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
      sequence.current++
    }
  }, [date, leg.flight_id, leg.origin, leg.destination, leg.fare_class, seats])
  const quote = async (id) => {
    if (quoteLock.current) return
    quoteLock.current = true
    setQuoting(true)
    setError('')
    setPreview(null)
    const request = ++sequence.current
    try {
      const data = await api(`/bookings/${pnr}/change${guest}`, {
        method: 'POST',
        body: {
          old_flight_id: leg.flight_id,
          new_flight_id: id,
          confirm: false,
        },
      })
      if (request === sequence.current) setPreview({ ...data, id })
    } catch (e) {
      if (request === sequence.current) setError(e.message)
    } finally {
      quoteLock.current = false
      setQuoting(false)
    }
  }
  const confirm = async () => {
    if (!preview || quoting) return
    ;(await run(
      'change',
      () =>
        api(`/bookings/${pnr}/change${guest}`, {
          method: 'POST',
          body: {
            old_flight_id: leg.flight_id,
            new_flight_id: preview.id,
            confirm: true,
          },
        }),
      (r) =>
        `Đã đổi toàn bộ hành khách trên chặng sang ${r.new_flight.flight_number}${Number(r.total) ? `, đã thanh toán ${money(r.total)} (mô phỏng)` : ''}.`,
    )) && onDone()
  }
  return (
    <section
      className={styles.change}
      aria-label={`Đổi chuyến ${leg.flight_number}`}
    >
      <h3 className="font-bold">
        Đổi chuyến {leg.flight_number} · {leg.origin} → {leg.destination}
      </h3>
      <label>
        Ngày bay mới
        <input
          type="date"
          className="input mt-2 max-w-xs"
          min={isoDate()}
          value={date}
          disabled={busy || quoting}
          onChange={(e) => setDate(e.target.value)}
        />
      </label>
      {loading && <p role="status">Đang tìm chuyến…</p>}
      {!loading && !error && !options.length && (
        <p>Không có chuyến cùng hạng vé trong ngày này.</p>
      )}
      <div className="flex flex-wrap gap-3">
        {options.map((o) => (
          <button
            key={o.flight_id}
            className="btn-outline"
            disabled={busy || quoting || loading}
            onClick={() => quote(o.flight_id)}
          >
            Xem phí {o.flight_number} · {fmtTime(o.departure_time)} ·{' '}
            {money(o.price)}
          </button>
        ))}
      </div>
      {quoting && <p role="status">Đang lấy báo giá đổi chuyến…</p>}
      <ErrorText>{error}</ErrorText>
      {preview && (
        <div className="space-y-3">
          {preview.free ? (
            <p>Hãng hủy chuyến cũ: đổi miễn phí.</p>
          ) : (
            <p>
              Phí đổi: {money(preview.change_fee)} · Chênh lệch:{' '}
              {money(preview.fare_difference)} ·{' '}
              <strong>Tổng: {money(preview.total)}</strong>
            </p>
          )}
          <p className="text-meta text-muted">
            Đổi tất cả hành khách của chặng này; ghế mới được xếp khi check-in.
            Dịch vụ theo chặng được chuyển sang chuyến mới.
          </p>
          <button
            className="btn"
            disabled={busy || quoting || loading}
            onClick={confirm}
          >
            Xác nhận đổi
            {Number(preview.total)
              ? ` và thanh toán ${money(preview.total)} (mô phỏng)`
              : ''}
          </button>
        </div>
      )}
    </section>
  )
}
