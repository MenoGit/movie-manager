import { useState, useEffect } from 'react'
import './index.css'
import { Film, LayoutGrid, Tv, Clock, Settings as SettingsIcon } from 'lucide-react'
import Home from './pages/Home'
import Browse from './pages/Browse'
import TVHome from './pages/TVHome'
import TVBrowse from './pages/TVBrowse'
import AnimeHome from './pages/AnimeHome'
import AnimeBrowse from './pages/AnimeBrowse'
import HistoryOverlay from './components/HistoryOverlay'
import SettingsOverlay from './components/SettingsOverlay'
import NotificationBanner from './components/NotificationBanner'

export default function App() {
  const [view, setView] = useState(() => {
    try { return localStorage.getItem('view') || 'grid' } catch { return 'grid' }
  })
  const [mode, setMode] = useState(() => {
    try { return localStorage.getItem('mode') || 'movies' } catch { return 'movies' }
  })
  const [showHistory, setShowHistory] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    try { localStorage.setItem('view', view) } catch {}
  }, [view])
  useEffect(() => {
    try { localStorage.setItem('mode', mode) } catch {}
  }, [mode])

  let page
  if (mode === 'anime') page = view === 'browse' ? <AnimeBrowse /> : <AnimeHome />
  else if (mode === 'tv') page = view === 'browse' ? <TVBrowse /> : <TVHome />
  else page = view === 'browse' ? <Browse /> : <Home />

  return (
    <div>
      <header className="app-header">
        <div className="app-logo">
          <Film size={22} />
          <span>FILMVAULT</span>
        </div>
        <div className="mode-tabs" role="tablist" aria-label="Content">
          <button
            className={`mode-tab ${mode === 'movies' ? 'active' : ''}`}
            onClick={() => setMode('movies')}
            aria-pressed={mode === 'movies'}
          >
            Movies
          </button>
          <button
            className={`mode-tab ${mode === 'tv' ? 'active' : ''}`}
            onClick={() => setMode('tv')}
            aria-pressed={mode === 'tv'}
          >
            TV Shows
          </button>
          <button
            className={`mode-tab ${mode === 'anime' ? 'active' : ''}`}
            onClick={() => setMode('anime')}
            aria-pressed={mode === 'anime'}
          >
            Anime
          </button>
        </div>
        <div className="header-actions">
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
      <main>
        {page}
      </main>
      {showHistory && <HistoryOverlay onClose={() => setShowHistory(false)} />}
      {showSettings && <SettingsOverlay onClose={() => setShowSettings(false)} />}

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
          display: flex; align-items: center; gap: 10px;
          font-family: 'Bebas Neue', sans-serif;
          font-size: clamp(1.05rem, 4vw, 1.5rem);
          letter-spacing: 0.1em;
          color: var(--accent);
          white-space: nowrap;
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
        @media (max-width: 480px) {
          .app-header { padding: 10px 12px; gap: 8px; flex-wrap: wrap; }
          .mode-tab { padding: 5px 10px; font-size: 12px; }
          .view-toggle { padding: 2px; }
          .view-btn { padding: 6px 8px; min-height: 32px; min-width: 32px; }
        }
      `}</style>
    </div>
  )
}
