import { useState, useEffect, useMemo } from 'react'
import { X, Download, Search, ExternalLink, Check, AlertTriangle, Maximize2, Minimize2, Star } from 'lucide-react'
import { getMovieDetail, searchTorrents, addTorrent, refreshPlex } from '../api'
import { hasSpanishAudio } from '../utils'

function formatSize(bytes) {
  if (!bytes) return '?'
  const gb = bytes / 1024 / 1024 / 1024
  return gb >= 1 ? `${gb.toFixed(2)} GB` : `${(bytes / 1024 / 1024).toFixed(0)} MB`
}

function parseRelease(title) {
  const s = (title || '').toUpperCase()
  const resolution =
    /2160P|\b4K\b|\bUHD\b/.test(s) ? '4K' :
    /1080P/.test(s) ? '1080p' :
    /720P/.test(s) ? '720p' : 'other'
  const source =
    /\bHDCAM\b|\bCAM(?:RIP)?\b/.test(s) ? 'CAM' :
    /\b(?:TELESYNC|HDTS)\b|\bTS\b/.test(s) ? 'TS' :
    /BLU.?RAY|\bBDRIP\b|\bBRRIP\b|\bBDR\b/.test(s) ? 'BluRay' :
    /\bWEB[-.]?DL\b|\bWEBDL\b/.test(s) ? 'WEB-DL' :
    /\bWEB.?RIP\b/.test(s) ? 'WEBRip' : 'Unknown'
  const audio =
    /\bATMOS\b/.test(s) ? 'Atmos' :
    /DDP5\.?1|DTS(?:[-.]?HD|[-.]?MA|[-.]?X)?/.test(s) ? 'DDP5.1/DTS' :
    /AAC5\.?1|AAC\.?5\.?1|AAC ?5\.1/.test(s) ? 'AAC5.1' :
    'Stereo'
  const hdr =
    /DOLBY[\s.-]?VISION|\bDV\b|\bDOVI\b/.test(s) ? 'DV' :
    /HDR10\+|HDR10PLUS/.test(s) ? 'HDR10+' :
    /\bHDR\b|HDR10/.test(s) ? 'HDR10' :
    'SDR'
  const codec =
    /\bAV1\b/.test(s) ? 'AV1' :
    /X265|HEVC|H[\s.]?265/.test(s) ? 'x265' :
    /X264|H[\s.]?264/.test(s) ? 'x264' :
    'unknown'
  return { resolution, source, audio, hdr, codec }
}

const SCORE_TABLE = {
  resolution: { '4K': 10, '1080p': 8, '720p': 5, 'other': 2 },
  source:     { 'BluRay': 10, 'WEB-DL': 9, 'WEBRip': 7, 'Unknown': 4, 'TS': 0, 'CAM': 0 },
  audio:      { 'Atmos': 10, 'DDP5.1/DTS': 8, 'AAC5.1': 6, 'Stereo': 3 },
  hdr:        { 'DV': 10, 'HDR10+': 9, 'HDR10': 8, 'SDR': 3 },
  codec:      { 'AV1': 9, 'x265': 8, 'x264': 5, 'unknown': 3 },
}

