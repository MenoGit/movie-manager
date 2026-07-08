import { useState, useEffect } from 'react'
import { Trash2, RefreshCw } from 'lucide-react'
import { getQueue, deleteTorrent, refreshLibrary } from '../api'
import useCompletionNotifications from '../hooks/useCompletionNotifications'
import StorageBar from './StorageBar'

function formatSize(bytes) {
  if (!bytes) return '?'
  const gb = bytes / 1e9
  return gb >= 1 ? `${gb.toFixed(2)} GB` : `${(bytes / 1e6).toFixed(0)} MB`
}

function formatSpeed(bps) {
  if (!bps) return '0 KB/s'
  const kbps = bps / 1024
  return kbps >= 1024 ? `${(kbps / 1024).toFixed(1)} MB/s` : `${kbps.toFixed(0)} KB/s`
}

function formatEta(seconds, speed) {
  if (!speed || speed <= 0) return 'stalled'
  if (!seconds || seconds <= 0 || seconds >= 8640000) return '∞'
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60)
    const s = Math.round(seconds % 60)
    return s > 0 && m < 5 ? `${m}m ${s}s` : `${m}m`
  }
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

const STATE_LABELS = {
  downloading: 'Downloading',
  uploading: 'Seeding',
  pausedDL: 'Paused',
  stalledDL: 'Stalled',
  checkingDL: 'Checking',
  queuedDL: 'Queued',
  metaDL: 'Fetching Meta',
}

