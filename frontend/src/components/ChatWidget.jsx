import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { api, fmtDate, fmtTime, isoDate, money } from '../api.js'

const WELCOME = {
  from: 'bot',
  reply: 'Xin chào! Mình là trợ lý ảo SkyBooking. Bạn có thể hỏi tìm chuyến bay bằng câu tự nhiên, hành lý, hoàn đổi vé, khuyến mãi…',
  suggestions: ['Tìm chuyến Hà Nội đi Đà Nẵng sáng thứ 7 tuần sau dưới 1 triệu', 'Hành lý ký gửi bao nhiêu kg?',
    'Chính sách hoàn huỷ vé', 'Có mã khuyến mãi nào không?'],
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([WELCOME])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const end = useRef(null)
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, open])

  const send = async (text) => {
    if (!text.trim() || busy) return
    setInput('')
    setMessages((m) => [...m, { from: 'me', reply: text }])
    setBusy(true)
    try {
      const answer = await api('/chat', { method: 'POST', body: { message: text } })
      setMessages((m) => [...m, { from: 'bot', ...answer }])
    } catch (e) {
      setMessages((m) => [...m, { from: 'bot', reply: `Xin lỗi, có lỗi xảy ra: ${e.message}` }])
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} aria-label="Mở trợ lý ảo"
        className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-brand-strong text-white shadow-lg hover:bg-brand-ink">
        <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
          <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4h0A1.5 1.5 0 0 1 4 14.5z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
      </button>
    )
  }

  return (
    <section aria-label="Trợ lý ảo" className="fixed bottom-5 right-5 z-40 flex h-[32rem] w-[22rem] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <header className="flex items-center bg-sky-600 px-4 py-3 text-white">
        <b className="mr-auto">Trợ lý ảo SkyBooking</b>
        <button onClick={() => setOpen(false)} aria-label="Đóng trợ lý ảo" className="grid h-8 w-8 place-items-center rounded-full hover:bg-white/15"><svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg></button>
      </header>
      <div className="flex-1 space-y-3 overflow-y-auto p-3 text-sm" aria-live="polite">
        {messages.map((m, i) => (
          <div key={i} className={m.from === 'me' ? 'flex justify-end' : ''}>
            <div className={`max-w-[85%] whitespace-pre-line rounded-2xl px-3 py-2 ${m.from === 'me' ? 'bg-sky-600 text-white' : 'bg-slate-100'}`}>
              {m.reply}
              {m.flights?.map((f) => (
                <Link key={`${f.flight_id}-${f.fare_class}`} onClick={() => setOpen(false)}
                  to={`/search?${new URLSearchParams({ origin: f.origin, destination: f.destination, date: isoDate(new Date(f.departure_time)) })}`}
                  className="mt-2 block rounded-lg border border-slate-200 bg-white p-2 hover:border-sky-400">
                  <div className="font-medium">{f.flight_number} · {fmtTime(f.departure_time)} {fmtDate(f.departure_time)}</div>
                  <div className="text-xs text-slate-500">{f.airline_name} · {f.fare_name} · <b className="text-sky-700">{money(f.price)}</b></div>
                </Link>
              ))}
              {m.link && (
                <Link to={m.link.url} onClick={() => setOpen(false)} className="mt-2 block font-medium text-sky-700 underline">{m.link.label} →</Link>
              )}
            </div>
            {m.suggestions && (
              <div className="mt-2 flex flex-wrap gap-1">
                {m.suggestions.map((s) => (
                  <button key={s} onClick={() => send(s)} className="rounded-full border border-sky-300 px-2 py-1 text-xs text-sky-700 hover:bg-sky-50">{s}</button>
                ))}
              </div>
            )}
          </div>
        ))}
        {busy && <p className="text-slate-400">Đang trả lời…</p>}
        <div ref={end} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(input) }} className="flex gap-2 border-t border-slate-100 p-2">
        <input className="input" aria-label="Câu hỏi cho trợ lý ảo" placeholder="Nhập câu hỏi…" maxLength={500}
          value={input} onChange={(e) => setInput(e.target.value)} />
        <button className="btn" disabled={busy || !input.trim()}>Gửi</button>
      </form>
    </section>
  )
}
