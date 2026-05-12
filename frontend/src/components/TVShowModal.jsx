import { useState, useEffect, useMemo } from 'react'
import {
  X, Download, Search, Play, Check, AlertTriangle,
  Maximize2, Minimize2, Star, Folder,
} from 'lucide-react'
import { getTVDetail, getTVSeason, searchTVTorrents, addTVTorrent } from '../api'

// Default API map; AnimeModal passes anime-specific endpoints via `api` prop.
const DEFAULT_API = {
  getDetail: getTVDetail,
  getSeason: getTVSeason,
  searchTorrents: searchTVTorrents,
  addTorrent: addTVTorrent,
}
import { hasSpanishAudio, readPrefs, matchesPrefs, prefsActive } from '../utils'
import AutoDownloadButton from './AutoDownloadButton'
import {
  scoreTorrent, pickBestThree, qualityTag,
  scoreBreakdown, tierContextLabel, TIER_META, isSeasonPack,
} from '../torrentScoring'

// ── Helpers shared with MovieModal. Duplicated here intentionally to keep
//    Part 1 movie modal untouched; refactor candidate for a shared TorrentList. ──

function formatSize(bytes) {
  if (!bytes) return '?'
  const gb = bytes / 1024 / 1024 / 1024
  return gb >= 1 ? `${gb.toFixed(2)} GB` : `${(bytes / 1024 / 1024).toFixed(0)} MB`
}

// Scoring + tier logic shared with MovieModal via ../torrentScoring.
const TAG_RANK = { '4K': 5, 'BluRay': 4, 'WEB-DL': 3, 'WEBRip': 2, 'HDTV': 1, 'Unknown': 1, 'TS': 0, 'CAM': 0 }
function qualityRank(title) { return TAG_RANK[qualityTag(title)] ?? 1 }
function tagClass(tag) { return tag.toLowerCase().replace(/[^a-z0-9]/g, '') }

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

