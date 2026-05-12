import { useState, useEffect } from 'react'
import './index.css'
import { Film, LayoutGrid, Tv } from 'lucide-react'
import Home from './pages/Home'
import Browse from './pages/Browse'

export default function App() {
  const [view, setView] = useState(() => {
    try { return localStorage.getItem('view') || 'grid' } catch { return 'grid' }
  })

  useEffect(() => {
    try { localStorage.setItem('view', view) } catch {}
  }, [view])

  return (
    <div>
      <header className="app-header">
        <div className="app-logo">
          <Film size={22} />
          <span>FILMVAULT</span>
        </div>
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
      </header>
      <main>
        {view === 'browse' ? <Browse /> : <Home />}
      </main>

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
        @media (max-width: 480px) {
          .app-header { padding: 10px 14px; gap: 10px; }
          .view-toggle { padding: 2px; }
          .view-btn { padding: 6px 8px; min-height: 32px; min-width: 32px; }
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
      `}</style>
    </div>
  )
}
