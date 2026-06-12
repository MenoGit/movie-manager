import { Fragment } from 'react'
import { Download, Star } from 'lucide-react'
import { hasSpanishAudio, matchesPrefs } from '../utils'
import { qualityTag, scoreBreakdown, tierContextLabel, TIER_META } from '../torrentScoring'
import { formatSize, tagClass, ratioInfo, SORTS } from '../torrentDisplay'

// Shared torrent results UI for MovieModal and TVShowModal. Styling still
// lives in each modal's <style> block (both define the same class names);
// merging those into one stylesheet is the next refactor piece.

// Sort buttons + Spanish toggle + ratio legend. `children` lets a modal
// append its own buttons to the sort group (MovieModal's showAll toggle).
export function TorrentControls({ sortKey, setSortKey, spanishOnly, setSpanishOnly, children }) {
  return (
    <div className="torrent-controls">
      <div className="sort-group">
        <span className="sort-label">Sort:</span>
        {SORTS.map(s => (
          <button
            key={s.id}
            className={`sort-btn ${sortKey === s.id ? 'active' : ''}`}
            onClick={() => setSortKey(s.id)}
          >
            {s.label}
          </button>
        ))}
        <button
          className={`sort-btn spanish-btn ${spanishOnly ? 'active' : ''}`}
          onClick={() => setSpanishOnly(v => !v)}
          title="Show only torrents with Spanish audio indicators in the title"
        >
          Spanish
        </button>
        {children}
      </div>
      <div className="ratio-legend" title="Seeder-to-peer ratio — higher means faster download">
        <span className="legend-item"><span className="dot dot-fast" />fast</span>
        <span className="legend-item"><span className="dot dot-decent" />decent</span>
        <span className="legend-item"><span className="dot dot-slow" />slow</span>
      </div>
    </div>
  )
}

export function TorrentRow({
  torrent: t, scoringContext, pickTitleMap, prefs, prefsOn,
  selectedTitle, downloadingTitle, onSelect, onDownload, extraTags,
}) {
  const { ratio, bucket, seeds, peers } = ratioInfo(t)
  const ratioLabel = ratio === Infinity ? '∞' : ratio.toFixed(1)
  const qtag = qualityTag(t.title)
  const pickTier = pickTitleMap.get(t.title) || null
  const tierMeta = pickTier ? TIER_META[pickTier] : null
  const prefsMatch = prefsOn && matchesPrefs(t._score, prefs)
  const isDownloading = downloadingTitle === t.title
  return (
    <div
      className={`torrent-row ${pickTier ? `best-pick best-pick-${pickTier}` : ''} ${prefsMatch ? 'prefs-match' : ''} ${selectedTitle === t.title ? 'row-selected' : ''}`}
      onClick={() => onSelect(t)}
      role="button"
      tabIndex={0}
    >
      <span className="torrent-name">
        {tierMeta && (
          <span
            className={`best-pick-badge tier-${pickTier}`}
            title={`${tierMeta.label} (score ${t._score.score}) — ${scoreBreakdown(t._score)}\n(${tierContextLabel(scoringContext, t)})`}
          >
            {pickTier === 'budget'
              ? <span style={{fontSize: 11}}>💰</span>
              : <Star size={10} fill="currentColor" />}
            {' '}{tierMeta.label}
          </span>
        )}
        {extraTags && extraTags(t)}
        <span className={`quality-tag quality-${tagClass(qtag)}`}>{qtag}</span>
        {prefsMatch && (
          <span className="preset-match-tag" title="Matches your saved quality preset">
            ✓ Preset
          </span>
        )}
        {hasSpanishAudio(t.title) && (
          <span className="spanish-audio-tag" title="Likely includes Spanish audio">ES</span>
        )}
        <span className="torrent-name-text" title={t.title}>{t.title}</span>
        <span className="torrent-name-tooltip">{t.title}</span>
      </span>
      <span className="torrent-size">{formatSize(t.size)}</span>
      <span className="torrent-seeds" style={{color: t.seeders > 10 ? 'var(--green)' : t.seeders > 0 ? 'var(--accent)' : 'var(--red)'}}>
        {t.seeders}
      </span>
      <span className="torrent-peers">{t.leechers ?? 0}</span>
      <span className={`ratio-pill ratio-${bucket}`} title={`${seeds} seeders / ${peers} peers (ratio ${ratioLabel}) — ${bucket}`}>
        <span className="ratio-line">{seeds}s</span>
        <span className="ratio-line">{peers}p</span>
      </span>
      <span className="torrent-indexer">{t.indexer}</span>
      <button
        className="download-btn"
        onClick={(e) => { e.stopPropagation(); onDownload(t) }}
        disabled={isDownloading}
      >
        {isDownloading ? '...' : <><Download size={14} /> Get</>}
      </button>
    </div>
  )
}

// Header + rows. `sections` is an ordered list of { label?, items }; a
// section with a label gets a divider row above it (TVShowModal's
// "Individual Episodes" split). All other props are forwarded to each row.
export function TorrentList({ sections, ...rowProps }) {
  return (
    <div className="torrent-list">
      <div className="torrent-header">
        <span>Title</span>
        <span>Size</span>
        <span>Seeds</span>
        <span>Peers</span>
        <span title="Seeder/Peer ratio">S/P</span>
        <span>Source</span>
        <span></span>
      </div>
      {sections.map((sec, si) => (
        <Fragment key={si}>
          {sec.label && <div className="torrent-divider">{sec.label}</div>}
          {sec.items.map((t, i) => (
            <TorrentRow key={`${si}-${i}-${t.title}`} torrent={t} {...rowProps} />
          ))}
        </Fragment>
      ))}
    </div>
  )
}