export default function TVShowModal({ show, onClose, api = DEFAULT_API, savePathLabel = 'TV-Shows' }) {
  const [detail, setDetail] = useState(null)
  const [selectedSeason, setSelectedSeason] = useState(null)
  const [seasonData, setSeasonData] = useState(null)
  const [seasonError, setSeasonError] = useState(false)
  const [torrents, setTorrents] = useState([])
  const [torrentLoading, setTorrentLoading] = useState(false)
  const [downloading, setDownloading] = useState(null)
  const [done, setDone] = useState(false)
  const [doneMsg, setDoneMsg] = useState('')
  const [scope, setScope] = useState({ season: null, episode: null })  // narrows last torrent search
  const [filterText, setFilterText] = useState('')
  const [sortKey, setSortKey] = useState('smart')
  const [spanishOnly, setSpanishOnly] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [trailerOpen, setTrailerOpen] = useState(false)
  const prefs = useMemo(() => readPrefs(), [])
  const prefsOn = useMemo(() => prefsActive(prefs), [prefs])

  useEffect(() => {
    document.body.classList.add('modal-open')
    return () => document.body.classList.remove('modal-open')
  }, [])

  useEffect(() => {
    const handler = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Initial load: full detail + first season episode list. Prefer a real
  // season (season_number > 0) but fall back to Season 0 if that's all
  // TMDb has (some specials-only or single-OVA titles).
  useEffect(() => {
    api.getDetail(show.id).then(r => {
      setDetail(r.data)
      const allSeasons = r.data.seasons || []
      const real = allSeasons.filter(s => s.season_number > 0)
      const startSeason = real.length > 0
        ? real[0].season_number
        : (allSeasons[0]?.season_number ?? null)
      setSelectedSeason(startSeason)
    }).catch(() => {
      // Detail itself failed — leave detail null; UI will show no-data state
    })
  }, [show.id])

  // Load season episode list whenever season changes
  useEffect(() => {
    if (selectedSeason == null || !detail) return
    setSeasonError(false)
    setSeasonData(null)
    api.getSeason(show.id, selectedSeason)
      .then(r => setSeasonData(r.data))
      .catch(() => { setSeasonError(true); setSeasonData(null) })
  }, [selectedSeason, detail, show.id])

  async function fetchTorrents(season, episode) {
    setTorrentLoading(true)
    setScope({ season, episode })
    try {
      const r = await api.searchTorrents(show.title, season, episode)
      setTorrents(r.data)
    } catch {
      setTorrents([])
    } finally {
      setTorrentLoading(false)
    }
  }

  function handleDownloadSeason(seasonNum) { fetchTorrents(seasonNum, null) }
  function handleDownloadEpisode(seasonNum, episodeNum) { fetchTorrents(seasonNum, episodeNum) }

  async function handleAdd(torrent) {
    if (!torrent.magnet) return alert('No magnet link available.')
    const seasonForFolder = scope.season ?? selectedSeason ?? 1
    setDownloading(torrent.title)
    try {
      await api.addTorrent(torrent.magnet, show.title, seasonForFolder)
      setDoneMsg(`Added to Season ${seasonForFolder}`)
      setDone(true)
      setTimeout(() => setDone(false), 4000)
    } catch (e) {
      const detail = e.response?.data?.detail
      alert(detail ? `Failed: ${detail}` : 'Failed to add torrent. Check qBittorrent connection.')
    }
    setDownloading(null)
  }

  // ── Derived view state (Best Picks, scoring, filter) ─────────────────────
  const scoringContext = useMemo(() => {
    const seasonInfo = detail?.seasons?.find(s => s.season_number === (scope.season ?? selectedSeason))
    return {
      mode: 'tv',
      runtimeMin: detail?.episode_run_time?.[0] || 45,
      episodeCount: seasonInfo?.episode_count || detail?.number_of_episodes || 10,
      // User explicitly asked for a season (not a specific episode) → score
      // all results as season-pack content.
      isSeasonSearch: scope.season != null && scope.episode == null,
    }
  }, [detail, scope.season, scope.episode, selectedSeason])

  const scored = useMemo(
    () => torrents.map(t => ({ ...t, _score: scoreTorrent(t, scoringContext) })),
    [torrents, scoringContext]
  )

  const bestPicks = useMemo(() => pickBestThree(scored, scoringContext), [scored, scoringContext])

  const pickTitleMap = useMemo(() => {
    const m = new Map()
    if (bestPicks.quality) m.set(bestPicks.quality.title, 'quality')
    if (bestPicks.value)   m.set(bestPicks.value.title, 'value')
    if (bestPicks.budget)  m.set(bestPicks.budget.title, 'budget')
    return m
  }, [bestPicks])

  const showLowQualityWarning = useMemo(() => {
    if (torrents.length === 0) return false
    const top = [...torrents].sort((a, b) => (b.seeders || 0) - (a.seeders || 0)).slice(0, 5)
    return top.filter(t => {
      const q = qualityTag(t.title)
      return q === 'CAM' || q === 'TS'
    }).length >= 2
  }, [torrents])

  const visibleTorrents = useMemo(() => {
    let arr = scored
    if (filterText.trim()) {
      const q = filterText.toLowerCase()
      arr = arr.filter(t => (t.title || '').toLowerCase().includes(q))
    }
    if (spanishOnly) arr = arr.filter(t => hasSpanishAudio(t.title))
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
    const tierOrder = prefs.preferredTier && prefs.preferredTier !== 'any'
      ? [prefs.preferredTier, ...['quality', 'value', 'budget'].filter(x => x !== prefs.preferredTier)]
      : ['quality', 'value', 'budget']
    const pinned = tierOrder
      .map(tier => bestPicks[tier])
      .filter(Boolean)
      .map(pick => sorted.find(t => t.title === pick.title))
      .filter(Boolean)
    const rest = sorted.filter(t => !pickTitleMap.has(t.title))
    return [...pinned, ...rest]
  }, [scored, filterText, sortKey, bestPicks, pickTitleMap, spanishOnly, prefs.preferredTier])

  const year = (show.release_date || show.first_air_date || '').split('-')[0]
  const trailer = detail?.trailer
  // Show real seasons (1+). If detail exists but there are zero real seasons,
  // fall back to Season 0 (specials) if any exist — better than an empty picker.
  const allSeasons = detail?.seasons || []
  const realSeasonsOnly = allSeasons.filter(s => s.season_number > 0)
  const realSeasons = realSeasonsOnly.length > 0 ? realSeasonsOnly : allSeasons
  const hasNoSeasonData = detail && allSeasons.length === 0
  const scopeLabel =
    scope.season == null ? 'all results'
    : scope.episode == null ? `Season ${scope.season} only`
    : `Season ${scope.season} · Episode ${scope.episode}`
  const savePathHint = `/${savePathLabel}/${show.title}/Season ${String(scope.season ?? selectedSeason).padStart(2, '0')}/`

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${expanded ? 'modal-expanded' : ''}`}>
        <button className="modal-expand" onClick={() => setExpanded(v => !v)} title={expanded ? 'Compact view' : 'Expand modal'}>
          {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
        <button className="modal-close" onClick={onClose}><X size={20} /></button>

        {/* Hero */}
        <div className="modal-hero" style={{ backgroundImage: detail?.backdrop_path ? `url(https://image.tmdb.org/t/p/w1280${detail.backdrop_path})` : undefined }}>
          <div className="modal-hero-overlay" />
          <div className="modal-hero-content">
            {show.poster_url && <img className="modal-poster" src={show.poster_url} alt={show.title} />}
            <div className="modal-meta">
              <h2 className="modal-title">{show.title}</h2>
              <div className="modal-tags">
                {year && <span className="tag">{year}</span>}
                {detail?.number_of_seasons && <span className="tag">{detail.number_of_seasons} season{detail.number_of_seasons === 1 ? '' : 's'}</span>}
                {detail?.us_rating && <span className="tag">{detail.us_rating}</span>}
                <span className="tag">★ {show.vote_average?.toFixed(1)}</span>
                {show.in_library && (
                  <span className={`tag ${detail?.plex_progress?.complete ? 'tag-green' : 'tag-accent'}`}>
                    <Check size={12}/>
                    {detail?.plex_progress?.complete
                      ? 'Complete'
                      : detail?.plex_progress
                        ? `${detail.plex_progress.episodes_in_library_count}/${detail.plex_progress.total_episodes} eps`
                        : 'In Library'}
                  </span>
                )}
              </div>
              {detail?.plex_progress && detail.plex_progress.total_episodes > 0 && !detail.plex_progress.complete && (
                <div className="plex-progress-bar" title={`${detail.plex_progress.episodes_in_library_count} of ${detail.plex_progress.total_episodes} episodes in Plex`}>
                  <div
                    className="plex-progress-fill"
                    style={{ width: `${Math.round(100 * detail.plex_progress.episodes_in_library_count / detail.plex_progress.total_episodes)}%` }}
                  />
                </div>
              )}
              {detail?.genres && (
                <div className="modal-genres">
                  {detail.genres.map(g => <span key={g.id} className="genre-chip">{g.name}</span>)}
                </div>
              )}
              {detail?.streaming_services?.length > 0 && (
                <div className="streaming-row">
                  <span className="streaming-label">Streaming on</span>
                  {detail.streaming_services.map(s => (
                    <span key={s.provider_id} className="streaming-chip">{s.provider_name}</span>
                  ))}
                </div>
              )}
              <p className="modal-overview">{detail?.overview || show.overview}</p>
              <div className="hero-action-row">
                {trailer && !trailerOpen && (
                  <button className="trailer-btn" onClick={() => setTrailerOpen(true)}>
                    <Play size={14} fill="currentColor" /> Play Trailer
                  </button>
                )}
                <AutoDownloadButton
                  id={show.id}
                  type={api === DEFAULT_API ? 'tv' : 'anime'}
                  title={show.title}
                  release_date={show.release_date || show.first_air_date}
                />
              </div>
            </div>
          </div>
        </div>

        {trailer && trailerOpen && (
          <div className="trailer-embed">
            <button
              className="trailer-close"
              onClick={() => setTrailerOpen(false)}
              aria-label="Close trailer"
            >
              <X size={18} />
            </button>
            <iframe
              src={`https://www.youtube.com/embed/${trailer.key}?autoplay=1&rel=0`}
              title="Trailer"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
        )}

        {/* Seasons + episodes */}
        <div className="modal-body">
          {hasNoSeasonData && (
            <div className="no-seasons-fallback">
              <p>No season data available from TMDb for this title.</p>
              <button className="download-season-btn" onClick={() => fetchTorrents(null, null)}>
                <Search size={14} /> Search Torrents Directly
              </button>
            </div>
          )}

          {realSeasons.length > 0 && (
            <>
              <h3 className="section-title">Seasons</h3>
              <div className="season-picker">
                {realSeasons.map(s => {
                  const sn = s.season_number
                  const progress = detail?.plex_progress
                  const isComplete = progress?.seasons_complete?.includes(sn)
                  const partial = progress?.seasons_partial?.[String(sn)]
                  return (
                    <button
                      key={s.id}
                      className={`season-btn ${selectedSeason === sn ? 'active' : ''} ${isComplete ? 'season-complete' : partial ? 'season-partial' : ''}`}
                      onClick={() => setSelectedSeason(sn)}
                    >
                      <span>S{sn}</span>
                      {isComplete && <Check size={11} />}
                      {!isComplete && partial && (
                        <span className="season-frac">{partial.have}/{partial.total}</span>
                      )}
                    </button>
                  )
                })}
              </div>

              <div className="season-actions">
                <button className="download-season-btn" onClick={() => handleDownloadSeason(selectedSeason)}>
                  <Download size={14} /> Search Season {selectedSeason} torrents
                </button>
                {detail?.plex_episodes?.[String(selectedSeason)] && (
                  <span className="plex-have">
                    Plex already has {detail.plex_episodes[String(selectedSeason)].length} episode{detail.plex_episodes[String(selectedSeason)].length === 1 ? '' : 's'}
                  </span>
                )}
              </div>

              {seasonError && (
                <div className="season-error">
                  <AlertTriangle size={14} />
                  <span>Couldn't load episodes for Season {selectedSeason}.</span>
                  <button className="season-error-search" onClick={() => fetchTorrents(null, null)}>
                    <Search size={12} /> Search torrents directly
                  </button>
                </div>
              )}

              {seasonData?.episodes?.length > 0 && (
                <div className="episode-list">
                  {seasonData.episodes.map(ep => (
                    <div key={ep.id} className={`episode-row ${ep.in_library ? 'in-library' : ''}`}>
                      <div className="episode-thumb">
                        {ep.still_url
                          ? <img src={ep.still_url} alt="" loading="lazy" />
                          : <div className="episode-thumb-fallback" />}
                        {ep.in_library && <span className="episode-have"><Check size={12}/></span>}
                      </div>
                      <div className="episode-main">
                        <div className="episode-head">
                          <span className="episode-num">E{String(ep.episode_number).padStart(2, '0')}</span>
                          <span className="episode-title">{ep.name}</span>
                          {ep.air_date && <span className="episode-date">{ep.air_date}</span>}
                        </div>
                        {ep.overview && <p className="episode-overview">{ep.overview}</p>}
                      </div>
                      <button
                        className={`episode-download ${ep.in_library ? 'in-library' : ''}`}
                        onClick={() => handleDownloadEpisode(selectedSeason, ep.episode_number)}
                        title={ep.in_library
                          ? 'Already in library — click to search torrents anyway'
                          : `Search torrents for S${selectedSeason}E${ep.episode_number}`}
                      >
                        <Download size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Torrent search section, hidden until a search has been triggered */}
          {(torrentLoading || torrents.length > 0) && (
            <>
              <h3 className="section-title" style={{marginTop: 32}}>Available Torrents</h3>
              <div className="search-row">
                <input
                  className="torrent-filter"
                  value={filterText}
                  onChange={e => setFilterText(e.target.value)}
                  placeholder="Filter results (e.g. 1080p, YTS)"
                />
                <div className="scope-chip">
                  <span className="scope-label">Searching:</span> {scopeLabel}
                </div>
              </div>

              <div className="save-hint">
                <Folder size={12} /> Will save to <code>{savePathHint}</code>
              </div>

              {done && (
                <div className="success-banner">
                  <Check size={16} /> {doneMsg} — Plex TV library will refresh when download finishes
                </div>
              )}

              {(() => {
                const sn = scope.season ?? selectedSeason
                const pp = detail?.plex_progress
                const epPlex = scope.episode != null
                  && (detail?.plex_episodes?.[String(sn)] || detail?.plex_episodes?.[sn] || []).includes(scope.episode)
                if (epPlex) {
                  return (
                    <div className="dupe-warning">
                      <AlertTriangle size={16} className="dupe-warning-icon" />
                      <span>S{sn}E{scope.episode} is already in your Plex library. Downloading will use additional storage.</span>
                    </div>
                  )
                }
                if (pp?.complete) {
                  return (
                    <div className="dupe-warning">
                      <AlertTriangle size={16} className="dupe-warning-icon" />
                      <span>The full series is already in your Plex library.</span>
                    </div>
                  )
                }
                if (pp?.seasons_complete?.includes(sn)) {
                  return (
                    <div className="dupe-warning">
                      <AlertTriangle size={16} className="dupe-warning-icon" />
                      <span>All episodes from Season {sn} are already in your Plex library.</span>
                    </div>
                  )
                }
                return null
              })()}

              {showLowQualityWarning && (
                <div className="quality-warning">
                  <AlertTriangle size={16} className="quality-warning-icon" />
                  <span>Top results appear to be CAM/TS quality. Good rips may not be available yet.</span>
                </div>
              )}

              <div className="torrent-controls">
                <div className="sort-group">
                  <span className="sort-label">Sort:</span>
                  {SORTS.map(s => (
                    <button key={s.id} className={`sort-btn ${sortKey === s.id ? 'active' : ''}`} onClick={() => setSortKey(s.id)}>{s.label}</button>
                  ))}
                  <button
                    className={`sort-btn spanish-btn ${spanishOnly ? 'active' : ''}`}
                    onClick={() => setSpanishOnly(v => !v)}
                    title="Show only torrents with Spanish audio indicators"
                  >
                    Spanish
                  </button>
                </div>
                <div className="ratio-legend">
                  <span className="legend-item"><span className="dot dot-fast" />fast</span>
                  <span className="legend-item"><span className="dot dot-decent" />decent</span>
                  <span className="legend-item"><span className="dot dot-slow" />slow</span>
                </div>
              </div>

              {torrentLoading ? (
                <div className="torrent-loading">Searching indexers...</div>
              ) : visibleTorrents.length === 0 ? (
                <div className="torrent-empty">No results found.</div>
              ) : (() => {
                // In season-search mode, partition into packs + episodes
                // (packs first, then "Individual Episodes" divider, then eps).
                // Best Picks stay pinned at absolute top regardless.
                const pinned = []
                const remainder = []
                for (const t of visibleTorrents) {
                  if (pickTitleMap.has(t.title)) pinned.push(t)
                  else remainder.push(t)
                }
                const seasonSearchMode = scoringContext.isSeasonSearch
                const packs = seasonSearchMode ? remainder.filter(t => isSeasonPack(t.title)) : []
                const eps   = seasonSearchMode ? remainder.filter(t => !isSeasonPack(t.title)) : remainder
                const renderRow = (t, i) => {
                  const { ratio, bucket, seeds, peers } = ratioInfo(t)
                  const ratioLabel = ratio === Infinity ? '∞' : ratio.toFixed(1)
                  const qtag = qualityTag(t.title)
                  const pickTier = pickTitleMap.get(t.title) || null
                  const tierMeta = pickTier ? TIER_META[pickTier] : null
                  const isPack = isSeasonPack(t.title)
                  const prefsMatch = prefsOn && matchesPrefs(t._score, prefs)
                  return (
                    <div key={`r-${i}-${t.title}`} className={`torrent-row ${pickTier ? `best-pick best-pick-${pickTier}` : ''} ${prefsMatch ? 'prefs-match' : ''}`}>
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
                        <span className={`type-tag ${isPack ? 'type-pack' : 'type-ep'}`}>
                          {isPack ? 'Season Pack' : 'Episode'}
                        </span>
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
                      </span>
                      <span className="torrent-size">{formatSize(t.size)}</span>
                      <span className="torrent-seeds" style={{color: t.seeders > 10 ? 'var(--green)' : t.seeders > 0 ? 'var(--accent)' : 'var(--red)'}}>{t.seeders}</span>
                      <span className="torrent-peers">{t.leechers ?? 0}</span>
                      <span className={`ratio-pill ratio-${bucket}`} title={`${seeds} seeders / ${peers} peers (ratio ${ratioLabel}) — ${bucket}`}>
                        <span className="ratio-line">{seeds}s</span>
                        <span className="ratio-line">{peers}p</span>
                      </span>
                      <span className="torrent-indexer">{t.indexer}</span>
                      <button className="download-btn" onClick={() => handleAdd(t)} disabled={downloading === t.title}>
                        {downloading === t.title ? '...' : <><Download size={14} /> Get</>}
                      </button>
                    </div>
                  )
                }
                return (
                  <div className="torrent-list">
                    <div className="torrent-header">
                      <span>Title</span><span>Size</span><span>Seeds</span><span>Peers</span>
                      <span title="Seeder/Peer ratio">S/P</span><span>Source</span><span></span>
                    </div>
                    {pinned.map(renderRow)}
                    {seasonSearchMode ? (
                      <>
                        {packs.map((t, i) => renderRow(t, `pack-${i}`))}
                        {eps.length > 0 && (
                          <div className="torrent-divider">Individual Episodes ({eps.length})</div>
                        )}
                        {eps.map((t, i) => renderRow(t, `ep-${i}`))}
                      </>
                    ) : (
                      remainder.map((t, i) => renderRow(t, `r-${i}`))
                    )}
                  </div>
                )
              })()}
            </>
          )}

          {torrents.length === 0 && !torrentLoading && (
            <div className="empty-hint">
              Click <strong>Search Season {selectedSeason} torrents</strong> above to find downloads, or hit the small download icon on an individual episode for episode-specific results.
            </div>
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
          background: var(--surface); border: 1px solid var(--border); border-radius: 14px;
          width: 100%; max-width: 860px;
          max-height: 90vh; overflow-y: auto;
          position: relative;
          transition: max-width 0.25s ease;
        }
        .modal-expanded { max-width: 1320px; }
        .modal-close, .modal-expand {
          position: absolute; top: 14px;
          background: rgba(0,0,0,0.6); color: var(--text);
          border-radius: 50%;
          width: 36px; height: 36px;
          display: flex; align-items: center; justify-content: center;
          z-index: 10;
        }
        .modal-close { right: 14px; }
        .modal-expand { right: 60px; }
        .modal-close:hover, .modal-expand:hover { background: var(--accent); color: #000; }
        .modal-hero {
          position: relative;
          background: var(--surface2) center/cover no-repeat;
          border-radius: 14px 14px 0 0; overflow: hidden;
        }
        .modal-hero-overlay { position: absolute; inset: 0; background: linear-gradient(to right, rgba(10,10,15,0.95) 40%, rgba(10,10,15,0.5)); }
        .modal-hero-content { position: relative; display: flex; gap: 24px; padding: 32px; }
        .modal-poster { width: 130px; min-width: 130px; aspect-ratio: 2/3; object-fit: cover; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.5); }
        .modal-meta { flex: 1; }
        .modal-title { font-size: 2rem; line-height: 1.1; margin-bottom: 10px; }
        .modal-tags { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
        .tag { background: var(--surface2); border: 1px solid var(--border); padding: 2px 10px; border-radius: 20px; font-size: 12px; display: flex; align-items: center; gap: 4px; }
        .tag-green { background: rgba(62,207,142,0.15); border-color: var(--green); color: var(--green); }
        .tag-accent { background: rgba(232,160,48,0.15); border-color: var(--accent); color: var(--accent); }
        .plex-progress-bar {
          width: 100%;
          max-width: 320px;
          height: 6px;
          background: var(--border);
          border-radius: 3px;
          overflow: hidden;
          margin: 6px 0 10px;
        }
        .plex-progress-fill {
          height: 100%;
          background: var(--accent);
          transition: width 0.4s ease;
        }
        .modal-genres { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
        .genre-chip { background: rgba(232,160,48,0.1); border: 1px solid rgba(232,160,48,0.3); color: var(--accent); padding: 2px 10px; border-radius: 20px; font-size: 11px; }
        .streaming-row { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
        .streaming-label { font-size: 12px; color: var(--text-muted); }
        .streaming-chip { background: var(--surface2); border: 1px solid var(--border); padding: 2px 10px; border-radius: 20px; font-size: 12px; }
        .modal-overview { font-size: 13px; line-height: 1.6; color: rgba(240,238,234,0.75); margin-bottom: 14px; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
        .trailer-btn { display: inline-flex; align-items: center; gap: 6px; background: transparent; border: 1px solid var(--border); color: var(--text); padding: 6px 14px; border-radius: 6px; font-size: 13px; text-decoration: none; }
        .trailer-btn:hover { border-color: var(--accent); color: var(--accent); }
        .hero-action-row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
        .trailer-embed {
          position: relative;
          margin: 0 32px 24px;
          border-radius: 10px;
          overflow: hidden;
          border: 1px solid var(--border);
          background: #000;
          box-shadow: 0 4px 24px rgba(0,0,0,0.5);
        }
        .trailer-embed::before { content: ''; display: block; padding-top: 56.25%; }
        .trailer-embed iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
        .trailer-close {
          position: absolute; top: 8px; right: 8px; z-index: 2;
          background: rgba(0,0,0,0.65); color: #fff;
          border-radius: 50%; width: 32px; height: 32px;
          display: flex; align-items: center; justify-content: center;
          backdrop-filter: blur(4px);
          transition: background 0.15s;
        }
        .trailer-close:hover { background: rgba(0,0,0,0.9); }
        .modal-body { padding: 24px 32px 32px; }
        .section-title { font-size: 1.4rem; margin-bottom: 16px; }

        .season-picker { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 14px; }
        .season-btn { background: transparent; border: 1px solid var(--border); color: var(--text-muted); padding: 7px 14px; border-radius: 6px; font-size: 13px; font-weight: 600; display: inline-flex; align-items: center; gap: 5px; }
        .season-btn:hover { border-color: var(--accent); color: var(--accent); }
        .season-btn.active { background: var(--accent); border-color: var(--accent); color: #000; }
        .season-btn.season-complete { border-color: rgba(62,207,142,0.5); color: var(--green); }
        .season-btn.season-complete.active { background: var(--green); border-color: var(--green); color: #000; }
        .season-btn.season-partial { border-color: rgba(232,160,48,0.5); }
        .season-frac { font-size: 10px; font-weight: 700; color: var(--accent); }
        .season-btn.active .season-frac { color: #000; }
        .season-actions { display: flex; align-items: center; gap: 14px; margin-bottom: 18px; flex-wrap: wrap; }
        .download-season-btn { display: inline-flex; align-items: center; gap: 6px; background: var(--surface2); border: 1px solid var(--accent); color: var(--accent); padding: 7px 14px; border-radius: 6px; font-size: 13px; font-weight: 600; }
        .download-season-btn:hover { background: var(--accent); color: #000; }
        .plex-have { font-size: 12px; color: var(--green); }
        .no-seasons-fallback {
          padding: 24px 20px;
          background: var(--surface2);
          border: 1px dashed var(--border);
          border-radius: var(--radius);
          margin-bottom: 18px;
          text-align: center;
        }
        .no-seasons-fallback p {
          font-size: 13px; color: var(--text-muted);
          margin-bottom: 14px;
        }
        .season-error {
          display: flex; align-items: center; gap: 10px;
          padding: 10px 14px; margin-bottom: 18px;
          background: rgba(220,80,80,0.08);
          border: 1px solid rgba(220,80,80,0.4);
          border-radius: var(--radius);
          font-size: 13px;
          color: #ff9999;
          flex-wrap: wrap;
        }
        .season-error-search {
          display: inline-flex; align-items: center; gap: 4px;
          background: transparent; border: 1px solid currentColor;
          color: inherit;
          padding: 4px 10px; border-radius: 6px; font-size: 12px;
          margin-left: auto;
        }
        .season-error-search:hover { background: rgba(220,80,80,0.15); }

        .episode-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px; }
        .episode-row {
          display: grid; grid-template-columns: 140px 1fr auto;
          gap: 14px; align-items: start;
          padding: 12px; background: var(--surface2);
          border: 1px solid var(--border); border-radius: 8px;
        }
        .episode-row.in-library { border-color: rgba(62,207,142,0.3); }
        .episode-thumb { position: relative; width: 140px; aspect-ratio: 16/9; background: var(--surface); border-radius: 4px; overflow: hidden; }
        .episode-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .episode-thumb-fallback { width: 100%; height: 100%; background: linear-gradient(135deg, var(--surface), var(--surface2)); }
        .episode-have { position: absolute; top: 4px; right: 4px; background: var(--green); color: #000; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
        .episode-main { min-width: 0; }
        .episode-head { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; flex-wrap: wrap; }
        .episode-num { font-family: 'Bebas Neue', sans-serif; letter-spacing: 0.04em; color: var(--accent); font-size: 14px; }
        .episode-title { font-size: 13px; font-weight: 600; }
        .episode-date { font-size: 11px; color: var(--text-muted); }
        .episode-overview { font-size: 12px; color: var(--text-muted); line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin: 0; }
        .episode-download { background: transparent; border: 1px solid var(--border); color: var(--text-muted); width: 32px; height: 32px; border-radius: 6px; display: flex; align-items: center; justify-content: center; }
        .episode-download:hover { border-color: var(--accent); color: var(--accent); }
        .episode-download.in-library { opacity: 0.35; }
        .episode-download.in-library:hover { opacity: 0.7; }
        .dupe-warning {
          display: flex; align-items: flex-start; gap: 8px;
          background: rgba(255, 160, 60, 0.10);
          border: 1px solid #ffa03c;
          color: #ffb872;
          padding: 10px 14px;
          border-radius: var(--radius);
          font-size: 13px; line-height: 1.5;
          margin-bottom: 14px;
        }
        .dupe-warning-icon { flex-shrink: 0; margin-top: 1px; color: #ffa03c; }

        .search-row { display: flex; gap: 8px; margin-bottom: 8px; align-items: center; flex-wrap: wrap; }
        .torrent-filter { flex: 1; min-width: 200px; background: var(--surface2); border: 1px solid var(--border); color: var(--text); padding: 10px 14px; border-radius: var(--radius); font-size: 13px; outline: none; }
        .torrent-filter:focus { border-color: var(--accent); }
        .scope-chip { font-size: 12px; color: var(--text-muted); padding: 6px 10px; background: var(--surface2); border: 1px solid var(--border); border-radius: 6px; }
        .scope-label { color: var(--text-muted); margin-right: 4px; }
        .save-hint { font-size: 11px; color: var(--text-muted); margin-bottom: 12px; display: flex; align-items: center; gap: 6px; }
        .save-hint code { background: var(--surface2); padding: 1px 6px; border-radius: 3px; font-size: 11px; color: var(--text); }
        .success-banner { background: rgba(62,207,142,0.1); border: 1px solid var(--green); color: var(--green); padding: 10px 16px; border-radius: var(--radius); font-size: 13px; display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
        .quality-warning { display: flex; align-items: flex-start; gap: 8px; background: rgba(232,160,48,0.10); border: 1px solid var(--accent); color: var(--accent); padding: 10px 14px; border-radius: var(--radius); font-size: 13px; line-height: 1.5; margin-bottom: 14px; }
        .quality-warning-icon { flex-shrink: 0; margin-top: 1px; }
        .torrent-loading, .torrent-empty { color: var(--text-muted); font-size: 14px; padding: 20px 0; text-align: center; }
        .empty-hint { font-size: 13px; color: var(--text-muted); padding: 12px 14px; background: var(--surface2); border: 1px dashed var(--border); border-radius: var(--radius); }

        .torrent-controls { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 10px; }
        .sort-group { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
        .sort-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); margin-right: 2px; }
        .sort-btn { background: transparent; border: 1px solid var(--border); color: var(--text-muted); padding: 4px 10px; border-radius: 6px; font-size: 12px; }
        .sort-btn:hover { border-color: var(--accent); color: var(--accent); }
        .sort-btn.active { background: var(--accent); border-color: var(--accent); color: #000; }
        .spanish-btn.active { background: #a855f7 !important; border-color: #a855f7 !important; color: #fff !important; }
        .ratio-legend { display: flex; gap: 10px; align-items: center; font-size: 11px; color: var(--text-muted); }
        .legend-item { display: inline-flex; align-items: center; gap: 4px; }
        .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; }
        .dot-fast { background: var(--green); }
        .dot-decent { background: var(--accent); }
        .dot-slow { background: var(--red); }

        .torrent-list { border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
        .torrent-header, .torrent-row { display: grid; grid-template-columns: 1fr 70px 50px 50px 56px 90px 70px; gap: 8px; }
        .torrent-header { padding: 10px 14px; background: var(--surface2); font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; }
        .torrent-row { padding: 11px 14px; border-top: 1px solid var(--border); align-items: center; font-size: 13px; }
        .torrent-row:hover { background: var(--surface2); }
        .torrent-row.best-pick { padding-left: 12px; }
        .torrent-row.prefs-match { box-shadow: inset 3px 0 0 #a855f7; }
        .torrent-row.prefs-match.best-pick { padding-left: 14px; }
        .torrent-row.best-pick-quality { background: linear-gradient(90deg, rgba(232,160,48,0.10), transparent 70%); border-left: 2px solid var(--accent); }
        .torrent-row.best-pick-value   { background: linear-gradient(90deg, rgba(62,207,142,0.08), transparent 70%); border-left: 2px solid var(--green); }
        .torrent-row.best-pick-budget  { background: linear-gradient(90deg, rgba(168,85,247,0.08), transparent 70%); border-left: 2px solid #a855f7; }
        .best-pick-badge { display: inline-flex; align-items: center; gap: 3px; padding: 1px 6px; border-radius: 3px; font-size: 9px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; flex-shrink: 0; cursor: help; white-space: nowrap; }
        .best-pick-badge.tier-quality { background: var(--accent); color: #000; }
        .best-pick-badge.tier-value   { background: var(--green);  color: #000; }
        .best-pick-badge.tier-budget  { background: #a855f7;       color: #fff; }
        .torrent-name { display: flex; align-items: center; gap: 8px; min-width: 0; }
        .torrent-name-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; flex: 1; }
        .torrent-size, .torrent-indexer { color: var(--text-muted); font-size: 12px; }
        .torrent-seeds { font-weight: 600; font-size: 13px; }
        .torrent-peers { font-size: 13px; color: var(--text-muted); }

        .quality-tag { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 9px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; border: 1px solid transparent; flex-shrink: 0; white-space: nowrap; }
        .quality-4k     { background: rgba(232,160,48,0.18); color: var(--accent);  border-color: rgba(232,160,48,0.45); }
        .quality-bluray { background: rgba(80,130,220,0.18); color: #6a9eed;        border-color: rgba(80,130,220,0.45); }
        .quality-webdl  { background: rgba(62,207,142,0.15); color: var(--green);   border-color: rgba(62,207,142,0.40); }
        .quality-webrip { background: rgba(62,207,142,0.08); color: var(--green);   border-color: rgba(62,207,142,0.25); }
        .quality-cam, .quality-ts { background: rgba(220,80,80,0.15);  color: var(--red);  border-color: rgba(220,80,80,0.40); }
        .quality-unknown{ background: var(--surface2); color: var(--text-muted); border-color: var(--border); }
        .spanish-audio-tag { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 9px; font-weight: 700; letter-spacing: 0.05em; background: rgba(168,85,247,0.18); color: #c084fc; border: 1px solid rgba(168,85,247,0.5); flex-shrink: 0; }
        .preset-match-tag { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 9px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; background: rgba(168,85,247,0.20); color: #c084fc; border: 1px solid rgba(168,85,247,0.6); flex-shrink: 0; white-space: nowrap; }
        .type-tag {
          display: inline-block;
          padding: 1px 6px;
          border-radius: 3px;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          flex-shrink: 0;
          white-space: nowrap;
        }
        .type-pack { background: rgba(59,130,246,0.18); color: #6aa8f6; border: 1px solid rgba(59,130,246,0.5); }
        .type-ep   { background: var(--surface);        color: var(--text-muted); border: 1px solid var(--border); }
        .torrent-divider {
          grid-column: 1 / -1;
          padding: 10px 14px;
          background: var(--surface2);
          color: var(--text-muted);
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          border-top: 1px solid var(--border);
          border-bottom: 1px solid var(--border);
        }

        .ratio-pill { display: inline-flex; flex-direction: column; align-items: center; justify-content: center; padding: 2px 4px; border-radius: 6px; font-size: 10px; font-weight: 600; line-height: 1.15; text-align: center; border: 1px solid transparent; width: 100%; max-width: 52px; box-sizing: border-box; justify-self: start; }
        .ratio-line { white-space: nowrap; }
        .ratio-fast   { background: rgba(62,207,142,0.15); color: var(--green); border-color: rgba(62,207,142,0.4); }
        .ratio-decent { background: rgba(232,160,48,0.12); color: var(--accent); border-color: rgba(232,160,48,0.4); }
        .ratio-slow   { background: rgba(220,80,80,0.12); color: var(--red); border-color: rgba(220,80,80,0.4); }

        .download-btn { background: var(--accent); color: #000; padding: 5px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; display: flex; align-items: center; gap: 4px; white-space: nowrap; }
        .download-btn:hover { background: #f0b040; }
        .download-btn:disabled { opacity: 0.5; cursor: wait; }

        @media (max-width: 768px) {
          .modal-backdrop { padding: 0; }
          .modal { border-radius: 0; border: none; max-width: 100%; max-height: 100vh; height: 100vh; width: 100vw; }
          .modal-expanded { max-width: 100%; }
          .modal-expand { display: none; }
          .modal-close { top: max(14px, env(safe-area-inset-top)); right: 14px; width: 44px; height: 44px; }
          .modal-hero-content { flex-direction: column; align-items: center; text-align: center; padding: 24px 16px; padding-top: max(56px, calc(env(safe-area-inset-top) + 56px)); }
          .modal-hero { border-radius: 0; }
          .trailer-embed { margin: 0 0 16px; border-radius: 0; border-left: 0; border-right: 0; }
          .trailer-close { top: max(8px, env(safe-area-inset-top)); }
          .modal-poster { width: 140px; min-width: 0; }
          .modal-title { font-size: 1.5rem; }
          .modal-body { padding: 18px 16px 28px; }
          .episode-row { grid-template-columns: 100px 1fr auto; gap: 10px; padding: 10px; }
          .episode-thumb { width: 100px; }
          .torrent-header { display: none; }
          .torrent-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; padding: 12px; background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; margin-bottom: 8px; }
          .torrent-name { flex: 1 1 100%; font-size: 13px; }
          .torrent-name-text { white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
          .ratio-pill { margin-left: auto; max-width: 56px; }
          .download-btn { flex: 1 1 100%; margin-top: 6px; justify-content: center; padding: 11px 16px; min-height: 44px; }
        }
      `}</style>
    </div>
  )
}
