import { useEffect, useState } from 'react'
import { api } from '../api.js'

const FALLBACK_IMAGE = '/images/canh-may-bay.jpg'

function imageFallbackHandler(e) {
  const img = e.currentTarget
  if (img.dataset.fallback) return
  img.dataset.fallback = 'true'
  img.src = FALLBACK_IMAGE
}

/**
 * Banner giới thiệu điểm đến ở trang kết quả tìm kiếm.
 * Dùng: <DestinationBanner destination={q.destination} />
 */
export default function DestinationBanner({ destination }) {
  const [airport, setAirport] = useState(null)
  const code = destination ? String(destination).toUpperCase() : ''

  useEffect(() => {
    if (!code) {
      setAirport(null)
      return
    }
    let alive = true
    api('/airports')
      .then((rows) => {
        if (alive) setAirport(Array.isArray(rows) ? rows.find((a) => a.iata_code === code) ?? null : null)
      })
      .catch(() => {
        if (alive) setAirport(null)
      })
    return () => { alive = false }
  }, [code])

  if (!airport) return null

  return (
    <section className="relative isolate min-h-40 overflow-hidden rounded-2xl bg-[#0b3a5c] sm:min-h-48">
      <img
        src={airport.image_url || `/images/destinations/${airport.iata_code}.jpg`}
        alt=""
        loading="lazy"
        decoding="async"
        onError={imageFallbackHandler}
        className="absolute inset-0 -z-10 h-full w-full object-cover"
      />
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(8,12,16,0.82)_0%,rgba(8,12,16,0.55)_55%,rgba(8,12,16,0.2)_100%)]" />

      <div className="flex h-full min-h-40 flex-col justify-end p-6 sm:min-h-48 sm:p-8">
        <p className="text-meta font-medium uppercase tracking-wide text-white/70">Điểm đến</p>
        <h2 className="mt-1 text-title font-bold tracking-tight text-white">
          {airport.city}
          {airport.country && airport.country !== 'Vietnam' && (
            <span className="ml-2 text-lead font-normal text-white/75">{airport.country}</span>
          )}
        </h2>
        {airport.description && (
          <p className="mt-2 max-w-2xl line-clamp-2 text-ui text-white/85">{airport.description}</p>
        )}
      </div>
    </section>
  )
}
