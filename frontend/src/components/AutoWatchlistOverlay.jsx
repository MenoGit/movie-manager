import { useState, useEffect } from 'react'
import { X, RefreshCw, Trash2, Clock, CheckCircle, AlertCircle, Bell } from 'lucide-react'
import {
  getAutoWatchlist, removeFromAutoWatchlist,
  patchAutoWatchlist, triggerAutoWatchlistCheck,
} from '../api'

const PRESETS = [
  ['quality', 'Quality'],
  ['value', 'Value'],
  ['budget', 'Budget'],
]

function formatRelative(iso) {
  if (!iso) return 'never'
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

const STATUS_META = {
  waiting:    { icon: <Clock size={12}/>,        label: 'Waiting',    color: 'var(--accent)' },
  downloaded: { icon: <CheckCircle size={12}/>,  label: 'Downloaded', color: 'var(--green)' },
  failed:     { icon: <AlertCircle size={12}/>,  label: 'Failed',     color: 'var(--red)' },
}

export default function AutoWatchlistOverlay({ onClose }) {
  const [items, setItems] = useState(null)
  const [checking, setChecking] = useState(false)

  async function load() {
    try {
      const r = await getAutoWatchlist()
      setItems(r.data || [])
    } catch { setItems([]) }
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

  async function handleCheckNow() {
    setChecking(true)
    try { await triggerAutoWatchlistCheck() } catch {}
    // Backend kicks off async — poll a few times for visible updates
    setTimeout(() => { load(); setChecking(false) }, 2000)
    setTimeout(load, 15000)
    setTimeout(load, 45000)
  }

  async function handleRemove(item) {
    if (!window.confirm(`Stop auto-downloading "${item.title}"?`)) return
    await removeFromAutoWatchlist(item.type, item.id)
    load()
  }

  async function handlePresetChange(item, preset) {
    await patchAutoWatchlist(item.type, item.id, { quality_preset: preset })
    load()
  }

  return (
    <div className="aw-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="aw-panel">
        <div className="aw-header">
          <h2><Bell size={18} style={{verticalAlign:'middle', marginRight:8}}/>Auto-Download Watchlist</h2>
          <div className="aw-actions">
            <button className="aw-btn" onClick={handleCheckNow} disabled={checking}>
              <RefreshCw size={13} className={checking ? 'spin' : ''} />
              {checking ? 'Checking…' : 'Check Now'}
            </button>
            <button className="aw-close" onClick={onClose} aria-label="Close"><X size={20}/></button>
          </div>
        </div>

        <div className="aw-body">
          <p className="aw-intro">
            FilmVault checks for new releases every 6 hours and auto-downloads
            the best match in your chosen tier (when seeds ≥ 20 and not a
            CAM/TS rip). For TV shows, FilmVault keeps watching for new seasons.
          </p>

          {items === null ? (
            <div className="aw-empty">Loading…</div>
          ) : items.length === 0 ? (
            <div className="aw-empty">
              <p>Nothing on the watchlist yet.</p>
              <p className="hint">Click "🔔 Auto-download when available" on any movie or show that doesn't have a good rip yet.</p>
            </div>
          ) : (
            <ul className="aw-list">
              {items.map(it => {
                const meta = STATUS_META[it.status] || STATUS_META.waiting
                return (
                  <li key={`${it.type}-${it.id}`} className={`aw-item status-${it.status}`}>
                    <div className="aw-item-main">
                      <div className="aw-item-head">
                        <span className="aw-type">{it.type.toUpperCase()}</span>
                        <span className="aw-name" title={it.title}>{it.title}</span>
                      </div>
                      <div className="aw-item-meta">
                        <span className="aw-status" style={{color: meta.color}}>
                          {meta.icon} {meta.label}
                        </span>
                        {it.status === 'waiting' && (
                          <span className="aw-last-checked">last checked: {formatRelative(it.last_checked)}</span>
                        )}
                        {it.status === 'downloaded' && it.downloaded_at && (
                          <span className="aw-last-checked">downloaded: {formatRelative(it.downloaded_at)}</span>
                        )}
                        {it.last_downloaded_season != null && (
                          <span className="aw-last-checked">last got: S{String(it.last_downloaded_season).padStart(2,'0')} {formatRelative(it.last_downloaded_at)}</span>
                        )}
                      </div>
                    </div>
                    <div className="aw-presets">
                      {PRESETS.map(([p, label]) => (
                        <button
                          key={p}
                          className={`aw-preset ${it.quality_preset === p ? 'active' : ''}`}
                          onClick={() => handlePresetChange(it, p)}
                          title={`Prefer ${label} tier rips`}
                        >{label}</button>
                      ))}
                    </div>
                    <button className="aw-remove" onClick={() => handleRemove(it)} aria-label="Remove">
                      <Trash2 size={14} />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      <style>{`
        .aw-overlay {
          position: fixed; inset: 0;
          background: rgba(0,0,0,0.85);
          display: flex; align-items: center; justify-content: center;
          z-index: 100; padding: 20px;
        }
        .aw-panel {
          background: var(--surface); border: 1px solid var(--border);
          border-radius: 14px;
          width: 100%; max-width: 920px;
          max-height: 90vh;
          display: flex; flex-direction: column;
        }
        .aw-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 18px 22px; border-bottom: 1px solid var(--border);
          gap: 10px; flex-wrap: wrap;
        }
        .aw-header h2 { font-size: 1.5rem; }
        .aw-actions { display: flex; gap: 8px; align-items: center; }
        .aw-btn {
          display: inline-flex; align-items: center; gap: 6px;
          background: transparent; border: 1px solid var(--border);
          color: var(--text-muted);
          padding: 6px 12px; border-radius: 6px; font-size: 12px;
        }
        .aw-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
        .aw-btn:disabled { opacity: 0.6; cursor: wait; }
        .aw-close {
          background: rgba(0,0,0,0.4); color: var(--text);
          border-radius: 50%; width: 36px; height: 36px;
          display: flex; align-items: center; justify-content: center;
        }
        .aw-close:hover { background: var(--accent); color: #000; }
        .aw-body { overflow-y: auto; padding: 14px 22px 22px; }
        .aw-intro { font-size: 13px; color: var(--text-muted); line-height: 1.55; margin-bottom: 16px; }
        .aw-empty { text-align: center; padding: 40px 12px; color: var(--text-muted); }
        .aw-empty .hint { font-size: 12px; margin-top: 6px; }
        .aw-list { list-style: none; display: flex; flex-direction: column; gap: 8px; }
        .aw-item {
          display: grid;
          grid-template-columns: 1fr auto auto;
          gap: 14px;
          align-items: center;
          padding: 12px 14px;
          background: var(--surface2);
          border: 1px solid var(--border);
          border-radius: 8px;
        }
        .aw-item.status-downloaded { border-color: rgba(62,207,142,0.4); }
        .aw-item.status-failed     { border-color: rgba(220,80,80,0.4); }
        .aw-item-main { min-width: 0; }
        .aw-item-head { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
        .aw-type {
          padding: 2px 6px; border-radius: 3px;
          font-size: 9px; font-weight: 700;
          letter-spacing: 0.05em;
          background: var(--surface); border: 1px solid var(--border);
          color: var(--text-muted);
        }
        .aw-name {
          font-size: 14px; font-weight: 600;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .aw-item-meta {
          display: flex; gap: 12px; flex-wrap: wrap;
          font-size: 11px; color: var(--text-muted);
        }
        .aw-status { display: inline-flex; align-items: center; gap: 4px; font-weight: 600; }
        .aw-presets { display: flex; gap: 2px; }
        .aw-preset {
          background: transparent; border: 1px solid var(--border);
          color: var(--text-muted);
          padding: 4px 10px; font-size: 11px;
          transition: all 0.15s;
        }
        .aw-preset:first-child { border-radius: 6px 0 0 6px; }
        .aw-preset:last-child { border-radius: 0 6px 6px 0; }
        .aw-preset:not(:last-child) { border-right: 0; }
        .aw-preset:hover { color: var(--accent); }
        .aw-preset.active { background: var(--accent); border-color: var(--accent); color: #000; font-weight: 600; }
        .aw-remove {
          background: transparent; color: var(--text-muted);
          padding: 6px; border-radius: 6px;
          display: flex; align-items: center; justify-content: center;
        }
        .aw-remove:hover { color: var(--red); background: rgba(220,80,80,0.08); }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }

        @media (max-width: 640px) {
          .aw-overlay { padding: 0; }
          .aw-panel { border-radius: 0; max-width: 100%; max-height: 100vh; height: 100vh; }
          .aw-item {
            grid-template-columns: 1fr auto;
            grid-template-areas: "main remove" "presets presets";
            row-gap: 8px;
          }
          .aw-item-main { grid-area: main; }
          .aw-remove { grid-area: remove; }
          .aw-presets { grid-area: presets; }
        }
      `}</style>
    </div>
  )
}
