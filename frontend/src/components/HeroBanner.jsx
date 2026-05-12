import { useState, useEffect, useRef } from 'react'
import { Play, Info, ChevronLeft, ChevronRight } from 'lucide-react'

const BACKDROP_BASE = 'https://image.tmdb.org/t/p/w1280'

export default function HeroBanner({ movies, onOpen }) {
  const [idx, setIdx] = useState(0)
  const [paused, setPaused] = useState(false)
  const timer = useRef(null)
  const touchStartX = useRef(null)
  const touchStartY = useRef(null)

  // Shuffle once per movies-set so the order isn't deterministic across mounts
  const orderedRef = useRef(null)
  if (!orderedRef.current || orderedRef.current.source !== movies) {
    orderedRef.current = {
      source: movies,
      list: [...(movies || [])]
        .filter(m => m.backdrop_path)
        .sort(() => Math.random() - 0.5)
        .slice(0, 6),
    }
  }
  const list = orderedRef.current.list

  useEffect(() => {
    if (paused || list.length <= 1) return
    timer.current = setTimeout(() => {
      setIdx(i => (i + 1) % list.length)
    }, 8000)
    return () => clearTimeout(timer.current)
  }, [idx, paused, list.length])

  if (list.length === 0) {
    return <div className="hero hero-empty">Loading featured…</div>
  }

  const goTo = (i) => setIdx((i + list.length) % list.length)
  const prev = () => goTo(idx - 1)
  const next = () => goTo(idx + 1)

  const current = list[idx]
  const year = current.release_date?.split('-')[0]

  return (
    <section
      className="hero"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={e => {
        touchStartX.current = e.touches[0].clientX
        touchStartY.current = e.touches[0].clientY
        setPaused(true)
      }}
      onTouchEnd={e => {
        const sx = touchStartX.current, sy = touchStartY.current
        touchStartX.current = null; touchStartY.current = null
        setPaused(false)
        if (sx == null || sy == null) return
        const dx = e.changedTouches[0].clientX - sx
        const dy = e.changedTouches[0].clientY - sy
        // Only treat as a swipe if it's primarily horizontal and past threshold
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
          if (dx < 0) next(); else prev()
        }
      }}
    >
      {list.map((m, i) => (
        <div
          key={m.id}
          className={`hero-bg ${i === idx ? 'active' : ''}`}
          style={{ backgroundImage: `url(${BACKDROP_BASE}${m.backdrop_path})` }}
          aria-hidden={i !== idx}
        />
      ))}
      <div className="hero-overlay" />

      {list.length > 1 && (
        <>
          <button className="hero-arrow left" onClick={prev} aria-label="Previous featured movie">
            <ChevronLeft size={40} />
          </button>
          <button className="hero-arrow right" onClick={next} aria-label="Next featured movie">
            <ChevronRight size={40} />
          </button>
        </>
      )}

      <div className="hero-content">
        <h1 className="hero-title">{current.title}</h1>
        <div className="hero-meta">
          {current.vote_average != null && (
            <span className="hero-tag hero-rating">★ {current.vote_average.toFixed(1)}</span>
          )}
          {year && <span className="hero-tag">{year}</span>}
          {current.in_library && <span className="hero-tag hero-library">In Library</span>}
        </div>
        <p className="hero-overview">{current.overview}</p>
        <div className="hero-actions">
          <button className="hero-btn primary" onClick={() => onOpen(current)}>
            <Play size={16} fill="currentColor" /> Download
          </button>
          <button className="hero-btn secondary" onClick={() => onOpen(current)}>
            <Info size={16} /> More Info
          </button>
        </div>
      </div>

      <div className="hero-dots">
        {list.map((_, i) => (
          <button
            key={i}
            className={`hero-dot ${i === idx ? 'active' : ''}`}
            onClick={() => setIdx(i)}
            aria-label={`Featured ${i + 1} of ${list.length}`}
          />
        ))}
      </div>

      <style>{`
        .hero {
          position: relative;
          width: 100%;
          height: 60vh;
          min-height: 420px;
          overflow: hidden;
          margin-bottom: 32px;
        }
        .hero-empty {
          display: flex; align-items: center; justify-content: center;
          color: var(--text-muted);
          background: var(--surface2);
        }
        .hero-bg {
          position: absolute; inset: 0;
          background-size: cover;
          background-position: center 20%;
          background-repeat: no-repeat;
          opacity: 0;
          transition: opacity 1.2s ease;
        }
        .hero-bg.active { opacity: 1; }
        .hero-overlay {
          position: absolute; inset: 0;
          background:
            linear-gradient(90deg, rgba(10,10,15,0.97) 0%, rgba(10,10,15,0.6) 45%, rgba(10,10,15,0) 75%),
            linear-gradient(0deg, rgba(10,10,15,1) 0%, rgba(10,10,15,0) 35%);
        }
        .hero-content {
          position: absolute;
          left: 5%; right: 50%;
          bottom: 18%;
          z-index: 2;
        }
        .hero-title {
          font-family: 'Bebas Neue', sans-serif;
          font-size: clamp(2.2rem, 4.5vw, 4rem);
          line-height: 1;
          letter-spacing: 0.02em;
          margin-bottom: 14px;
          color: var(--text);
          text-shadow: 0 2px 16px rgba(0,0,0,0.6);
        }
        .hero-meta {
          display: flex; gap: 8px; flex-wrap: wrap;
          margin-bottom: 14px;
        }
        .hero-tag {
          background: rgba(0,0,0,0.5);
          border: 1px solid var(--border);
          color: var(--text);
          padding: 3px 10px;
          border-radius: 4px;
          font-size: 12px;
        }
        .hero-rating { color: var(--accent); border-color: var(--accent); }
        .hero-library { color: var(--green); border-color: var(--green); }
        .hero-overview {
          font-size: 14px; line-height: 1.55;
          color: rgba(240,238,234,0.85);
          margin-bottom: 18px;
          max-width: 600px;
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .hero-actions { display: flex; gap: 10px; flex-wrap: wrap; }
        .hero-btn {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 10px 22px;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 600;
          transition: all 0.15s;
        }
        .hero-btn.primary {
          background: var(--accent);
          color: #000;
          border: 1px solid var(--accent);
        }
        .hero-btn.primary:hover { background: #f0b040; }
        .hero-btn.secondary {
          background: rgba(40,40,50,0.7);
          color: var(--text);
          border: 1px solid var(--border);
          backdrop-filter: blur(6px);
        }
        .hero-btn.secondary:hover { background: rgba(60,60,70,0.85); }
        .hero-arrow {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          width: 56px; height: 56px;
          display: flex; align-items: center; justify-content: center;
          background: rgba(0,0,0,0.45);
          color: var(--text);
          border-radius: 50%;
          cursor: pointer;
          opacity: 0;
          transition: opacity 0.2s ease, background 0.15s ease, transform 0.15s ease;
          z-index: 4;
          backdrop-filter: blur(4px);
          padding: 0;
        }
        .hero-arrow.left { left: 24px; }
        .hero-arrow.right { right: 24px; }
        .hero:hover .hero-arrow { opacity: 1; }
        .hero-arrow:hover {
          background: rgba(0,0,0,0.75);
          transform: translateY(-50%) scale(1.08);
        }
        .hero-arrow:active { transform: translateY(-50%) scale(0.95); }
        .hero-dots {
          position: absolute;
          left: 5%;
          bottom: 5%;
          display: flex; gap: 6px;
          z-index: 3;
        }
        .hero-dot {
          width: 28px; height: 3px;
          background: rgba(255,255,255,0.25);
          border-radius: 2px;
          padding: 0;
          cursor: pointer;
          transition: background 0.2s, height 0.15s, width 0.15s;
        }
        .hero-dot:hover { background: rgba(255,255,255,0.6); height: 4px; }
        .hero-dot.active { background: var(--accent); width: 36px; }

        @media (max-width: 768px) {
          .hero { height: 50vh; min-height: 360px; }
          .hero-content { right: 8%; bottom: 14%; }
          .hero-overview { font-size: 13px; -webkit-line-clamp: 2; }
          .hero-arrow { display: none; }
          .hero-dot { width: 20px; height: 3px; }
          .hero-dot.active { width: 26px; }
        }
        @media (max-width: 480px) {
          .hero {
            height: 50vh;
            min-height: 320px;
            touch-action: pan-y;
          }
          .hero-content { left: 5%; right: 5%; bottom: 18%; }
          .hero-meta { gap: 6px; margin-bottom: 10px; }
          .hero-tag { font-size: 11px; padding: 2px 8px; }
          .hero-overview { font-size: 12px; margin-bottom: 14px; -webkit-line-clamp: 2; }
          .hero-actions { gap: 8px; flex-direction: column; align-items: stretch; }
          .hero-btn { width: 100%; justify-content: center; padding: 12px 18px; min-height: 44px; }
          .hero-dots { bottom: 4%; gap: 5px; }
        }
      `}</style>
    </section>
  )
}