function scoreTorrent(t) {
  const p = parseRelease(t.title)
  let score =
    (SCORE_TABLE.resolution[p.resolution] ?? 0) +
    (SCORE_TABLE.source[p.source] ?? 0) +
    (SCORE_TABLE.audio[p.audio] ?? 0) +
    (SCORE_TABLE.hdr[p.hdr] ?? 0) +
    (SCORE_TABLE.codec[p.codec] ?? 0)

  const gb = (t.size || 0) / (1024 ** 3)
  let sizeNote = null
  if (gb > 0) {
    if (p.resolution === '4K') {
      if (gb > 60) { score -= 5; sizeNote = 'bloated' }
      else if (gb < 3) { score -= 8; sizeNote = 'too small' }
      else sizeNote = 'good size'
    } else if (p.resolution === '1080p') {
      if (gb > 30) { score -= 5; sizeNote = 'bloated' }
      else if (gb < 1) { score -= 8; sizeNote = 'too small' }
      else sizeNote = 'good size'
    } else {
      sizeNote = 'good size'
    }
  }

  const seeds = t.seeders || 0
  if (seeds > 0) {
    // log scale capped at ~8 (≈ 100 seeds); growth diminishes past that.
    score += Math.min(Math.log10(seeds + 1) * 4, 8)
  }
  const peers = t.leechers || 0
  const ratio = peers === 0 ? (seeds > 0 ? Infinity : 0) : seeds / peers
  if (ratio > 2) score += 2

  return { score: Math.round(score * 10) / 10, parsed: p, sizeNote }
}

function qualityTag(title) {
  const p = parseRelease(title)
  if (p.source === 'CAM' || p.source === 'TS') return p.source
  if (p.resolution === '4K') return '4K'
  return p.source
}

const TAG_RANK = { '4K': 5, 'BluRay': 4, 'WEB-DL': 3, 'WEBRip': 2, 'Unknown': 1, 'TS': 0, 'CAM': 0 }
function qualityRank(title) { return TAG_RANK[qualityTag(title)] ?? 1 }

