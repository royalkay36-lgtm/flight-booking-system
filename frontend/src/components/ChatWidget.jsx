import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useMatch } from 'react-router'
import { api, fmtDate, fmtTime, isoDate, money } from '../api.js'
import styles from './ChatWidget.module.css'

const WELCOME = {
  from: 'bot',
  welcome: true,
  reply: 'Xin chào! Mình là trợ lý SkyBooking. Bạn muốn tìm chuyến bay hay hỏi về vé của mình?',
}

// Gợi ý mở đầu theo trang khách đang xem
function welcomeSuggestions(pathname) {
  if (pathname === '/search') return ['Ngày mai thì sao?', 'Hành lý ký gửi bao nhiêu kg?', 'Đổi vé có mất phí không?']
  if (pathname === '/booking') return ['Phí chọn ghế bao nhiêu?', 'Hành lý ký gửi bao nhiêu kg?', 'Có mã khuyến mãi nào không?']
  if (pathname.startsWith('/bookings/')) return ['Đổi chuyến có mất phí không?', 'Chính sách hoàn huỷ vé', 'Khi nào làm thủ tục được?']
  return ['Hà Nội đi Đà Nẵng ngày mai', 'Hỏi về hành lý', 'Chính sách hoàn hủy vé', 'Làm thủ tục trực tuyến']
}

// Trên trang kết quả, tuyến đang xem là ngữ cảnh để hỏi tiếp ("ngày mai thì sao?")
function searchContext(search) {
  const p = new URLSearchParams(search)
  if (!p.get('origin') || !p.get('destination')) return null
  const passengers = Number(p.get('adults') || 1) + Number(p.get('children') || 0)
  return { origin: p.get('origin'), destination: p.get('destination'), date: p.get('date') || null, passengers: Math.min(9, passengers) }
}

// Hội thoại giữ lại khi tải lại trang (chỉ trong tab này)
const STORE = 'skybooking-chat'
function loadChat() {
  try { return JSON.parse(sessionStorage.getItem(STORE)) } catch { return null }
}

export default function ChatWidget() {
  const { pathname, search } = useLocation()
  const bookingDetail = useMatch('/bookings/:pnr')
  const saved = useRef(loadChat())
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState(() => saved.current?.messages ?? [WELCOME])
  const context = useRef(saved.current?.context ?? null)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const widget = useRef(null)
  const launcher = useRef(null)
  const closeButton = useRef(null)
  const opener = useRef(null)
  const restoreFocus = useRef(false)
  const log = useRef(null)

  const show = useCallback(() => {
    if (closeButton.current) {
      closeButton.current.focus({ preventScroll: true })
      return
    }
    opener.current = document.activeElement
    setOpen(true)
  }, [])

  function close() {
    restoreFocus.current = true
    setOpen(false)
  }

  useEffect(() => {
    window.addEventListener('open-chat', show)
    return () => window.removeEventListener('open-chat', show)
  }, [show])

  useEffect(() => {
    if (open) {
      // Focus a button first so opening chat does not bring up the phone keyboard.
      closeButton.current?.focus({ preventScroll: true })
    } else if (restoreFocus.current) {
      restoreFocus.current = false
      const target = opener.current?.isConnected && opener.current !== document.body
        ? opener.current
        : launcher.current
      target?.focus({ preventScroll: true })
    }
  }, [open])

  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight
  }, [messages, busy, open])

  useEffect(() => {
    if (pathname === '/search') context.current = searchContext(search) ?? context.current
  }, [pathname, search])

  useEffect(() => {
    try {
      sessionStorage.setItem(STORE, JSON.stringify({ messages: messages.slice(-30), context: context.current }))
    } catch { /* trình duyệt chặn lưu trữ: hội thoại chỉ mất khi tải lại trang */ }
  }, [messages])

  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return

    function updateViewport() {
      const element = widget.current
      if (!element) return
      const bottomInset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
      element.style.setProperty('--chat-visible-height', `${viewport.height}px`)
      element.style.setProperty('--chat-keyboard-inset', `${bottomInset}px`)
    }

    updateViewport()
    viewport.addEventListener('resize', updateViewport)
    viewport.addEventListener('scroll', updateViewport)
    window.addEventListener('resize', updateViewport)
    return () => {
      viewport.removeEventListener('resize', updateViewport)
      viewport.removeEventListener('scroll', updateViewport)
      window.removeEventListener('resize', updateViewport)
    }
  }, [])

  async function send(text) {
    const question = text.trim()
    if (!question || pending.current) return
    pending.current = true
    setInput('')
    setBusy(true)
    setMessages((previous) => [...previous, { from: 'me', reply: question }])
    // Các lượt trước gửi kèm để trợ lý AI hiểu câu hỏi nối tiếp; máy chủ không lưu hội thoại
    const history = messages
      .filter((m) => !m.welcome && !m.failed && m.reply)
      .slice(-10)
      .map((m) => ({ role: m.from === 'me' ? 'user' : 'assistant', content: m.reply.slice(0, 2000) }))
    try {
      const answer = await api('/chat', { method: 'POST', body: { message: question, context: context.current, history } })
      if (answer.context) context.current = answer.context // câu hỏi chính sách không xoá tuyến đang hỏi
      setMessages((previous) => [...previous, { from: 'bot', ...answer }])
    } catch (error) {
      setMessages((previous) => [
        ...previous,
        { from: 'bot', failed: true, reply: `Xin lỗi, có lỗi xảy ra: ${error.message}` },
      ])
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  return (
    <div
      className={styles.widget}
      ref={widget}
      data-booking={pathname === '/booking' || undefined}
      data-booking-detail={!!bookingDetail || undefined}
    >
      {!open ? (
        <button
          type="button"
          ref={launcher}
          className={styles.launcher}
          aria-label="Mở trợ lý ảo"
          aria-expanded={false}
          onClick={show}
        >
          <AssistantMark />
        </button>
      ) : (
        <section
          aria-label="Trợ lý ảo SkyBooking"
          className={styles.panel}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !event.nativeEvent.isComposing) {
              event.preventDefault()
              close()
            }
          }}
        >
          <header className={styles.header}>
            <Avatar />
            <h2 className="font-semibold">Trợ lý ảo SkyBooking</h2>
            <button
              type="button"
              ref={closeButton}
              className={styles.close}
              aria-label="Đóng trợ lý ảo"
              onClick={close}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </header>

          <div className={styles.log} ref={log} role="log" aria-label="Hội thoại" tabIndex={0}>
            {messages.map((message, index) => (
              <Message
                key={index}
                message={index < messages.length - 1 ? { ...message, suggestions: null } // gợi ý chỉ hiện ở tin mới nhất
                  : message.welcome ? { ...message, suggestions: welcomeSuggestions(pathname) } : message}
                busy={busy}
                onSuggest={send}
                onNavigate={() => setOpen(false)}
              />
            ))}
            {busy && (
              <div className={styles.assistantRow}>
                <Avatar />
                <div className={`${styles.bubble} ${styles.typing}`}>
                  <span>Đang gõ…</span>
                  <span aria-hidden="true"><i /><i /><i /></span>
                </div>
              </div>
            )}
          </div>

          <form
            className={styles.composer}
            onSubmit={(event) => {
              event.preventDefault()
              send(input)
            }}
          >
            <input
              className="input"
              aria-label="Câu hỏi cho trợ lý ảo"
              placeholder="Nhập câu hỏi…"
              maxLength={500}
              value={input}
              onChange={(event) => setInput(event.target.value)}
            />
            <button className="btn" disabled={busy || !input.trim()}>Gửi</button>
          </form>
        </section>
      )}
    </div>
  )
}

