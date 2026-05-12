import { useState, useEffect } from 'react'
import { X, RotateCcw } from 'lucide-react'
import { DEFAULT_PREFS, readPrefs, writePrefs, prefsActive } from '../utils'

const OPTIONS = {
  resolution:    [['any', 'Any'], ['4K', '4K'], ['1080p', '1080p'], ['720p', '720p']],
  codec:         [['any', 'Any'], ['AV1', 'AV1'], ['x265', 'x265 / HEVC'], ['x264', 'x264']],
  audio:         [['any', 'Any'], ['Atmos', 'Atmos'], ['DTS-HD/TrueHD', 'DTS-HD / TrueHD'], ['DDP5.1', 'DDP 5.1'], ['AAC5.1', 'AAC 5.1']],
  hdr:           [['any', 'Any'], ['DV', 'Dolby Vision'], ['HDR10+', 'HDR10+'], ['HDR10', 'HDR10'], ['SDR', 'SDR']],
  preferredTier: [['any', 'Any'], ['quality', 'Best Quality'], ['value', 'Best Value'], ['budget', 'Budget']],
}

const FIELD_LABELS = {
  resolution: 'Resolution',
  codec: 'Codec',
  audio: 'Audio',
  hdr: 'HDR',
  maxSizeGB: 'Max Size (GB)',
  preferredTier: 'Preferred Tier',
}

export default function SettingsOverlay({ onClose }) {
  const [prefs, setPrefs] = useState(() => readPrefs())

  useEffect(() => {
    document.body.classList.add('modal-open')
    const esc = (e) => e.key === 'Escape' && handleClose()
    window.addEventListener('keydown', esc)
    return () => {
      document.body.classList.remove('modal-open')
      window.removeEventListener('keydown', esc)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleClose() {
    writePrefs(prefs)
    onClose()
  }

  function reset() {
    setPrefs({ ...DEFAULT_PREFS })
  }

  function setField(field, value) {
    setPrefs(p => ({ ...p, [field]: value }))
  }

  return (
    <div className="settings-overlay" onClick={(e) => e.target === e.currentTarget && handleClose()}>
      <div className="settings-panel">
        <div className="settings-header">
          <h2>Quality Preferences</h2>
          <button className="settings-close" onClick={handleClose} aria-label="Close"><X size={20}/></button>
        </div>

        <div className="settings-body">
          <p className="settings-intro">
            Torrents matching all of these preferences will be highlighted in the
            torrent list. Leave anything as <em>Any</em> to ignore it. Changes
            save automatically when you close this dialog.
          </p>

          {Object.entries(OPTIONS).map(([field, options]) => (
            <div key={field} className="settings-row">
              <label className="settings-label">{FIELD_LABELS[field]}</label>
              <div className="settings-options">
                {options.map(([value, label]) => (
                  <button
                    key={value}
                    className={`settings-opt ${prefs[field] === value ? 'active' : ''}`}
                    onClick={() => setField(field, value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ))}

          <div className="settings-row">
            <label className="settings-label">{FIELD_LABELS.maxSizeGB}</label>
            <div className="settings-size-input">
              <input
                type="number"
                min="0" step="0.5"
                value={prefs.maxSizeGB}
                onChange={e => setField('maxSizeGB', Number(e.target.value) || 0)}
                placeholder="0 (no limit)"
              />
              <span>GB</span>
            </div>
          </div>

          <div className="settings-footer">
            <span className="settings-active">
              {prefsActive(prefs) ? 'Preferences active' : 'No preferences set'}
            </span>
            <button className="settings-reset" onClick={reset}>
              <RotateCcw size={13} /> Reset all
            </button>
          </div>
        </div>
      </div>

      <style>{`
        .settings-overlay {
          position: fixed; inset: 0;
          background: rgba(0,0,0,0.85);
          display: flex; align-items: center; justify-content: center;
          z-index: 100; padding: 20px;
        }
        .settings-panel {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 14px;
          width: 100%; max-width: 640px;
          max-height: 90vh;
          display: flex; flex-direction: column;
        }
        .settings-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 18px 22px;
          border-bottom: 1px solid var(--border);
        }
        .settings-header h2 { font-size: 1.5rem; }
        .settings-close {
          background: rgba(0,0,0,0.4); color: var(--text);
          border-radius: 50%; width: 36px; height: 36px;
          display: flex; align-items: center; justify-content: center;
        }
        .settings-close:hover { background: var(--accent); color: #000; }
        .settings-body { overflow-y: auto; padding: 18px 22px 22px; }
        .settings-intro {
          font-size: 13px; color: var(--text-muted);
          line-height: 1.55;
          margin-bottom: 18px;
        }
        .settings-row { margin-bottom: 14px; }
        .settings-label {
          display: block; font-size: 11px;
          text-transform: uppercase; letter-spacing: 0.06em;
          color: var(--text-muted); margin-bottom: 6px;
        }
        .settings-options { display: flex; flex-wrap: wrap; gap: 6px; }
        .settings-opt {
          background: transparent;
          border: 1px solid var(--border);
          color: var(--text-muted);
          padding: 5px 12px; border-radius: 6px;
          font-size: 12px;
        }
        .settings-opt:hover { border-color: var(--accent); color: var(--accent); }
        .settings-opt.active {
          background: var(--accent); border-color: var(--accent);
          color: #000; font-weight: 600;
        }
        .settings-size-input { display: flex; align-items: center; gap: 8px; }
        .settings-size-input input {
          width: 120px;
          background: var(--surface2); border: 1px solid var(--border);
          color: var(--text);
          padding: 6px 10px; border-radius: 6px;
          font-size: 13px;
        }
        .settings-size-input input:focus { border-color: var(--accent); outline: none; }
        .settings-size-input span { font-size: 12px; color: var(--text-muted); }
        .settings-footer {
          display: flex; justify-content: space-between; align-items: center;
          margin-top: 18px; padding-top: 14px;
          border-top: 1px solid var(--border);
        }
        .settings-active { font-size: 12px; color: var(--text-muted); }
        .settings-reset {
          display: inline-flex; align-items: center; gap: 6px;
          background: transparent; border: 1px solid var(--border);
          color: var(--text-muted);
          padding: 5px 12px; border-radius: 6px; font-size: 12px;
        }
        .settings-reset:hover { border-color: var(--red); color: var(--red); }
        @media (max-width: 480px) {
          .settings-overlay { padding: 0; }
          .settings-panel { border-radius: 0; max-width: 100%; max-height: 100vh; height: 100vh; }
        }
      `}</style>
    </div>
  )
}
