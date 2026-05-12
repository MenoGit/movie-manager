import { useState, useEffect } from 'react'
import { X, Film, Tv, Trash2, RefreshCw } from 'lucide-react'
import { getDownloadHistory, clearDownloadHistory } from '../api'

function formatSize(bytes) {
  if (!bytes) return ''
  const gb = bytes / 1e9
  return gb >= 1 ? `${gb.toFixed(2)} GB` : `${(bytes / 1e6).toFixed(0)} MB`
}

function formatRelative(iso) {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  const diffMin = (Date.now() - then) / 60000
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${Math.round(diffMin)}m ago`
  const diffH = diffMin / 60
  if (diffH < 24) return `${Math.round(diffH)}h ago`
  const diffD = diffH / 24
  if (diffD < 30) return `${Math.round(diffD)}d ago`
  return new Date(iso).toLocaleDateString()
}

export default function HistoryOverlay({ onClose }) {
  const [items, setItems] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  async function load() {
    setRefreshing(true)
    try {
      const r = await getDownloadHistory()
      setItems(r.data || [])
    } catch { setItems([]) }
    setRefreshing(false)
  }

  useEffect(() => {
    load()
    document.body.classList.add('modal-open')
    const esc = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc)
    return () => {
      document.body.classList.remove('modal-open')
      window.removeEventListener('keydown', esc)
    }
  }, [onClose])

  async function handleClear() {
    if (!window.confirm('Clear all download history? This cannot be undone.')) return
    await clearDownloadHistory()
    load()
  }

  return (
    <div className="history-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="history-panel">
        <div className="history-header">
          <h2>Download History</h2>
          <div className="history-actions">
            <button className="history-refresh" onClick={load} disabled={refreshing}>
              <RefreshCw size={14} className={refreshing ? 'spin' : ''} /> Refresh
            </button>
            {items && items.length > 0 && (
              <button className="history-clear" onClick={handleClear}>
                <Trash2 size={14} /> Clear
              </button>
            )}
            <button className="history-close" onClick={onClose} aria-label="Close"><X size={20}/></button>
          </div>
        </div>

        <div className="history-body">
          {items === null ? (
            <div className="history-empty">Loading…</div>
          ) : items.length === 0 ? (
            <div className="history-empty">
              <p>No download history yet.</p>
              <p className="hint">Completed downloads will appear here automatically.</p>
            </div>
          ) : (
            <ul className="history-list">
              {items.map((it, i) => (
                <li key={`${it.hash || it.name}-${i}`} className="history-item">
                  <span className={`history-type ${it.type === 'tv' ? 'tv' : 'movie'}`}>
                    {it.type === 'tv' ? <Tv size={11} /> : <Film size={11} />}
                    {it.type === 'tv' ? 'TV' : 'Movie'}
                  </span>
                  <span className="history-name" title={it.name}>{it.name}</span>
                  <span className="history-size">{formatSize(it.size)}</span>
                  <span className="history-time" title={it.timestamp}>{formatRelative(it.timestamp)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <style>{`
        .history-overlay {
          position: fixed; inset: 0;
          background: rgba(0,0,0,0.85);
          display: flex; align-items: center; justify-content: center;
          z-index: 100; padding: 20px;
        }
        .history-panel {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 14px;
          width: 100%; max-width: 900px;
          max-height: 90vh;
          display: flex; flex-direction: column;
        }
        .history-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 18px 22px;
          border-bottom: 1px solid var(--border);
          gap: 10px; flex-wrap: wrap;
        }
        .history-header h2 { font-size: 1.5rem; }
        .history-actions { display: flex; gap: 8px; align-items: center; }
        .history-refresh, .history-clear {
          display: inline-flex; align-items: center; gap: 6px;
          background: transparent; border: 1px solid var(--border);
          color: var(--text-muted);
          padding: 6px 12px; border-radius: 6px;
          font-size: 12px;
        }
        .history-refresh:hover { border-color: var(--accent); color: var(--accent); }
        .history-clear:hover { border-color: var(--red); color: var(--red); }
        .history-close {
          background: rgba(0,0,0,0.4); color: var(--text);
          border-radius: 50%; width: 36px; height: 36px;
          display: flex; align-items: center; justify-content: center;
        }
        .history-close:hover { background: var(--accent); color: #000; }
        .history-body {
          overflow-y: auto;
          padding: 12px 18px 22px;
        }
        .history-empty {
          text-align: center; padding: 40px 12px;
          color: var(--text-muted);
        }
        .history-empty .hint { font-size: 12px; margin-top: 6px; }
        .history-list { list-style: none; display: flex; flex-direction: column; gap: 6px; }
        .history-item {
          display: grid;
          grid-template-columns: 80px 1fr auto auto;
          gap: 14px;
          align-items: center;
          padding: 10px 14px;
          background: var(--surface2);
          border: 1px solid var(--border);
          border-radius: 8px;
          font-size: 13px;
        }
        .history-type {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 2px 8px; border-radius: 4px;
          font-size: 10px; font-weight: 700;
          text-transform: uppercase; letter-spacing: 0.04em;
        }
        .history-type.movie { background: rgba(232,160,48,0.15); color: var(--accent); border: 1px solid rgba(232,160,48,0.4); }
        .history-type.tv    { background: rgba(80,130,220,0.15); color: #6aa8f6; border: 1px solid rgba(80,130,220,0.4); }
        .history-name {
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          min-width: 0;
        }
        .history-size { font-size: 12px; color: var(--text-muted); white-space: nowrap; }
        .history-time { font-size: 12px; color: var(--text-muted); white-space: nowrap; }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 480px) {
          .history-overlay { padding: 0; }
          .history-panel { border-radius: 0; max-height: 100vh; height: 100vh; max-width: 100%; }
          .history-item { grid-template-columns: 60px 1fr; row-gap: 4px; }
          .history-size, .history-time { grid-column: 2; padding-left: 0; }
        }
      `}</style>
    </div>
  )
}