function Message({ message, busy, onSuggest, onNavigate }) {
  const isCustomer = message.from === 'me'

  return (
    <div className={isCustomer ? styles.customerRow : styles.assistantRow}>
      {!isCustomer && <Avatar />}
      <div className={styles.message}>
        <div className={`${styles.bubble}${isCustomer ? ` ${styles.customerBubble}` : ''}`}>
          <span className="sr-only">{isCustomer ? 'Bạn: ' : 'Trợ lý: '}</span>
          {message.reply}
          {message.flights?.map((flight) => (
            <Link
              key={`${flight.flight_id}-${flight.fare_class}`}
              onClick={onNavigate}
              to={`/search?${new URLSearchParams({
                origin: flight.origin,
                destination: flight.destination,
                date: isoDate(new Date(flight.departure_time)),
              })}`}
              className={styles.flight}
            >
              <div className="font-medium">{flight.flight_number} · {fmtTime(flight.departure_time)} {fmtDate(flight.departure_time)}</div>
              <div className="text-meta text-muted">{flight.airline_name} · {flight.fare_name} · <b className="text-brand-ink">{money(flight.price)}</b></div>
            </Link>
          ))}
          {message.link && (
            <Link to={message.link.url} onClick={onNavigate} className="mt-2 block font-medium text-brand-ink underline">
              {message.link.label} →
            </Link>
          )}
        </div>
        {message.source === 'ai' && <p className="mt-1 text-meta text-muted">Trả lời bằng AI, có thể chưa chính xác.</p>}
        {message.suggestions?.length > 0 && (
          <div className={styles.suggestions} role="group" aria-label="Câu hỏi gợi ý">
            {message.suggestions.map((suggestion) => (
              <button
                type="button"
                key={suggestion}
                disabled={busy}
                onClick={() => onSuggest(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Avatar() {
  return <span className={styles.avatar}><AssistantMark /></span>
}

function AssistantMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 6V3m-2 0h4M4 11H2m20 0h-2" />
      <rect x="4" y="6" width="16" height="13" rx="4" />
      <path d="M8.5 11h.1m6.8 0h.1M10 15c1.2 1 2.8 1 4 0" />
    </svg>
  )
}
