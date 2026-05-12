import { useState, useEffect } from 'react'
import { HardDrive } from 'lucide-react'
import { getDiskUsage } from '../api'

function formatBytes(bytes) {
  if (!bytes) return '0 GB'
  const tb = bytes / 1e12
  if (tb >= 1) return `${tb.toFixed(1)} TB`
  return `${(bytes / 1e9).toFixed(1)} GB`
}

function usageColor(percent) {
  if (percent >= 80) return 'var(--red)'
  if (percent >= 60) return 'var(--accent)'
  return 'var(--green)'
}

/**
 * Storage usage bar with per-folder breakdown.
 *  - Polls /downloads/disk-usage every `pollMs` ms (default 5s).
 *  - Segmented bar: movies (gold) + TV (blue) + other (gray) + free space (empty).
 *  - Percent label colored green/yellow/red based on usage threshold.
 *
 * Used in DownloadQueue (replaces the old "X GB free" text) and at the top
 * of the History overlay.
 */
export default function StorageBar({ pollMs = 5000, compact = false }) {
  const [data, setData] = useState(null)

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const r = await getDiskUsage()
        if (alive) setData(r.data)
      } catch {}
    }
    load()
    const interval = setInterval(load, pollMs)
    return () => { alive = false; clearInterval(interval) }
  }, [pollMs])

  if (!data) {
    return <div className="storage-bar-skeleton" />
  }
  if (data.error) {
    return (
      <div className="storage-bar-error">
        <HardDrive size={13} />
        <span>Disk info unavailable</span>
      </div>
    )
  }

  const { total, used, free, usage_percent, movies_bytes, tv_bytes, other_bytes } = data
  const moviesPct = total > 0 ? (movies_bytes / total) * 100 : 0
  const tvPct     = total > 0 ? (tv_bytes / total) * 100 : 0
  const otherPct  = total > 0 ? (other_bytes / total) * 100 : 0

  return (
    <div className={`storage-bar ${compact ? 'compact' : ''}`}>
      <div className="storage-bar-line">
        <HardDrive size={14} className="storage-icon" />
        <span className="storage-line-text">
          <strong>Used:</strong> {formatBytes(used)} / {formatBytes(total)}
          <span className="storage-pct" style={{ color: usageColor(usage_percent) }}>
            {' '}({usage_percent}%)
          </span>
        </span>
        <span className="storage-free">{formatBytes(free)} free</span>
      </div>
      <div className="storage-track" title={`Movies ${formatBytes(movies_bytes)} · TV ${formatBytes(tv_bytes)} · Other ${formatBytes(other_bytes)} · Free ${formatBytes(free)}`}>
        <div className="storage-seg seg-movies" style={{ width: `${moviesPct}%` }} />
        <div className="storage-seg seg-tv"     style={{ width: `${tvPct}%` }} />
        <div className="storage-seg seg-other"  style={{ width: `${otherPct}%` }} />
      </div>
      <div className="storage-legend">
        <span className="legend-item"><span className="dot dot-movies" />Movies {formatBytes(movies_bytes)}</span>
        <span className="legend-item"><span className="dot dot-tv" />TV {formatBytes(tv_bytes)}</span>
        {other_bytes > 1e9 && (
          <span className="legend-item"><span className="dot dot-other" />Other {formatBytes(other_bytes)}</span>
        )}
        <span className="legend-item"><span className="dot dot-free" />Free {formatBytes(free)}</span>
      </div>

      <style>{`
        .storage-bar {
          display: flex; flex-direction: column;
          gap: 6px;
        }
        .storage-bar-skeleton {
          height: 56px;
          background: var(--surface2);
          border-radius: 6px;
          opacity: 0.4;
        }
        .storage-bar-error {
          display: flex; align-items: center; gap: 6px;
          font-size: 12px; color: var(--text-muted);
          padding: 4px 0;
        }
        .storage-bar-line {
          display: flex; align-items: center; gap: 6px;
          font-size: 13px; color: var(--text);
          flex-wrap: wrap;
        }
        .storage-icon { color: var(--text-muted); flex-shrink: 0; }
        .storage-line-text strong { font-weight: 600; }
        .storage-pct { font-weight: 600; }
        .storage-free {
          margin-left: auto;
          font-size: 12px; color: var(--text-muted);
        }
        .storage-track {
          display: flex;
          width: 100%;
          height: 10px;
          background: var(--surface2);
          border: 1px solid var(--border);
          border-radius: 5px;
          overflow: hidden;
        }
        .storage-seg {
          height: 100%;
          transition: width 0.6s ease;
        }
        .seg-movies { background: var(--accent); }
        .seg-tv     { background: #3b82f6; }
        .seg-other  { background: #6b7280; }
        .storage-legend {
          display: flex; gap: 14px; flex-wrap: wrap;
          font-size: 11px; color: var(--text-muted);
        }
        .legend-item { display: inline-flex; align-items: center; gap: 5px; }
        .dot {
          display: inline-block;
          width: 8px; height: 8px;
          border-radius: 2px;
        }
        .dot-movies { background: var(--accent); }
        .dot-tv     { background: #3b82f6; }
        .dot-other  { background: #6b7280; }
        .dot-free   { background: var(--surface2); border: 1px solid var(--border); }

        .storage-bar.compact .storage-legend { display: none; }
        .storage-bar.compact .storage-track { height: 8px; }

        @media (max-width: 480px) {
          .storage-bar-line { font-size: 12px; }
          .storage-free { margin-left: 0; flex: 1 1 100%; }
          .storage-legend { gap: 10px; font-size: 10px; }
        }
      `}</style>
    </div>
  )
}
