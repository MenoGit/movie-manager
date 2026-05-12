import { useState, useEffect, useRef } from 'react'
import { ChevronLeft, ChevronRight, Check, Film, Sparkles } from 'lucide-react'
import { isInTheaters, hasSpanish } from '../utils'

/**
 * Horizontal carousel of movie cards.
 *  - `fetcher`: () => Promise<{data: movie[]}> | () => Promise<movie[]> (any axios-style or array)
 *  - `title`: row heading
 *  - `onOpen`: card click handler
 *  - `variant`: 'standard' | 'top10' | 'recommendation'
 *  - `subtitle`: secondary line under the title (e.g. seed movie name)
 *  - When `variant === 'top10'`, only first 10 results render with big numbers.
 */
export default function ContentRow({ title, subtitle, fetcher, onOpen, variant = 'standard', preloaded }) {
  const [movies, setMovies] = useState(preloaded || null)
  const [loading, setLoading] = useState(!preloaded)
  const rowRef = useRef(null)
  const scrollerRef = useRef(null)
  const fetchedRef = useRef(!!preloaded)

  // Sync preloaded if it arrives async (e.g. parent fetches it after first render).
  useEffect(() => {
    if (preloaded && preloaded.length > 0) {
      setMovies(preloaded)
      setLoading(false)
      fetchedRef.current = true
    }
  }, [preloaded])

  // Lazy fetch when row scrolls into view
  useEffect(() => {
    if (fetchedRef.current || !fetcher) return
    const el = rowRef.current
    if (!el) return
    const obs = new IntersectionObserver(async entries => {
      if (entries[0].isIntersecting && !fetchedRef.current) {
        fetchedRef.current = true
        obs.disconnect()
        try {
          const r = await fetcher()
          const data = Array.isArray(r) ? r : (r?.data ?? [])
          setMovies(data)
        } catch (e) {
          console.error(e)
          setMovies([])
        } finally {
          setLoading(false)
        }
      }
    }, { rootMargin: '300px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [fetcher])

  function scroll(dir) {
    const el = scrollerRef.current
    if (!el) return
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: 'smooth' })
  }

  const items = (movies || []).slice(0, variant === 'top10' ? 10 : 20)
  const showSkeleton = loading && !preloaded

  return (
    <section ref={rowRef} className={`row row-${variant}`}>
      <div className="row-header">
        <h2 className="row-title">{title}</h2>
        {subtitle && <span className="row-subtitle">{subtitle}</span>}
      </div>
      <div className="row-wrapper">
        <button className="row-arrow left" onClick={() => scroll(-1)} aria-label="Scroll left">
          <ChevronLeft size={28} />
        </button>
        <div className="row-scroller" ref={scrollerRef}>
          {showSkeleton ? (
            <div className="row-loading">Loading…</div>
          ) : items.length === 0 ? (
            <div className="row-empty">Nothing here yet</div>
          ) : items.map((m, i) => (
            <RowCard
              key={`${m.id}-${i}`}
              movie={m}
              rank={variant === 'top10' ? i + 1 : null}
              onClick={() => onOpen(m)}
            />
          ))}
        </div>
        <button className="row-arrow right" onClick={() => scroll(1)} aria-label="Scroll right">
          <ChevronRight size={28} />
        </button>
      </div>

      <style>{`
        .row { margin-bottom: 32px; position: relative; }
        .row-header { padding: 0 5%; margin-bottom: 10px; }
        .row-title {
          font-size: 1.25rem; font-weight: 600;
          color: var(--text);
          margin: 0;
        }
        .row-subtitle {
          font-size: 12px;
          color: var(--text-muted);
          display: block;
          margin-top: 2px;
        }
        .row-wrapper { position: relative; }
        .row-scroller {
          display: flex;
          gap: 8px;
          padding: 8px 5%;
          overflow-x: auto;
          scroll-behavior: smooth;
          scrollbar-width: none;
        }
        .row-scroller::-webkit-scrollbar { display: none; }
        .row-loading, .row-empty {
          padding: 40px 0;
          color: var(--text-muted);
          font-size: 13px;
        }
        .row-arrow {
          position: absolute;
          top: 0; bottom: 0;
          width: 5%;
          display: flex; align-items: center; justify-content: center;
          background: linear-gradient(90deg, rgba(10,10,15,0.85), rgba(10,10,15,0));
          color: var(--text);
          z-index: 5;
          opacity: 0;
          transition: opacity 0.2s;
          padding: 0;
        }
        .row-arrow.right {
          right: 0; left: auto;
          background: linear-gradient(270deg, rgba(10,10,15,0.85), rgba(10,10,15,0));
        }
        .row-arrow.left { left: 0; }
        .row-wrapper:hover .row-arrow { opacity: 1; }
        .row-arrow:hover { background: rgba(10,10,15,0.95); }

        /* Top10 row gets numbered cards */
        .row-top10 .row-scroller { padding-left: 5%; gap: 4px; }

        /* Cards */
        .browse-card {
          position: relative;
          flex: 0 0 auto;
          width: 180px;
          aspect-ratio: 2/3;
          border-radius: 6px;
          overflow: hidden;
          cursor: pointer;
          transition: transform 0.2s ease, box-shadow 0.2s ease, z-index 0s linear 0.2s;
          background: var(--surface2);
        }
        .browse-card:hover {
          transform: scale(1.08);
          z-index: 6;
          box-shadow: 0 8px 24px rgba(0,0,0,0.6);
          transition: transform 0.2s ease, box-shadow 0.2s ease, z-index 0s;
        }
        .browse-card img {
          width: 100%; height: 100%;
          object-fit: cover; display: block;
        }
        .browse-card-fallback {
          width: 100%; height: 100%;
          display: flex; align-items: center; justify-content: center;
          color: var(--text-muted);
          font-size: 12px;
          padding: 12px;
          text-align: center;
        }
        .card-library {
          position: absolute; top: 6px; right: 6px;
          display: inline-flex; align-items: center; gap: 3px;
          background: var(--green); color: #000;
          padding: 2px 6px;
          border-radius: 3px;
          font-size: 10px; font-weight: 700;
          z-index: 2;
        }
        .card-theaters {
          position: absolute; top: 6px; left: 6px;
          display: inline-flex; align-items: center; gap: 3px;
          background: var(--red); color: #fff;
          padding: 2px 6px;
          border-radius: 3px;
          font-size: 10px; font-weight: 700;
          z-index: 2;
        }
        .card-fresh-rip {
          position: absolute; top: 6px; left: 6px;
          display: inline-flex; align-items: center; gap: 3px;
          background: #3b82f6; color: #fff;
          padding: 2px 6px;
          border-radius: 3px;
          font-size: 10px; font-weight: 700;
          z-index: 2;
          box-shadow: 0 0 10px rgba(59,130,246,0.45);
        }
        .card-overlay {
          position: absolute; left: 0; right: 0; bottom: 0;
          padding: 28px 10px 10px;
          background: linear-gradient(0deg, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.4) 60%, rgba(0,0,0,0) 100%);
        }
        .card-overlay-title {
          font-size: 13px; font-weight: 600;
          line-height: 1.2;
          color: var(--text);
          margin-bottom: 4px;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          opacity: 0;
          max-height: 0;
          transition: opacity 0.2s ease, max-height 0.2s ease, margin-bottom 0.2s ease;
        }
        .browse-card:hover .card-overlay-title {
          opacity: 1;
          max-height: 40px;
        }
        .card-overlay-meta {
          font-size: 12px;
          display: flex; gap: 8px; align-items: center;
        }
        .card-overlay-rating {
          color: var(--accent);
          font-weight: 600;
        }
        .card-overlay-year { color: var(--text-muted); }
        .card-overlay-es {
          margin-left: auto;
          background: #a855f7;
          color: #fff;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.05em;
          padding: 1px 5px;
          border-radius: 3px;
        }

        /* Top 10 numbered styling */
        .top10-card {
          display: flex;
          align-items: stretch;
          flex: 0 0 auto;
        }
        .top10-rank {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 11rem;
          line-height: 0.85;
          color: var(--surface);
          -webkit-text-stroke: 2px var(--text-muted);
          text-stroke: 2px var(--text-muted);
          padding-right: 0;
          margin-right: -42px;
          z-index: 1;
          pointer-events: none;
          align-self: flex-end;
          font-weight: 700;
          letter-spacing: -0.05em;
          user-select: none;
        }
        .top10-card .browse-card { z-index: 2; }

        @media (max-width: 768px) {
          .row-header { padding: 0 16px; }
          .row-title { font-size: 1rem; }
          .row-scroller {
            padding: 8px 16px;
            scroll-snap-type: x mandatory;
            -webkit-overflow-scrolling: touch;
          }
          .row-arrow { display: none; }
          .browse-card {
            width: 130px;
            scroll-snap-align: start;
          }
          .browse-card:hover { transform: none; box-shadow: none; }
          .browse-card:hover .card-overlay-title {
            opacity: 1; max-height: 40px;
          }
          .card-overlay { padding: 24px 8px 8px; }
          .card-overlay-title { font-size: 11px; }
          .card-overlay-meta { font-size: 10px; gap: 6px; }
          .top10-rank {
            font-size: 6rem;
            margin-right: -20px;
            -webkit-text-stroke: 1.5px var(--text-muted);
          }
          .row-top10 .row-scroller { padding-left: 16px; }
        }
        @media (max-width: 480px) {
          .browse-card { width: 118px; }
          .top10-rank { font-size: 5rem; margin-right: -16px; }
        }
      `}</style>
    </section>
  )
}

const POSTER_BASE = 'https://image.tmdb.org/t/p/w342'

function RowCard({ movie, rank, onClick }) {
  const year = movie.release_date?.split('-')[0]
  const card = (
    <div className="browse-card" onClick={onClick}>
      {movie.in_library && (
        <span className="card-library"><Check size={10} /> In Library</span>
      )}
      {!movie.in_library && movie.fresh_rip && (
        <span className="card-fresh-rip" title="Quality WEB-DL or BluRay rip recently became available">
          <Sparkles size={10} /> New Rip
        </span>
      )}
      {!movie.in_library && !movie.fresh_rip && isInTheaters(movie) && (
        <span className="card-theaters" title="Likely still in theaters — quality rips may not be available yet">
          <Film size={10} /> In Theaters
        </span>
      )}
      {movie.poster_url || movie.poster_path ? (
        <img
          src={movie.poster_url || `${POSTER_BASE}${movie.poster_path}`}
          alt={movie.title}
          loading="lazy"
        />
      ) : (
        <div className="browse-card-fallback">{movie.title}</div>
      )}
      <div className="card-overlay">
        <div className="card-overlay-title">{movie.title}</div>
        <div className="card-overlay-meta">
          {movie.vote_average ? (
            <span className="card-overlay-rating">★ {movie.vote_average.toFixed(1)}</span>
          ) : null}
          {year && <span className="card-overlay-year">{year}</span>}
          {hasSpanish(movie) && (
            <span className="card-overlay-es" title="Originally Spanish-language film">ES</span>
          )}
        </div>
      </div>
    </div>
  )
  if (rank != null) {
    return (
      <div className="top10-card">
        <span className="top10-rank">{rank}</span>
        {card}
      </div>
    )
  }
  return card
}