export default function DownloadQueue() {
  const [queue, setQueue] = useState([])
  const [refreshMsg, setRefreshMsg] = useState('')
  useCompletionNotifications(queue)

  useEffect(() => {
    fetchAll()
    const interval = setInterval(fetchAll, 5000)
    return () => clearInterval(interval)
  }, [])

  async function fetchAll() {
    try {
      const q = await getQueue()
      setQueue(q.data)
    } catch {}
  }

  async function handleDelete(hash) {
    await deleteTorrent(hash)
    fetchAll()
  }

  async function handleLibraryRefresh() {
    setRefreshMsg('Refreshing...')
    try {
      await refreshLibrary()
      setRefreshMsg('Done!')
    } catch {
      setRefreshMsg('Error')
    }
    setTimeout(() => setRefreshMsg(''), 3000)
  }

  return (
    <section className="queue-area">
      <div className="queue-panel">
      <div className="queue-header">
        <h3 className="section-title">Download Queue</h3>
        <div className="queue-actions">
          <button className="refresh-btn" onClick={handleLibraryRefresh}>
            <RefreshCw size={14} />
            {refreshMsg || 'Refresh Library'}
          </button>
        </div>
      </div>

      <div className="queue-storage">
        <StorageBar />
      </div>

      {queue.length === 0 ? (
        <div className="queue-empty">No active downloads</div>
      ) : (
        <div className="queue-list">
          {queue.map(t => (
            <div key={t.hash} className="queue-item">
              <div className="queue-item-top">
                <span className="queue-name">{t.name}</span>
                <div className="queue-right">
                  <span className="queue-state" data-state={t.state}>
                    {STATE_LABELS[t.state] || t.state}
                  </span>
                  <button className="queue-delete" onClick={() => handleDelete(t.hash)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div className="queue-progress-bar">
                <div className="queue-progress-fill" style={{ width: `${t.progress}%` }} />
              </div>
              <div className="queue-stats">
                <span>{t.progress}%</span>
                <span>{formatSize(t.downloaded)} / {formatSize(t.size)}</span>
                <span>{formatSpeed(t.speed)}</span>
                <span>{t.seeds} seeds</span>
                <span className={`queue-eta ${(!t.speed || t.speed <= 0) ? 'stalled' : ''}`}>
                  ETA {formatEta(t.eta, t.speed)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
      </div>
      {/* Character frame: five individual cutouts positioned around the
          card. All decorative (aria-hidden, pointer-events: none). */}
      <img className="qchar qchar-kurapika" src="/assets/kurapika-cut.webp" alt="" aria-hidden="true" />
      <img className="qchar qchar-gon" src="/assets/gon-cut.webp" alt="" aria-hidden="true" />
      <img className="qchar qchar-killua" src="/assets/killua-cut.webp" alt="" aria-hidden="true" />
      <img className="qchar qchar-hisoka" src="/assets/hisoka-cut.webp" alt="" aria-hidden="true" />
      <img className="qchar qchar-leorio" src="/assets/leorio-cut.webp" alt="" aria-hidden="true" />

      <style>{`
        /* The queue is a plain dark self-contained card. Five character
           cutouts are absolutely positioned around it, each at its natural
           aspect (width-only sizing, height auto): Kurapika and Killua rise
           past the top corners, Gon perches on the top edge, Hisoka and
           Leorio ground the bottom corners. All pointer-events: none; the
           area margins reserve the spill so nothing clips. Hidden below
           768px — the card would be overwhelmed on a phone. */
        .queue-area {
          position: relative;
          margin: 196px 0 64px;
        }
        .queue-panel {
          position: relative;
          z-index: 1;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          /* full-width card; the horizontal padding pushes ALL inner
             content into the clear middle zone, leaving the card's outer
             edges as empty safe areas the flanking characters overlap
             (left clears Kurapika/Hisoka, right clears Leorio). */
          padding: 20px 250px 20px 180px;
          box-shadow: var(--shadow-1);
        }
        .qchar {
          position: absolute;
          height: auto;
          pointer-events: none;
          z-index: 2;
          filter: drop-shadow(0 6px 20px rgba(0, 0, 0, 0.55));
        }
        /* bottom: calc(100% - Npx) anchors a character N px of overlap onto
           the card's top edge, with the rest rising above it. */
        .qchar-kurapika { left: -14px; bottom: calc(100% - 48px); width: 150px; }
        .qchar-killua { right: -10px; bottom: calc(100% - 52px); width: 84px; }
        .qchar-gon { left: 50%; transform: translateX(-50%); bottom: calc(100% - 8px); width: 170px; }
        .qchar-hisoka { left: -18px; bottom: -34px; width: 160px; }
        .qchar-leorio { right: -20px; bottom: -28px; width: 230px; }
        .queue-header {
          display: flex; justify-content: space-between; align-items: center;
          margin-bottom: 16px;
        }
        .queue-actions { display: flex; align-items: center; gap: 12px; }
        .queue-storage {
          margin-bottom: 16px;
          padding: 12px 14px;
          background: var(--surface2);
          border: 1px solid var(--border);
          border-radius: 8px;
        }
        .refresh-btn {
          background: var(--surface2);
          border: 1px solid var(--border);
          color: var(--text);
          padding: 7px 16px; border-radius: 999px;
          font-size: 13px;
          display: flex; align-items: center; gap: 6px;
          transition: border-color var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
        }
        .refresh-btn:hover { border-color: var(--accent); color: var(--accent); }
        .queue-empty { color: var(--text-muted); font-size: 13px; text-align: center; padding: 6px 0; }
        .queue-list { display: flex; flex-direction: column; gap: 12px; }
        .queue-item {
          background: var(--surface2);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 12px;
        }
        .queue-item-top {
          display: flex; justify-content: space-between; align-items: flex-start;
          gap: 8px; margin-bottom: 8px;
        }
        .queue-name {
          font-size: 13px; font-weight: 500;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          flex: 1;
        }
        .queue-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
        .queue-state {
          font-size: 11px; padding: 2px 8px; border-radius: 20px;
          background: var(--surface); border: 1px solid var(--border);
        }
        .queue-state[data-state="downloading"] { color: var(--green); border-color: var(--green); }
        .queue-state[data-state="stalledDL"] { color: var(--gold); border-color: var(--gold); }
        .queue-delete {
          background: transparent; color: var(--text-muted);
          padding: 2px; border-radius: 4px;
          display: flex; align-items: center;
          transition: color 0.2s;
        }
        .queue-delete:hover { color: var(--red); }
        .queue-progress-bar {
          height: 4px; background: var(--border); border-radius: 2px;
          margin-bottom: 6px; overflow: hidden;
        }
        .queue-progress-fill {
          height: 100%;
          background: linear-gradient(90deg, rgb(var(--green-rgb) / 0.65), var(--green));
          box-shadow: 0 0 8px rgb(var(--green-rgb) / 0.3);
          border-radius: 2px; transition: width 0.5s var(--ease);
        }
        .queue-stats {
          display: flex; gap: 16px;
          font-size: 11px; color: var(--text-muted);
          flex-wrap: wrap;
        }
        .queue-eta { color: var(--accent); font-weight: 500; }
        .queue-eta.stalled { color: var(--text-muted); font-style: italic; }
        @media (max-width: 768px) {
          .queue-area { margin: 16px 0 32px; }
          .queue-panel { padding: 14px; }
          .qchar { display: none; }
          .queue-header { flex-wrap: wrap; gap: 10px; }
          .queue-actions { flex-wrap: wrap; }
        }
        @media (max-width: 480px) {
          .queue-item-top {
            flex-direction: column;
            align-items: flex-start;
          }
          .queue-name {
            width: 100%;
            font-size: 12px;
          }
          .queue-right { width: 100%; justify-content: space-between; }
          .queue-stats { gap: 10px; font-size: 10px; }
          .refresh-btn { font-size: 12px; }
        }
      `}</style>
    </section>
  )
}