function tagClass(tag) {
  return tag.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function scoreBreakdown(score) {
  const { parsed, sizeNote } = score
  const parts = [parsed.resolution, parsed.source, parsed.audio, parsed.hdr, parsed.codec]
  if (sizeNote) parts.push(sizeNote)
  return parts.join(' · ')
}

function ratioInfo(t) {
  const s = t.seeders || 0
  const p = t.leechers || 0
  const r = p === 0 ? (s > 0 ? Infinity : 0) : s / p
  let bucket
  if (s >= 20 && r >= 3) bucket = 'fast'
  else if (s >= 5 || r >= 2) bucket = 'decent'
  else bucket = 'slow'
  return { ratio: r, bucket, seeds: s, peers: p }
}

const SORTS = [
  { id: 'smart', label: 'Smart' },
  { id: 'seeds', label: 'Seeders' },
  { id: 'size-desc', label: 'Size ↓' },
  { id: 'size-asc', label: 'Size ↑' },
  { id: 'quality', label: 'Quality' },
]

export default function MovieModal({ movie, onClose }) {
  const [detail, setDetail] = useState(null)
  const [torrents, setTorrents] = useState([])
  const [searchQuery, setSearchQuery] = useState(movie.title)
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(null)
  const [done, setDone] = useState(false)
  const [filterText, setFilterText] = useState('')
  const [sortKey, setSortKey] = useState('smart')
  const [expanded, setExpanded] = useState(false)
  const [spanishOnly, setSpanishOnly] = useState(false)

  const showLowQualityWarning = useMemo(() => {
    if (torrents.length === 0) return false
    const topBySeeds = [...torrents]
      .sort((a, b) => (b.seeders || 0) - (a.seeders || 0))
      .slice(0, 5)
    const badCount = topBySeeds.filter(t => {
      const q = qualityTag(t.title)
      return q === 'CAM' || q === 'TS'
    }).length
    return badCount >= 2
  }, [torrents])

  const scored = useMemo(
    () => torrents.map(t => ({ ...t, _score: scoreTorrent(t) })),
    [torrents]
  )

  const bestPicks = useMemo(() => {
    if (scored.length === 0) return { qualityTitle: null, valueTitle: null }
    const SIZE_SPLIT = 12 * 1024 ** 3
    const big = scored.filter(t => (t.size || 0) >= SIZE_SPLIT)
    const small = scored.filter(t => (t.size || 0) > 0 && (t.size || 0) < SIZE_SPLIT)
    const topOf = arr => arr.length === 0
      ? null
      : arr.reduce((a, b) => a._score.score >= b._score.score ? a : b).title
    return { qualityTitle: topOf(big), valueTitle: topOf(small) }
  }, [scored])

  const visibleTorrents = useMemo(() => {
    let arr = scored
    if (filterText.trim()) {
      const q = filterText.toLowerCase()
      arr = arr.filter(t => (t.title || '').toLowerCase().includes(q))
    }
    if (spanishOnly) {
      arr = arr.filter(t => hasSpanishAudio(t.title))
    }
    const sorter = (a, b) => {
      switch (sortKey) {
        case 'smart': return b._score.score - a._score.score
        case 'seeds': return (b.seeders || 0) - (a.seeders || 0)
        case 'size-asc': return (a.size || 0) - (b.size || 0)
        case 'size-desc': return (b.size || 0) - (a.size || 0)
        case 'quality': return qualityRank(b.title) - qualityRank(a.title)
        default: return 0
      }
    }
    const sorted = [...arr].sort(sorter)
    const isPick = t => t.title === bestPicks.qualityTitle || t.title === bestPicks.valueTitle
    // Pin order: Quality first, then Value. Rest follows the active sort.
    const qualityRow = sorted.find(t => t.title === bestPicks.qualityTitle)
    const valueRow = sorted.find(t => t.title === bestPicks.valueTitle)
    const pinned = [qualityRow, valueRow].filter(Boolean)
    const rest = sorted.filter(t => !isPick(t))
    return [...pinned, ...rest]
  }, [scored, filterText, sortKey, bestPicks, spanishOnly])

  useEffect(() => {
    getMovieDetail(movie.id).then(r => setDetail(r.data))
    handleSearch()
  }, [])

  useEffect(() => {
    document.body.classList.add('modal-open')
    return () => document.body.classList.remove('modal-open')
  }, [])

  useEffect(() => {
    const handler = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  async function handleSearch() {
    setLoading(true)
    try {
      const r = await searchTorrents(searchQuery)
      setTorrents(r.data)
    } catch (e) {
      setTorrents([])
    }
    setLoading(false)
  }

  async function handleDownload(torrent) {
    if (!torrent.magnet) return alert('No magnet link available for this torrent.')
    setDownloading(torrent.title)
    try {
      await addTorrent(torrent.magnet, movie.title)
      setDone(true)
      setTimeout(() => setDone(false), 4000)
    } catch (e) {
      const detail = e.response?.data?.detail
      alert(detail ? `Failed to add torrent: ${detail}` : 'Failed to add torrent. Check qBittorrent connection.')
    }
    setDownloading(null)
  }

  const year = movie.release_date?.split('-')[0]
  const trailer = detail?.trailer

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${expanded ? 'modal-expanded' : ''}`}>
        <button
          className="modal-expand"
          onClick={() => setExpanded(v => !v)}
          title={expanded ? 'Compact view' : 'Expand modal'}
        >
          {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
        <button className="modal-close" onClick={onClose}><X size={20} /></button>

        {/* Hero */}
        <div className="modal-hero" style={{
          backgroundImage: detail?.backdrop_path
            ? `url(https://image.tmdb.org/t/p/w1280${detail.backdrop_path})`
            : undefined
        }}>
          <div className="modal-hero-overlay" />
          <div className="modal-hero-content">
            {movie.poster_url && (
              <img className="modal-poster" src={movie.poster_url} alt={movie.title} />
            )}
            <div className="modal-meta">
              <h2 className="modal-title">{movie.title}</h2>
              <div className="modal-tags">
                {year && <span className="tag">{year}</span>}
                {detail?.runtime && <span className="tag">{detail.runtime}min</span>}
                <span className="tag">★ {movie.vote_average?.toFixed(1)}</span>
                {movie.in_library && <span className="tag tag-green"><Check size={12}/> In Library</span>}
              </div>
              {detail?.genres && (
                <div className="modal-genres">
                  {detail.genres.map(g => <span key={g.id} className="genre-chip">{g.name}</span>)}
                </div>
              )}
              {detail?.streaming_services?.length > 0 && (
                <div className="streaming-row">
                  <span className="streaming-label">Streaming on</span>
                  {detail.streaming_services.map(s => (
                    <span key={s.provider_id} className="streaming-chip">
                      {s.provider_name}
                    </span>
                  ))}
                </div>
              )}
              <p className="modal-overview">{detail?.overview || movie.overview}</p>
              {trailer && (
                <a
                  href={`https://youtube.com/watch?v=${trailer.key}`}
                  target="_blank"
                  rel="noreferrer"
                  className="trailer-btn"
                >
                  <ExternalLink size={14} /> Watch Trailer
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Torrent Search */}
        <div className="modal-body">
          <h3 className="section-title">Download</h3>

          <div className="search-row">
            <input
              className="torrent-search"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Search torrents..."
            />
            <button className="search-btn" onClick={handleSearch}>
              <Search size={16} />
            </button>
            <input
              className="torrent-filter"
              value={filterText}
              onChange={e => setFilterText(e.target.value)}
              placeholder="Filter results (e.g. 1080p, YTS)"
            />
          </div>

          {done && (
            <div className="success-banner">
              <Check size={16} /> Added to qBittorrent — Plex will update when download finishes
            </div>
          )}

          {detail?.theatrical_only && (
            <div className="theatrical-warning">
              <AlertTriangle size={16} className="theatrical-warning-icon" />
              <span>
                This movie may still be in theaters only — quality digital rips typically
                aren't available until 45–90 days after theatrical release. Available
                torrents are likely CAM or TS quality.
              </span>
            </div>
          )}

          {showLowQualityWarning && (
            <div className="quality-warning">
              <AlertTriangle size={16} className="quality-warning-icon" />
              <span>
                This movie may not have a high quality release yet — top results appear to be
                camera or early recordings. A WEB-DL or BluRay rip may not be available until
                it hits streaming services.
              </span>
            </div>
          )}

          {loading ? (
            <div className="torrent-loading">Searching indexers...</div>
          ) : torrents.length === 0 ? (
            <div className="torrent-empty">No results found. Try editing the search above.</div>
          ) : (
            <>
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
                </div>
                <div className="ratio-legend" title="Seeder-to-peer ratio — higher means faster download">
                  <span className="legend-item"><span className="dot dot-fast" />fast</span>
                  <span className="legend-item"><span className="dot dot-decent" />decent</span>
                  <span className="legend-item"><span className="dot dot-slow" />slow</span>
                </div>
              </div>

              {filterText && (
                <div className="filter-meta">
                  Showing {visibleTorrents.length} of {torrents.length} matching "{filterText}"
                </div>
              )}

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
                {visibleTorrents.map((t, i) => {
                  const { ratio, bucket, seeds, peers } = ratioInfo(t)
                  const ratioLabel = ratio === Infinity ? '∞' : ratio.toFixed(1)
                  const qtag = qualityTag(t.title)
                  const pickLabel =
                    t.title === bestPicks.qualityTitle ? 'Best Quality' :
                    t.title === bestPicks.valueTitle ? 'Best Value' :
                    null
                  return (
                    <div key={i} className={`torrent-row ${pickLabel ? 'best-pick' : ''}`}>
                      <span className="torrent-name">
                        {pickLabel && (
                          <span
                            className="best-pick-badge"
                            title={`${pickLabel} (score ${t._score.score}) — ${scoreBreakdown(t._score)}`}
                          >
                            <Star size={10} fill="currentColor" /> {pickLabel}
                          </span>
                        )}
                        <span className={`quality-tag quality-${tagClass(qtag)}`}>{qtag}</span>
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
                        onClick={() => handleDownload(t)}
                        disabled={downloading === t.title}
                      >
                        {downloading === t.title
                          ? '...'
                          : <><Download size={14} /> Get</>
                        }
                      </button>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>

      <style>{`
        .modal-backdrop {
          position: fixed; inset: 0;
          background: rgba(0,0,0,0.85);
          display: flex; align-items: center; justify-content: center;
          z-index: 100; padding: 20px;
        }
        .modal {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 14px;
          width: 100%; max-width: 860px;
          max-height: 90vh;
          overflow-y: auto;
          position: relative;
          transition: max-width 0.25s ease;
        }
        .modal-expanded { max-width: 1320px; }
        .modal-expand {
          position: absolute; top: 14px; right: 60px;
          background: rgba(0,0,0,0.6);
          color: var(--text);
          border-radius: 50%;
          width: 36px; height: 36px;
          display: flex; align-items: center; justify-content: center;
          z-index: 10;
          transition: background 0.2s;
        }
        .modal-expand:hover { background: var(--accent); color: #000; }
        .modal-close {
          position: absolute; top: 14px; right: 14px;
          background: rgba(0,0,0,0.6);
          color: var(--text);
          border-radius: 50%;
          width: 36px; height: 36px;
          display: flex; align-items: center; justify-content: center;
          z-index: 10;
          transition: background 0.2s;
        }
        .modal-close:hover { background: var(--accent); color: #000; }
        .modal-hero {
          position: relative;
          background: var(--surface2) center/cover no-repeat;
          border-radius: 14px 14px 0 0;
          overflow: hidden;
        }
        .modal-hero-overlay {
          position: absolute; inset: 0;
          background: linear-gradient(to right, rgba(10,10,15,0.95) 40%, rgba(10,10,15,0.5));
        }
        .modal-hero-content {
          position: relative;
          display: flex; gap: 24px;
          padding: 32px;
        }
        .modal-poster {
          width: 130px; min-width: 130px;
          aspect-ratio: 2/3;
          object-fit: cover;
          border-radius: 8px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.5);
        }
        .modal-meta { flex: 1; }
        .modal-title {
          font-size: 2rem;
          line-height: 1.1;
          margin-bottom: 10px;
        }
        .modal-tags {
          display: flex; gap: 8px; flex-wrap: wrap;
          margin-bottom: 10px;
        }
        .tag {
          background: var(--surface2);
          border: 1px solid var(--border);
          padding: 2px 10px;
          border-radius: 20px;
          font-size: 12px;
          display: flex; align-items: center; gap: 4px;
        }
        .tag-green { background: rgba(62,207,142,0.15); border-color: var(--green); color: var(--green); }
        .modal-genres {
          display: flex; gap: 6px; flex-wrap: wrap;
          margin-bottom: 10px;
        }
        .genre-chip {
          background: rgba(232,160,48,0.1);
          border: 1px solid rgba(232,160,48,0.3);
          color: var(--accent);
          padding: 2px 10px; border-radius: 20px;
          font-size: 11px;
        }
        .streaming-row {
          display: flex; align-items: center; gap: 8px;
          margin-bottom: 12px; flex-wrap: wrap;
        }
        .streaming-label { font-size: 12px; color: var(--text-muted); }
        .streaming-chip {
          background: var(--surface2);
          border: 1px solid var(--border);
          padding: 2px 10px; border-radius: 20px;
          font-size: 12px;
        }
        .modal-overview {
          font-size: 13px; line-height: 1.6;
          color: rgba(240,238,234,0.75);
          margin-bottom: 14px;
          display: -webkit-box;
          -webkit-line-clamp: 4;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .trailer-btn {
          display: inline-flex; align-items: center; gap: 6px;
          background: transparent;
          border: 1px solid var(--border);
          color: var(--text);
          padding: 6px 14px; border-radius: 6px;
          font-size: 13px; text-decoration: none;
          transition: border-color 0.2s, color 0.2s;
        }
        .trailer-btn:hover { border-color: var(--accent); color: var(--accent); }
        .modal-body { padding: 24px 32px 32px; }
        .section-title { font-size: 1.4rem; margin-bottom: 16px; }
        .search-row { display: flex; gap: 8px; margin-bottom: 16px; }
        .torrent-search {
          flex: 1;
          background: var(--surface2);
          border: 1px solid var(--border);
          color: var(--text);
          padding: 10px 14px;
          border-radius: var(--radius);
          font-size: 14px;
          outline: none;
          transition: border-color 0.2s;
        }
        .torrent-search:focus { border-color: var(--accent); }
        .search-btn {
          background: var(--accent);
          color: #000;
          padding: 10px 16px;
          border-radius: var(--radius);
          font-weight: 600;
          display: flex; align-items: center;
        }
        .search-btn:hover { background: #f0b040; }
        .success-banner {
          background: rgba(62,207,142,0.1);
          border: 1px solid var(--green);
          color: var(--green);
          padding: 10px 16px; border-radius: var(--radius);
          font-size: 13px;
          display: flex; align-items: center; gap: 8px;
          margin-bottom: 16px;
        }
        .torrent-loading, .torrent-empty {
          color: var(--text-muted); font-size: 14px;
          padding: 20px 0; text-align: center;
        }
        .torrent-list { border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
        .torrent-header {
          display: grid;
          grid-template-columns: 1fr 70px 50px 50px 56px 90px 70px;
          gap: 8px;
          padding: 10px 14px;
          background: var(--surface2);
          font-size: 11px;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .torrent-row {
          display: grid;
          grid-template-columns: 1fr 70px 50px 50px 56px 90px 70px;
          gap: 8px;
          padding: 11px 14px;
          border-top: 1px solid var(--border);
          align-items: center;
          font-size: 13px;
          transition: background 0.15s;
        }
        .torrent-row:hover { background: var(--surface2); }
        .torrent-row.best-pick {
          background: linear-gradient(90deg, rgba(232,160,48,0.10), transparent 70%);
          border-left: 2px solid var(--accent);
          padding-left: 12px;
        }
        .torrent-row.best-pick:hover {
          background: linear-gradient(90deg, rgba(232,160,48,0.16), var(--surface2) 70%);
        }
        .best-pick-badge {
          display: inline-flex; align-items: center; gap: 3px;
          background: var(--accent);
          color: #000;
          padding: 1px 6px;
          border-radius: 3px;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          flex-shrink: 0;
          cursor: help;
        }
        .torrent-name {
          display: flex; align-items: center; gap: 8px;
          min-width: 0;
          position: relative;
        }
        .torrent-name-text {
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          min-width: 0; flex: 1;
        }
        .torrent-name-tooltip {
          position: absolute;
          left: 0; top: calc(100% + 4px);
          background: var(--surface2);
          border: 1px solid var(--border);
          color: var(--text);
          padding: 6px 10px;
          border-radius: 4px;
          font-size: 12px;
          line-height: 1.4;
          white-space: normal;
          max-width: 600px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.5);
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.15s ease;
          z-index: 20;
        }
        .torrent-name:hover .torrent-name-tooltip { opacity: 1; }
        .quality-tag {
          display: inline-block;
          padding: 1px 6px;
          border-radius: 3px;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          border: 1px solid transparent;
          flex-shrink: 0;
          white-space: nowrap;
        }
        .quality-4k     { background: rgba(232,160,48,0.18); color: var(--accent);  border-color: rgba(232,160,48,0.45); }
        .quality-bluray { background: rgba(80,130,220,0.18); color: #6a9eed;        border-color: rgba(80,130,220,0.45); }
        .quality-webdl  { background: rgba(62,207,142,0.15); color: var(--green);   border-color: rgba(62,207,142,0.40); }
        .quality-webrip { background: rgba(62,207,142,0.08); color: var(--green);   border-color: rgba(62,207,142,0.25); }
        .quality-cam,
        .quality-ts     { background: rgba(220,80,80,0.15);  color: var(--red);     border-color: rgba(220,80,80,0.40); }
        .quality-unknown{ background: var(--surface2);       color: var(--text-muted); border-color: var(--border); }
        .spanish-audio-tag {
          display: inline-block;
          padding: 1px 6px;
          border-radius: 3px;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.05em;
          background: rgba(168, 85, 247, 0.18);
          color: #c084fc;
          border: 1px solid rgba(168, 85, 247, 0.5);
          flex-shrink: 0;
        }
        .spanish-btn.active {
          background: #a855f7 !important;
          border-color: #a855f7 !important;
          color: #fff !important;
        }
        .quality-warning {
          display: flex; align-items: flex-start; gap: 8px;
          background: rgba(232,160,48,0.10);
          border: 1px solid var(--accent);
          color: var(--accent);
          padding: 10px 14px;
          border-radius: var(--radius);
          font-size: 13px; line-height: 1.5;
          margin-bottom: 14px;
        }
        .quality-warning-icon { flex-shrink: 0; margin-top: 1px; }
        .theatrical-warning {
          display: flex; align-items: flex-start; gap: 8px;
          background: rgba(255, 130, 60, 0.10);
          border: 1px solid #ff823c;
          color: #ff9d62;
          padding: 10px 14px;
          border-radius: var(--radius);
          font-size: 13px; line-height: 1.5;
          margin-bottom: 14px;
        }
        .theatrical-warning-icon { flex-shrink: 0; margin-top: 1px; color: #ff823c; }
        .torrent-size, .torrent-indexer { color: var(--text-muted); font-size: 12px; }
        .torrent-seeds { font-weight: 600; font-size: 13px; }
        .torrent-peers { font-size: 13px; color: var(--text-muted); }
        .ratio-pill {
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 2px 4px;
          border-radius: 6px;
          font-size: 10px;
          font-weight: 600;
          line-height: 1.15;
          text-align: center;
          border: 1px solid transparent;
          width: 100%;
          max-width: 52px;
          box-sizing: border-box;
          justify-self: start;
        }
        .ratio-line { white-space: nowrap; }
        .ratio-fast {
          background: rgba(62,207,142,0.15);
          color: var(--green);
          border-color: rgba(62,207,142,0.4);
        }
        .ratio-decent {
          background: rgba(232,160,48,0.12);
          color: var(--accent);
          border-color: rgba(232,160,48,0.4);
        }
        .ratio-slow {
          background: rgba(220,80,80,0.12);
          color: var(--red);
          border-color: rgba(220,80,80,0.4);
        }
        .torrent-filter {
          width: 220px;
          background: var(--surface2);
          border: 1px solid var(--border);
          color: var(--text);
          padding: 10px 12px;
          border-radius: var(--radius);
          font-size: 13px;
          outline: none;
          transition: border-color 0.2s;
        }
        .torrent-filter:focus { border-color: var(--accent); }
        .torrent-controls {
          display: flex; align-items: center; justify-content: space-between;
          gap: 12px; flex-wrap: wrap;
          margin-bottom: 10px;
        }
        .sort-group { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
        .sort-label {
          font-size: 11px; text-transform: uppercase;
          letter-spacing: 0.06em; color: var(--text-muted);
          margin-right: 2px;
        }
        .sort-btn {
          background: transparent;
          border: 1px solid var(--border);
          color: var(--text-muted);
          padding: 4px 10px; border-radius: 6px;
          font-size: 12px;
          transition: all 0.2s;
        }
        .sort-btn:hover { border-color: var(--accent); color: var(--accent); }
        .sort-btn.active {
          background: var(--accent); border-color: var(--accent); color: #000;
        }
        .ratio-legend {
          display: flex; gap: 10px; align-items: center;
          font-size: 11px; color: var(--text-muted);
        }
        .legend-item { display: inline-flex; align-items: center; gap: 4px; }
        .dot {
          display: inline-block;
          width: 8px; height: 8px;
          border-radius: 50%;
        }
        .dot-fast { background: var(--green); }
        .dot-decent { background: var(--accent); }
        .dot-slow { background: var(--red); }
        .filter-meta {
          font-size: 11px; color: var(--text-muted);
          margin-bottom: 8px;
        }
        .download-btn {
          background: var(--accent);
          color: #000;
          padding: 5px 12px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          display: flex; align-items: center; gap: 4px;
          transition: background 0.2s;
          white-space: nowrap;
        }
        .download-btn:hover { background: #f0b040; }
        .download-btn:disabled { opacity: 0.5; cursor: wait; }

        @media (max-width: 768px) {
          .modal-backdrop { padding: 0; }
          .modal {
            border-radius: 0;
            border: none;
            max-width: 100%;
            max-height: 100vh;
            height: 100vh;
            width: 100vw;
          }
          .modal-expanded { max-width: 100%; }
          .modal-expand { display: none; }
          .modal-close {
            top: max(14px, env(safe-area-inset-top));
            right: 14px;
            width: 44px; height: 44px;
          }
          .modal-hero-content {
            flex-direction: column;
            align-items: center;
            text-align: center;
            padding: 24px 16px;
            padding-top: max(56px, calc(env(safe-area-inset-top) + 56px));
          }
          .modal-hero { border-radius: 0; }
          .modal-poster { width: 140px; min-width: 0; margin: 0 auto; }
          .modal-title { font-size: 1.5rem; }
          .modal-overview { -webkit-line-clamp: 5; }
          .modal-body { padding: 18px 16px 28px; }
          .section-title { font-size: 1.15rem; margin-bottom: 12px; }
          .search-row { flex-wrap: wrap; gap: 8px; }
          .torrent-search { flex: 1 1 70%; }
          .torrent-filter { flex: 1 1 100%; width: 100%; }
          .torrent-controls { flex-direction: column; align-items: stretch; }
          .sort-group { overflow-x: auto; flex-wrap: nowrap; scrollbar-width: none; }
          .sort-group::-webkit-scrollbar { display: none; }
          .sort-btn { white-space: nowrap; min-height: 36px; }
          .ratio-legend { justify-content: flex-end; }

          /* Torrent table becomes card list */
          .torrent-list { border: none; background: transparent; }
          .torrent-header { display: none; }
          .torrent-row {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 6px 10px;
            padding: 12px;
            background: var(--surface2);
            border: 1px solid var(--border);
            border-radius: 8px;
            margin-bottom: 8px;
          }
          .torrent-row.best-pick { padding-left: 12px; }
          .torrent-row:hover { background: var(--surface2); }
          .torrent-name {
            flex: 1 1 100%;
            font-size: 13px;
            font-weight: 500;
          }
          .torrent-name-text {
            white-space: normal;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
          }
          .torrent-name-tooltip { display: none; }
          .torrent-size {
            flex: 0 0 auto;
            font-size: 12px;
          }
          .torrent-size::before { content: "📦 "; }
          .torrent-seeds, .torrent-peers {
            font-size: 12px;
            font-weight: 500;
          }
          .torrent-seeds::after { content: " seeds"; color: var(--text-muted); font-weight: 400; }
          .torrent-peers::after { content: " peers"; color: var(--text-muted); font-weight: 400; }
          .torrent-indexer {
            font-size: 11px;
            color: var(--text-muted);
          }
          .ratio-pill { margin-left: auto; max-width: 56px; }
          .download-btn {
            flex: 1 1 100%;
            margin-top: 6px;
            justify-content: center;
            padding: 11px 16px;
            min-height: 44px;
          }
        }
        @media (max-width: 480px) {
          .modal-title { font-size: 1.3rem; }
          .modal-poster { width: 120px; }
          .modal-tags .tag { font-size: 11px; padding: 1px 8px; }
          .trailer-btn { font-size: 12px; padding: 5px 12px; }
        }
      `}</style>
    </div>
  )
}
