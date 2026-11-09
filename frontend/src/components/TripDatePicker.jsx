import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { api, isoDate, money } from '../api.js'
import {
  addDays, addMonths, addMonthsKeepDay, daysInMonth, longLabel, monthLabel, monthOf, monthWeeks, shortLabel, shortPrice,
  WEEKDAYS_SHORT, weekdayIndex,
} from './calendarDates.js'

const MAX_MONTHS_AHEAD = 11

// Hai màn hình ≥ 640px hiện 2 tháng cạnh nhau; điện thoại hiện 1 tháng dạng tấm trượt từ đáy
function useWide() {
  const query = '(min-width: 640px)'
  const [wide, setWide] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const media = window.matchMedia(query)
    const update = () => setWide(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  return wide
}

/**
 * Ô "Ngày đi" và "Ngày về" dùng chung một lịch có giá rẻ nhất mỗi ngày.
 * onChange nhận phần thay đổi: { date }, { returnDate } và/hoặc { trip }.
 */
export default function TripDatePicker({ trip, date, returnDate, onChange, origin, destination, passengers = 1 }) {
  const today = isoDate()
  const lastMonth = addMonths(monthOf(today), MAX_MONTHS_AHEAD)
  const round = trip === 'round'
  const wide = useWide()
  const id = useId()

  const [active, setActive] = useState(null) // 'depart' | 'return' | null (đang đóng)
  const [month, setMonth] = useState(monthOf(date || today))
  const [focusDay, setFocusDay] = useState(date || today)
  const [hoverDay, setHoverDay] = useState(null)
  const [prices, setPrices] = useState({}) // `${từ}-${đến}-${khách}-${tháng}` -> { 'YYYY-MM-DD': giá }
  const loading = useRef(new Set())
  const box = useRef(null)
  const dialog = useRef(null)
  const departButton = useRef(null)
  const returnButton = useRef(null)
  const moveFocus = useRef(false)

  const [from, to] = active === 'return' ? [destination, origin] : [origin, destination]
  const months = wide ? [month, addMonths(month, 1)] : [month]
  const minDay = active === 'return' && date ? date : today

  function open(which) {
    const day = which === 'return' ? returnDate || date || today : date || today
    setActive(which)
    setMonth(monthOf(day))
    setFocusDay(day)
    moveFocus.current = true
  }

  function close(returnFocus = true) {
    const button = active === 'return' ? returnButton.current : departButton.current
    setActive(null)
    setHoverDay(null)
    if (returnFocus) button?.focus()
  }

  // Đóng khi bấm ra ngoài
  useEffect(() => {
    if (!active) return
    const onPointerDown = (e) => {
      if (!box.current?.contains(e.target) && !dialog.current?.contains(e.target)) close(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
    }
  }, [active])

  // Tải giá rẻ nhất cho các tháng đang hiện (API trả tối đa 31 ngày mỗi lần)
  useEffect(() => {
    if (!active || !from || !to || from === to) return
    for (const m of months) {
      const key = `${from}-${to}-${passengers}-${m}`
      if (prices[key] || loading.current.has(key) || m < monthOf(today)) continue
      const start = m === monthOf(today) ? today : `${m}-01`
      loading.current.add(key)
      api('/flights/fare-calendar?' + new URLSearchParams({
        origin: from, destination: to, date_from: start, days: daysInMonth(m) - Number(start.slice(8)) + 1, passengers,
      }))
        .then((rows) => setPrices((p) => ({ ...p, [key]: Object.fromEntries(rows.map((r) => [r.date, Number(r.min_price)])) })))
        .catch(() => {}) // không có giá vẫn chọn ngày được
        .finally(() => loading.current.delete(key))
    }
  }, [active, from, to, passengers, month, wide])

  // Đưa con trỏ bàn phím tới ngày đang chọn khi mở lịch hoặc khi di chuyển bằng phím mũi tên
  useEffect(() => {
    if (!active || !moveFocus.current) return
    moveFocus.current = false
    dialog.current?.querySelector(`[data-day="${focusDay}"]`)?.focus({ preventScroll: true })
    if (wide) dialog.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [active, focusDay, month])

  function pick(day) {
    if (active === 'depart') {
      const keepReturn = returnDate && returnDate >= day ? returnDate : ''
      onChange({ date: day, returnDate: keepReturn })
      if (round && !keepReturn) {
        setActive('return')
        setFocusDay(day)
        moveFocus.current = true
      } else close()
    } else {
      onChange({ returnDate: day })
      close()
    }
  }

  function go(day) {
    let next = day < minDay ? minDay : day
    if (monthOf(next) > lastMonth) next = `${lastMonth}-${String(daysInMonth(lastMonth)).padStart(2, '0')}`
    if (!months.includes(monthOf(next))) setMonth(next < `${month}-01` ? monthOf(next) : addMonths(monthOf(next), wide ? -1 : 0))
    setFocusDay(next)
    moveFocus.current = true
  }

  function onDayKey(e, day) {
    const moves = {
      ArrowLeft: () => addDays(day, -1), ArrowRight: () => addDays(day, 1),
      ArrowUp: () => addDays(day, -7), ArrowDown: () => addDays(day, 7),
      Home: () => addDays(day, -weekdayIndex(day)), End: () => addDays(day, 6 - weekdayIndex(day)),
      PageUp: () => addMonthsKeepDay(day, -1), PageDown: () => addMonthsKeepDay(day, 1),
    }
    if (moves[e.key]) {
      e.preventDefault()
      go(moves[e.key]())
    }
  }

  const priceOf = (day) => prices[`${from}-${to}-${passengers}-${monthOf(day)}`]
  const rangeEnd = active === 'return' ? hoverDay || returnDate : returnDate
  const inRange = (day) => round && date && rangeEnd && day > date && day < rangeEnd

  // Hàm vẽ (không phải component) để nút không bị tạo lại và mất focus mỗi lần render
  function trigger({ which, value, buttonRef, label, placeholder }) {
    const isActive = active === which
    return (
      <div className="min-w-0">
        <span className="label" id={`${id}-${which}`}>{label}</span>
        <button
          type="button"
          ref={buttonRef}
          aria-labelledby={`${id}-${which} ${id}-${which}-value`}
          aria-haspopup="dialog"
          aria-expanded={isActive}
          onClick={() => {
            if (isActive) return close()
            if (which === 'return' && !round) onChange({ trip: 'round' })
            open(which)
          }}
          className={`input flex cursor-pointer items-center gap-2 text-left ${isActive ? 'border-brand ring-4 ring-brand-tint' : ''}`}
        >
          <CalendarIcon />
          <span id={`${id}-${which}-value`} className={`truncate ${value ? '' : 'text-muted'}`}>
            {value ? shortLabel(value) : placeholder}
          </span>
        </button>
      </div>
    )
  }

  // Trên điện thoại, tấm lịch gắn thẳng vào <body> để phủ lên thanh menu và nút trợ lý ảo
  const portal = (node) => (wide ? node : createPortal(node, document.body))

  return (
    <div ref={box} className="relative grid grid-cols-2 gap-3 sm:gap-4">
      {trigger({ which: 'depart', value: date, buttonRef: departButton, label: 'Ngày đi', placeholder: 'Chọn ngày' })}
      {trigger({ which: 'return', value: round ? returnDate : '', buttonRef: returnButton, label: 'Ngày về',
        placeholder: round ? 'Chọn ngày' : 'Thêm ngày về' })}

      {active && portal(
        <>
          {!wide && <div className="fixed inset-0 z-50 bg-ink/40" aria-hidden="true" onClick={() => close(false)} />}
          <div
            ref={dialog}
            role="dialog"
            aria-modal={!wide || undefined}
            aria-label={active === 'return' ? 'Chọn ngày về' : 'Chọn ngày đi'}
            onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); close() } }}
            className={wide
              ? 'absolute right-0 top-full z-40 mt-2 w-[min(42rem,calc(100vw-2rem))] rounded-2xl border border-line bg-white p-5 shadow-xl'
              : 'fixed inset-x-0 bottom-0 z-50 max-h-[90dvh] overflow-y-auto rounded-t-3xl bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4'}
          >
            {round ? (
              <div className="mb-4 grid grid-cols-2 gap-2" role="group" aria-label="Đang chọn">
                {[['depart', 'Ngày đi', date], ['return', 'Ngày về', returnDate]].map(([which, label, value]) => (
                  <button
                    key={which}
                    type="button"
                    aria-pressed={active === which}
                    disabled={which === 'return' && !date}
                    onClick={() => open(which)}
                    className={`rounded-xl px-3 py-2 text-left transition-colors ${active === which
                      ? 'bg-brand-tint text-brand-ink' : 'bg-ground text-ink hover:bg-brand-wash'}`}
                  >
                    <span className="block text-meta">{label}</span>
                    <span className="block font-semibold">{value ? shortLabel(value) : 'Chưa chọn'}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="mb-4 font-semibold">Chọn ngày đi</p>
            )}

            <div className="flex items-start gap-6">
              {months.map((m, index) => (
                <Month
                  key={m}
                  month={m}
                  id={`${id}-${m}`}
                  showPrev={index === 0}
                  showNext={index === months.length - 1}
                  canPrev={m > monthOf(today)}
                  canNext={m < lastMonth}
                  onPrev={() => setMonth(addMonths(month, -1))}
                  onNext={() => setMonth(addMonths(month, 1))}
                  renderDay={(day) => {
                    const disabled = day < minDay || monthOf(day) > lastMonth
                    const selected = day === date || (round && day === returnDate)
                    const monthPrices = priceOf(day)
                    const price = monthPrices?.[day]
                    const cheapest = price != null && price === Math.min(...Object.values(monthPrices))
                    return (
                      <button
                        type="button"
                        data-day={day}
                        tabIndex={day === focusDay ? 0 : -1}
                        disabled={disabled}
                        aria-pressed={selected}
                        aria-current={day === today ? 'date' : undefined}
                        aria-label={`${longLabel(day)}${day === today ? ', hôm nay' : ''}${price != null
                          ? `, giá từ ${money(price)}${cheapest ? ', rẻ nhất tháng' : ''}`
                          : monthPrices && !disabled ? ', không có chuyến' : ''}`}
                        onClick={() => pick(day)}
                        onKeyDown={(e) => onDayKey(e, day)}
                        onFocus={() => setFocusDay(day)}
                        onMouseEnter={() => active === 'return' && setHoverDay(day)}
                        onMouseLeave={() => setHoverDay(null)}
                        className={`flex h-11 w-full flex-col items-center justify-center rounded-xl transition-colors
                          ${selected ? 'bg-brand-strong text-white'
                            : disabled ? 'cursor-not-allowed text-control'
                              : `cursor-pointer hover:bg-brand-tint ${inRange(day) ? 'bg-brand-wash' : ''}`}
                          ${day === today && !selected ? 'font-bold text-brand-ink' : ''}`}
                      >
                        <span className="leading-none">{Number(day.slice(8))}</span>
                        <span className={`mt-1 h-3 text-[0.75rem] leading-none ${selected ? 'text-white/85'
                          : cheapest ? 'font-semibold text-emerald-700' : 'text-muted'}`}>
                          {disabled ? '' : price != null ? shortPrice(price) : monthPrices ? '–' : ''}
                        </span>
                      </button>
                    )
                  }}
                />
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-3">
              <p className="text-meta text-muted">
                {from && to && from !== to
                  ? <>Giá vé rẻ nhất mỗi ngày {from} → {to}, {passengers} khách. <span className="font-semibold text-emerald-700">Xanh lá</span> là ngày rẻ nhất tháng.</>
                  : 'Chọn điểm đi và điểm đến để xem giá theo ngày.'}
              </p>
              <button type="button" className="btn h-10 w-full px-5 sm:h-9 sm:w-auto" onClick={() => close()}>Xong</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Month({ month, id, showPrev, showNext, canPrev, canNext, onPrev, onNext, renderDay }) {
  const navButton = 'grid h-9 w-9 place-items-center rounded-full text-ink transition-colors hover:bg-brand-wash disabled:cursor-not-allowed disabled:opacity-30'
  return (
    <div className="min-w-0 flex-1">
      <div className="mb-2 flex h-9 items-center justify-between">
        {showPrev
          ? <button type="button" className={navButton} aria-label="Tháng trước" disabled={!canPrev} onClick={onPrev}><Chevron left /></button>
          : <span className="w-9" />}
        <h3 id={id} className="font-semibold" aria-live="polite">{monthLabel(month)}</h3>
        {showNext
          ? <button type="button" className={navButton} aria-label="Tháng sau" disabled={!canNext} onClick={onNext}><Chevron /></button>
          : <span className="w-9" />}
      </div>
      <table role="grid" aria-labelledby={id} className="w-full table-fixed border-separate border-spacing-y-0.5">
        <thead>
          <tr>
            {WEEKDAYS_SHORT.map((w) => (
              <th key={w} scope="col" className={`pb-1 text-meta font-medium ${w === 'CN' ? 'text-[#b42318]' : 'text-muted'}`}>{w}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {monthWeeks(month).map((week, i) => (
            <tr key={i}>
              {week.map((day, j) => <td key={j} className="px-0.5">{day && renderDay(day)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Chevron({ left }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={left ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} />
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8 3v4m8-4v4" />
    </svg>
  )
}
