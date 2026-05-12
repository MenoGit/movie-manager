import { useState, useEffect } from 'react'
import { Bell, Check } from 'lucide-react'
import { addToAutoWatchlist, getAutoWatchlist, removeFromAutoWatchlist } from '../api'
import { readPrefs } from '../utils'

/**
 * Compact button that toggles an item on/off the auto-download watchlist.
 * Shows a tier selector inline so users can pick Quality/Value/Budget per
 * item without going through Settings.
 *
 * Props:
 *   id      — TMDb id
 *   type    — 'movie' | 'tv' | 'anime'
 *   title   — display title
 *   release_date — optional, helps the smart scheduler skip theatrical items
 *   label   — button label override (e.g. "Auto-download new episodes")
 */
export default function AutoDownloadButton({ id, type, title, release_date, label }) {
  const [onList, setOnList] = useState(null) // null = unknown, then the entry or false
  const [tier, setTier] = useState(() => readPrefs().preferredTier === 'any' ? 'value' : readPrefs().preferredTier)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    let alive = true
    getAutoWatchlist().then(r => {
      if (!alive) return
      const entry = (r.data || []).find(it => it.id === id && it.type === type)
      setOnList(entry || false)
      if (entry?.quality_preset) setTier(entry.quality_preset)
    }).catch(() => alive && setOnList(false))
    return () => { alive = false }
  }, [id, type])

  async function handleAdd() {
    setPending(true)
    try {
      const r = await addToAutoWatchlist({
        id, type, title, release_date, quality_preset: tier,
      })
      setOnList(r.data || true)
    } catch (e) {
      alert(`Couldn't add to watchlist: ${e.response?.data?.detail || e.message}`)
    }
    setPending(false)
  }

  async function handleRemove() {
    setPending(true)
    try {
      await removeFromAutoWatchlist(type, id)
      setOnList(false)
    } catch {}
    setPending(false)
  }

  if (onList === null) return null  // hide flicker until we know

  const isOn = !!onList
  const defaultLabel = type === 'movie'
    ? 'Auto-download when available'
    : 'Auto-download new episodes'

  return (
    <div className={`auto-dl-wrap ${isOn ? 'on' : ''}`}>
      <button
        className="auto-dl-btn"
        onClick={isOn ? handleRemove : handleAdd}
        disabled={pending}
        title={isOn ? 'Remove from auto-download watchlist' : 'Add to auto-download watchlist'}
      >
        {isOn ? <Check size={14} /> : <Bell size={14} />}
        {isOn ? 'On watchlist' : (label || defaultLabel)}
      </button>
      {!isOn && (
        <div className="auto-dl-presets" role="group" aria-label="Quality tier">
          {['quality', 'value', 'budget'].map(t => (
            <button
              key={t}
              className={`auto-dl-preset ${tier === t ? 'active' : ''}`}
              onClick={() => setTier(t)}
              type="button"
            >{t[0].toUpperCase() + t.slice(1)}</button>
          ))}
        </div>
      )}
      <style>{`
        .auto-dl-wrap {
          display: inline-flex; align-items: center; gap: 6px;
          flex-wrap: wrap;
        }
        .auto-dl-btn {
          display: inline-flex; align-items: center; gap: 6px;
          background: transparent; border: 1px solid var(--border);
          color: var(--text);
          padding: 6px 14px; border-radius: 6px;
          font-size: 13px;
          transition: all 0.15s;
        }
        .auto-dl-btn:hover { border-color: var(--accent); color: var(--accent); }
        .auto-dl-wrap.on .auto-dl-btn {
          background: rgba(62,207,142,0.12);
          border-color: var(--green);
          color: var(--green);
        }
        .auto-dl-wrap.on .auto-dl-btn:hover { background: rgba(62,207,142,0.2); }
        .auto-dl-presets { display: inline-flex; }
        .auto-dl-preset {
          background: transparent; border: 1px solid var(--border);
          color: var(--text-muted);
          padding: 5px 9px; font-size: 11px;
          transition: all 0.15s;
        }
        .auto-dl-preset:first-child { border-radius: 6px 0 0 6px; }
        .auto-dl-preset:last-child { border-radius: 0 6px 6px 0; }
        .auto-dl-preset:not(:last-child) { border-right: 0; }
        .auto-dl-preset:hover { color: var(--accent); }
        .auto-dl-preset.active {
          background: var(--accent); border-color: var(--accent);
          color: #000; font-weight: 600;
        }
      `}</style>
    </div>
  )
}
