import { useId } from 'react'
import { EXTRA_CATEGORY, money, PAX } from '../api.js'
import { ErrorText } from '../ui.jsx'
import { hasServicePrice, unavailableReason } from './ancillaryOptions.js'
import styles from './AncillaryServices.module.css'

const CATEGORIES = ['BAGGAGE', 'MEAL', 'INSURANCE', 'SIM']
const ICON_PATHS = {
  BAGGAGE: 'M9 6V4h6v2M7 7h10a2 2 0 0 1 2 2v10H5V9a2 2 0 0 1 2-2ZM9 10v6m6-6v6M8 20v1m8-1v1',
  MEAL: 'M5 3v6m3-6v6M3 3v6a3 3 0 0 0 6 0M6 12v9M17 3c-3 3-3 7 0 9h2V3h-2Zm2 9v9',
  INSURANCE: 'M12 3 4 6v6c0 4 3 7 8 9 5-2 8-5 8-9V6l-8-3ZM8 12l3 3 5-6',
  SIM: 'M8 3h7l5 5v12H4V7l4-4Zm0 8h8v6H8v-6Zm4 0v6m-4-3h8',
}

function ServiceIcon({ category }) {
  return <svg viewBox="0 0 24 24" className={styles.icon} aria-hidden="true">
    <path d={ICON_PATHS[category]} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
}

export default function AncillaryServices({ passengers, flights, products, loading, error, international,
  internationalKnown, onRetry, onChange, onRemove }) {
  const id = useId()
  if (loading) return <p role="status" className={styles.notice}>Đang tải danh mục dịch vụ…</p>
  if (error) return <div className={styles.notice}>
    <ErrorText>{error}</ErrorText>
    <button type="button" className="btn-outline mt-3" onClick={onRetry}>Thử tải lại dịch vụ</button>
  </div>

  const byCode = Object.fromEntries(products.map(product => [product.code, product]))
  return <div className={styles.root}>
    {!products.length && <p role="status" className={styles.notice}>Danh mục hiện chưa có gói hành lý, suất ăn, bảo hiểm hoặc SIM.</p>}
    {passengers.map((passenger, passengerIndex) => {
      const missing = passenger.ancillaries.filter(item => !byCode[item.code])
      return <fieldset key={passengerIndex} className={styles.passenger}>
        <legend className={styles.passengerTitle}>Hành khách {passengerIndex + 1} · {passenger.full_name.toUpperCase()} · {PAX[passenger.passenger_type]}</legend>
        {missing.map(item => <div key={`${item.code}-${item.segment}`} className={styles.notice}>
          <p>Dịch vụ đã chọn {item.code} không còn trong danh mục. Bạn có thể bỏ lựa chọn này để tiếp tục.</p>
          <button type="button" className="btn-outline mt-2" onClick={() => onRemove(passengerIndex, item)}>Bỏ dịch vụ {item.code}</button>
        </div>)}
        {CATEGORIES.map(category => {
          const options = products.filter(product => product.category === category)
          if (!options.length) return <section key={category} className={styles.emptyGroup} aria-label={EXTRA_CATEGORY[category]}>
            <h3 className={styles.groupTitle}><ServiceIcon category={category} />{EXTRA_CATEGORY[category]}</h3>
            <p className={styles.description}>Hiện chưa có gói {EXTRA_CATEGORY[category].toLowerCase()} trong danh mục.</p>
          </section>

          return [true, false].flatMap(perSegment => {
            const groupProducts = options.filter(product => product.per_segment === perSegment)
            if (!groupProducts.length) return []
            const scopes = perSegment ? flights.map((flight, segment) => ({ segment, flight })) : [{ segment: null }]
            return scopes.map(({ segment, flight }) => {
              const name = `${id}-${passengerIndex}-${category}-${segment ?? 'trip'}`
              const selected = passenger.ancillaries.find(item => byCode[item.code]?.category === category &&
                (item.segment ?? null) === segment)?.code ?? ''
              const scope = flight ? `${flight.flight_number} · ${flight.origin} → ${flight.destination}` : 'Cả hành trình'
              return <fieldset key={`${category}-${segment}`} className={styles.group}>
                <legend className={styles.groupTitle}><ServiceIcon category={category} />{EXTRA_CATEGORY[category]} · {scope}</legend>
                <div className={styles.groupHelp}>
                  <p>Chọn tối đa 1 gói cho hành khách này.</p>
                  <label className={styles.noneChoice}>
                    <input type="radio" name={name} value="" checked={!selected} onChange={() => onChange(passengerIndex, category, segment, '')} />
                    Không chọn
                  </label>
                </div>
                <div className={styles.cards}>
                  {groupProducts.map(product => {
                    const checked = selected === product.code
                    const reason = unavailableReason(product, passenger.passenger_type, international, internationalKnown)
                    return <label key={product.code} className={`${styles.card} ${checked ? styles.selected : ''} ${reason ? styles.unavailable : ''}`}>
                      <input type="radio" className={styles.radio} name={name} value={product.code} checked={checked} disabled={!!reason}
                        aria-label={`${product.name} · ${scope}`}
                        aria-describedby={`${name}-${product.code}-details`}
                        onChange={() => onChange(passengerIndex, category, segment, product.code)} />
                      <span className={styles.cardTop}>
                        <span className={styles.iconBox}><ServiceIcon category={category} /></span>
                        <span className={styles.state}>{checked ? '✓ Đã chọn' : reason ? 'Không khả dụng' : 'Chọn gói'}</span>
                      </span>
                      <span className={styles.productName}>{product.name}</span>
                      <span id={`${name}-${product.code}-details`} className={styles.details}>
                        {product.description && <span className={styles.description}>{product.description}</span>}
                        <span className={styles.price}>{hasServicePrice(product.price) ? money(product.price) : 'Chưa có giá'}</span>
                        <span className={styles.unit}>{product.per_segment ? 'Mỗi hành khách / chặng' : 'Mỗi hành khách / cả hành trình'}</span>
                        {reason && <span className={styles.reason}>{reason}</span>}
                      </span>
                    </label>
                  })}
                </div>
              </fieldset>
            })
          })
        })}
      </fieldset>
    })}
  </div>
}
