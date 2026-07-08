import { useState, useEffect, useRef } from 'react'
import './index.css'
import { LayoutGrid, Tv, Clock, Settings as SettingsIcon, Bell } from 'lucide-react'
import Home from './pages/Home'
import Browse from './pages/Browse'
import TVHome from './pages/TVHome'
import TVBrowse from './pages/TVBrowse'
import AnimeHome from './pages/AnimeHome'
import AnimeBrowse from './pages/AnimeBrowse'
import HistoryOverlay from './components/HistoryOverlay'
import SettingsOverlay from './components/SettingsOverlay'
import NotificationBanner from './components/NotificationBanner'
import AutoWatchlistOverlay from './components/AutoWatchlistOverlay'
import { getAutoWatchlist } from './api'

export default function App() {
  const [view, setView] = useState(() => {
    try { return localStorage.getItem('view') || 'grid' } catch { return 'grid' }
  })
  const [mode, setMode] = useState(() => {
    try { return localStorage.getItem('mode') || 'movies' } catch { return 'movies' }
  })
  const [showHistory, setShowHistory] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showWatchlist, setShowWatchlist] = useState(false)
  const [newDownloadCount, setNewDownloadCount] = useState(0)

  // Poll the auto-watchlist every minute for items that finished downloading
  // since the user last opened the overlay. Tracked in localStorage so the
  // badge persists across reloads.
  useEffect(() => {
    let alive = true
    async function poll() {
      try {
        const r = await getAutoWatchlist()
        if (!alive) return
        const lastSeen = (() => {
          try { return localStorage.getItem('autowatch_last_seen') || '' } catch { return '' }
        })()
        const fresh = (r.data || []).filter(it =>
          it.status === 'downloaded' && (it.downloaded_at || '') > lastSeen
        )
        setNewDownloadCount(fresh.length)
      } catch {}
    }
    poll()
    const id = setInterval(poll, 60000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  function openWatchlist() {
    try { localStorage.setItem('autowatch_last_seen', new Date().toISOString()) } catch {}
    setNewDownloadCount(0)
    setShowWatchlist(true)
  }

  useEffect(() => {
    try { localStorage.setItem('view', view) } catch {}
  }, [view])
  useEffect(() => {
    try { localStorage.setItem('mode', mode) } catch {}
  }, [mode])

  // Direction-aware mode switching: the incoming page slides in from the
  // side you're heading toward (mobile only — the animation is gated to the
  // mobile breakpoint in CSS; desktop swaps instantly as before).
  const MODES = ['movies', 'tv', 'anime']
  const [pageAnim, setPageAnim] = useState('')
  function switchMode(next) {
    if (next === mode) return
    setPageAnim(MODES.indexOf(next) > MODES.indexOf(mode) ? 'page-in-left' : 'page-in-right')
    setMode(next)
  }

  // Mobile swipe between Movies / TV / Anime. Detection only — listeners are
  // passive and never hijack a scroll: gestures that start on a horizontally
  // scrollable element (chip rows, poster rails) or while a modal sheet is
  // open are ignored, and the mode flips on release, not mid-gesture.
  const mainRef = useRef(null)
  useEffect(() => {
    const el = mainRef.current
    if (!el) return
    let sx = 0, sy = 0, eligible = false

    const insideHorizontalScroller = (node) => {
      for (let n = node; n && n !== el; n = n.parentElement) {
        if (n.scrollWidth > n.clientWidth + 4) {
          const ox = getComputedStyle(n).overflowX
          if (ox === 'auto' || ox === 'scroll') return true
        }
      }
      return false
    }
    const onStart = (e) => {
      eligible = window.matchMedia('(max-width: 768px)').matches
        && !document.body.classList.contains('modal-open')
        && !insideHorizontalScroller(e.target)
      sx = e.touches[0].clientX
      sy = e.touches[0].clientY
    }
    const onEnd = (e) => {
      if (!eligible) return
      const dx = e.changedTouches[0].clientX - sx
      const dy = e.changedTouches[0].clientY - sy
      if (Math.abs(dx) < 70 || Math.abs(dx) < 2.2 * Math.abs(dy)) return
      const idx = MODES.indexOf(mode)
      const next = dx < 0 ? MODES[idx + 1] : MODES[idx - 1]
      if (next) switchMode(next)
    }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchend', onEnd)
    }
  }, [mode])

  let page
  if (mode === 'anime') page = view === 'browse' ? <AnimeBrowse /> : <AnimeHome />
  else if (mode === 'tv') page = view === 'browse' ? <TVBrowse /> : <TVHome />
  else page = view === 'browse' ? <Browse /> : <Home />

  return (
    <div>
      <header className="app-header">
        <a className="app-logo" href="/" aria-label="FilmVault home">
          <img src="/assets/logo-header.png" alt="FilmVault" />
        </a>
        <div className="mode-tabs" role="tablist" aria-label="Content">
          <button
            className={`mode-tab ${mode === 'movies' ? 'active' : ''}`}
            onClick={() => switchMode('movies')}
            aria-pressed={mode === 'movies'}
          >
            Movies
          </button>
          <button
            className={`mode-tab ${mode === 'tv' ? 'active' : ''}`}
            onClick={() => switchMode('tv')}
            aria-pressed={mode === 'tv'}
          >
            TV Shows
          </button>
          <button
            className={`mode-tab ${mode === 'anime' ? 'active' : ''}`}
            onClick={() => switchMode('anime')}
            aria-pressed={mode === 'anime'}
          >
            Anime
          </button>
        </div>
        <div className="header-actions">
          <button
            className="icon-btn icon-btn-badged"
            onClick={openWatchlist}
            title="Auto-download watchlist"
            aria-label="Auto-download watchlist"
          >
            <Bell size={16} />
            {newDownloadCount > 0 && (
              <span className="icon-btn-badge" aria-label={`${newDownloadCount} new`}>
                {newDownloadCount > 9 ? '9+' : newDownloadCount}
              </span>
            )}
          </button>
          <button
            className="icon-btn"
            onClick={() => setShowHistory(true)}
            title="Download history"
            aria-label="Download history"
          >
            <Clock size={16} />
          </button>
          <button
            className="icon-btn"
            onClick={() => setShowSettings(true)}
            title="Quality preferences"
            aria-label="Quality preferences"
          >
            <SettingsIcon size={16} />
          </button>
          <div className="view-toggle" role="tablist" aria-label="Layout">
            <button
              className={`view-btn ${view === 'grid' ? 'active' : ''}`}
              onClick={() => setView('grid')}
              title="Grid view"
              aria-pressed={view === 'grid'}
            >
              <LayoutGrid size={16} />
            </button>
            <button
              className={`view-btn ${view === 'browse' ? 'active' : ''}`}
              onClick={() => setView('browse')}
              title="Browse view"
              aria-pressed={view === 'browse'}
            >
              <Tv size={16} />
            </button>
          </div>
        </div>
      </header>
      <NotificationBanner />
      <main ref={mainRef}>
        <div key={mode} className={`page-shell ${pageAnim}`}>
          {page}
        </div>
      </main>
      {showHistory && <HistoryOverlay onClose={() => setShowHistory(false)} />}
      {showSettings && <SettingsOverlay onClose={() => setShowSettings(false)} />}
      {showWatchlist && <AutoWatchlistOverlay onClose={() => setShowWatchlist(false)} />}

      <style>{`
        .app-header {
          border-bottom: 1px solid var(--border);
          padding: 16px 24px;
          padding-top: max(16px, env(safe-area-inset-top));
          display: flex;
          align-items: center;
          gap: 16px;
          background: rgba(10,10,15,0.9);
          backdrop-filter: blur(12px);
          position: sticky; top: 0; z-index: 50;
        }
        .app-logo {
          display: flex; align-items: center;
          flex-shrink: 0;
          line-height: 0;
        }
        .app-logo img {
          height: 42px;
          width: auto;
          display: block;
          filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.5));
        }
        .mode-tabs {
          display: flex; gap: 2px;
          padding: 3px;
          background: var(--surface2);
          border: 1px solid var(--border);
          border-radius: 8px;
        }
        .mode-tab {
          background: transparent;
          color: var(--text-muted);
          padding: 6px 14px;
          border-radius: 5px;
          font-size: 13px;
          font-weight: 500;
          transition: all 0.15s;
          white-space: nowrap;
        }
        .mode-tab:hover { color: var(--text); }
        .mode-tab.active { background: var(--accent); color: #000; font-weight: 600; }
        .header-actions {
          margin-left: auto;
          display: flex; align-items: center; gap: 8px;
        }
        .icon-btn {
          background: var(--surface2); border: 1px solid var(--border);
          color: var(--text-muted);
          width: 36px; height: 36px;
          border-radius: 8px;
          display: flex; align-items: center; justify-content: center;
          transition: all 0.15s;
        }
        .icon-btn:hover { border-color: var(--accent); color: var(--accent); }
        .icon-btn-badged { position: relative; }
        .icon-btn-badge {
          position: absolute;
          top: -4px;
          right: -4px;
          min-width: 16px;
          height: 16px;
          padding: 0 4px;
          border-radius: 8px;
          background: var(--red);
          color: #fff;
          font-size: 10px;
          font-weight: 700;
          line-height: 16px;
          text-align: center;
          border: 2px solid var(--surface2);
        }
        .view-toggle {
          display: flex; gap: 2px;
          padding: 3px;
          background: var(--surface2);
          border: 1px solid var(--border);
          border-radius: 8px;
        }
        .view-btn {
          background: transparent;
          color: var(--text-muted);
          padding: 5px 10px;
          border-radius: 5px;
          display: flex; align-items: center; justify-content: center;
          transition: all 0.15s;
        }
        .view-btn:hover { color: var(--text); }
        .view-btn.active { background: var(--accent); color: #000; }
        @media (max-width: 768px) {
          /* Page slide-fade when switching Movies / TV / Anime (swipe or tap).
             Keyed remount restarts the animation; desktop swaps instantly. */
          .page-shell.page-in-left { animation: page-in-left 320ms var(--ease); }
          .page-shell.page-in-right { animation: page-in-right 320ms var(--ease); }
          @keyframes page-in-left {
            from { opacity: 0; transform: translateX(28px); }
            to { opacity: 1; transform: translateX(0); }
          }
          @keyframes page-in-right {
            from { opacity: 0; transform: translateX(-28px); }
            to { opacity: 1; transform: translateX(0); }
          }

          /* Header reflows to two rows: logo + actions, then a full-width
             thumb-sized segmented control. */
          .app-header { padding: 10px 14px 8px; gap: 10px; flex-wrap: wrap; }
          .app-logo img { height: 32px; }
          .mode-tabs {
            order: 3;
            flex-basis: 100%;
            border-radius: 12px;
          }
          .mode-tab {
            flex: 1;
            min-height: 44px;
            padding: 8px 10px;
            border-radius: 9px;
            font-size: 13px;
          }
          .icon-btn { width: 42px; height: 42px; border-radius: 10px; }
          .view-btn { padding: 8px 10px; min-height: 36px; min-width: 38px; }
        }
      `}</style>
    </div>
  )
}
