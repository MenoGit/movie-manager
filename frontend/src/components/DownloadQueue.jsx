import { useState, useEffect } from 'react'
import { Trash2, RefreshCw } from 'lucide-react'
import { getQueue, deleteTorrent, refreshPlex } from '../api'
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
  const [plexMsg, setPlexMsg] = useState('')
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

  async function handlePlexRefresh() {
    setPlexMsg('Refreshing...')
    try {
      await refreshPlex()
      setPlexMsg('Done!')
    } catch {
      setPlexMsg('Error')
    }
    setTimeout(() => setPlexMsg(''), 3000)
  }

  return (
    <div className="queue-panel">
      <div className="queue-header">
        <h3 className="section-title">Download Queue</h3>
        <div className="queue-actions">
          <button className="plex-btn" onClick={handlePlexRefresh}>
            <RefreshCw size={14} />
            {plexMsg || 'Refresh Plex'}
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
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`
        .queue-panel {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 20px;
          margin-bottom: 32px;
        }
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
        .plex-btn {
          background: var(--surface2);
          border: 1px solid var(--border);
          color: var(--text);
          padding: 6px 14px; border-radius: 6px;
          font-size: 13px;
          display: flex; align-items: center; gap: 6px;
          transition: border-color 0.2s;
        }
        .plex-btn:hover { border-color: var(--accent); color: var(--accent); }
        .queue-empty { color: var(--text-muted); font-size: 13px; text-align: center; padding: 12px 0; }
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
        .queue-state[data-state="stalledDL"] { color: var(--accent); border-color: var(--accent); }
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
          height: 100%; background: var(--accent);
          border-radius: 2px; transition: width 0.5s;
        }
        .queue-stats {
          display: flex; gap: 16px;
          font-size: 11px; color: var(--text-muted);
          flex-wrap: wrap;
        }
        @media (max-width: 768px) {
          .queue-panel { padding: 14px; }
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
          .plex-btn { font-size: 12px; }
        }
      `}</style>
    </div>
  )
}
