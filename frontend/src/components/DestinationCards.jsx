import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api, isoDate, money } from '../api.js'

const FALLBACK_IMAGE = '/images/canh-may-bay.jpg'

// Default để cho các mục
const tomorrow = () => isoDate(new Date(Date.now() + 864e5))

function searchUrl(dest) {
  const params = new URLSearchParams({
    origin: dest.iata_code === 'HAN' ? 'SGN' : 'HAN',
    destination: dest.iata_code,
    date: tomorrow(),
    adults: 1,
  })
  return `/search?${params.toString()}`
}

function imageFallbackHandler(e) {
  const img = e.currentTarget
  if (img.dataset.fallback) return
  img.dataset.fallback = 'true'
  img.src = FALLBACK_IMAGE
}

export default function DestinationCards() {
  const [destinations, setDestinations] = useState([])
  const [loading, setLoading] = useState(true)
  // const onImageError = useImageFallback()
  useEffect(() => {
    let alive = true
    api('/destinations/featured')
      .then((data) => {
        if (alive) setDestinations(Array.isArray(data) ? data : [])
      })
      .catch(() => {
        // Trang chủ vẫn phải dùng được khi API lỗi: ẩn cả mục thay vì hiện lỗi
        if (alive) setDestinations([])
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => { alive = false }
  }, [])

  // exprimental: stow load function
  if (loading) {
    return (
      <section className="mt-20 space-y-6" aria-busy="true" aria-label="Đang tải điểm đến nổi bật">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="card h-72 animate-pulse bg-slate-100" />
          ))}
        </div>
      </section>
    )
  }

  if (destinations.length === 0) return null

  return (
    <section className="mt-20 space-y-6" aria-labelledby="featured-destinations-title">
      <div>
        <h2 id="featured-destinations-title" className="text-title font-bold tracking-tight text-ink">
          Điểm đến được yêu thích
        </h2>
        <p className="mt-1 text-muted">
          Những hành trình hấp dẫn với mức giá ưu đãi nhất khởi hành từ Hà Nội và TP. Hồ Chí Minh.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {destinations.map((d) => (
          <Link
            key={d.iata_code}
            to={searchUrl(d)}
            className="group card flex flex-col overflow-hidden p-0 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
          >
            <div className="relative aspect-[16/9] w-full overflow-hidden bg-slate-100">
              <img
                src={d.image_url || `/images/destinations/${d.iata_code}.jpg`}
                alt={`Hình ảnh điểm đến ${d.city} (${d.iata_code})`}
                loading="lazy"
                decoding="async"
                onError={imageFallbackHandler}
                className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
              />
              <span className="absolute right-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-meta font-bold text-brand-strong backdrop-blur-xs">
                {d.iata_code}
              </span>
            </div>

            <div className="flex flex-1 flex-col justify-between p-5">
              <div>
                <h3 className="text-lead font-bold text-ink group-hover:text-brand-strong">
                  {d.city}
                  {d.country && d.country !== 'Vietnam' && (
                    <span className="ml-1.5 text-meta font-normal text-muted">({d.country})</span>
                  )}
                </h3>
                {d.description && (
                  <p className="mt-2 line-clamp-2 text-ui text-muted">{d.description}</p>
                )}
              </div>

              <div className="mt-5 flex items-center justify-between border-t border-rule pt-4">
                <div>
                  <span className="block text-meta text-muted">Giá vé</span>
                  {d.min_price ? (
                    <span className="text-ui font-semibold text-brand-strong">
                      chỉ từ <span className="font-bold text-brand-ink">{money(d.min_price)}</span>
                    </span>
                  ) : (
                    <span className="text-meta font-medium text-slate-500">Khám phá ngay</span>
                  )}
                </div>

                <span className="btn-outline h-8 px-3 text-meta group-hover:border-brand group-hover:bg-brand-wash">
                  Tìm vé →
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
