import { useState, useEffect, useMemo } from 'react'
import {
  X, Download, Search, Play, Check, AlertTriangle,
  Maximize2, Minimize2, Folder,
} from 'lucide-react'
import { getTVDetail, getTVSeason, searchTVTorrents, addTVTorrent } from '../api'

// Default API map; AnimeModal passes anime-specific endpoints via `api` prop.
const DEFAULT_API = {
  getDetail: getTVDetail,
  getSeason: getTVSeason,
  searchTorrents: searchTVTorrents,
  addTorrent: addTVTorrent,
}
import AutoDownloadButton from './AutoDownloadButton'
import TorrentDetailPanel from './TorrentDetailPanel'
import { TorrentControls, TorrentList } from './TorrentList'
import { isSeasonPack } from '../torrentScoring'
import useTorrentView from '../useTorrentView'
import './torrentModal.css'

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
  const [searchQuery, setSearchQuery] = useState(show.title)
  const [expanded, setExpanded] = useState(false)
  const [trailerOpen, setTrailerOpen] = useState(false)
  const [detailTorrent, setDetailTorrent] = useState(null)

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
      const yearStr = (show.release_date || show.first_air_date || detail?.first_air_date || '').slice(0, 4)
      const r = await api.searchTorrents(searchQuery, season, episode, yearStr || undefined)
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

  const {
    filterText, setFilterText, sortKey, setSortKey,
    spanishOnly, setSpanishOnly, prefs, prefsOn,
    bestPicks, pickTitleMap, visibleTorrents, showLowQualityWarning,
  } = useTorrentView(torrents, scoringContext)

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
                  <span className={`tag ${detail?.library_progress?.complete ? 'tag-green' : 'tag-accent'}`}>
                    <Check size={12}/>
                    {detail?.library_progress?.complete
                      ? 'Complete'
                      : detail?.library_progress
                        ? `${detail.library_progress.episodes_in_library_count}/${detail.library_progress.total_episodes} eps`
                        : 'In Library'}
                  </span>
                )}
              </div>
              {detail?.library_progress && detail.library_progress.total_episodes > 0 && !detail.library_progress.complete && (
                <div className="library-progress-bar" title={`${detail.library_progress.episodes_in_library_count} of ${detail.library_progress.total_episodes} episodes in library`}>
                  <div
                    className="library-progress-fill"
                    style={{ width: `${Math.round(100 * detail.library_progress.episodes_in_library_count / detail.library_progress.total_episodes)}%` }}
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
                  const progress = detail?.library_progress
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
                {detail?.library_episodes?.[String(selectedSeason)] && (
                  <span className="library-have">
                    Library already has {detail.library_episodes[String(selectedSeason)].length} episode{detail.library_episodes[String(selectedSeason)].length === 1 ? '' : 's'}
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
                  className="torrent-search"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && scope.season != null) {
                      fetchTorrents(scope.season, scope.episode)
                    }
                  }}
                  placeholder="Search torrents..."
                />
                <button
                  className="search-btn"
                  onClick={() => scope.season != null && fetchTorrents(scope.season, scope.episode)}
                  title="Re-search with this query"
                >
                  <Search size={16} />
                </button>
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
                  <Check size={16} /> {doneMsg} — Jellyfin TV library will refresh when download finishes
                </div>
              )}

              {(() => {
                const sn = scope.season ?? selectedSeason
                const pp = detail?.library_progress
                const epInLibrary = scope.episode != null
                  && (detail?.library_episodes?.[String(sn)] || detail?.library_episodes?.[sn] || []).includes(scope.episode)
                if (epInLibrary) {
                  return (
                    <div className="dupe-warning">
                      <AlertTriangle size={16} className="dupe-warning-icon" />
                      <span>S{sn}E{scope.episode} is already in your Jellyfin library. Downloading will use additional storage.</span>
                    </div>
                  )
                }
                if (pp?.complete) {
                  return (
                    <div className="dupe-warning">
                      <AlertTriangle size={16} className="dupe-warning-icon" />
                      <span>The full series is already in your Jellyfin library.</span>
                    </div>
                  )
                }
                if (pp?.seasons_complete?.includes(sn)) {
                  return (
                    <div className="dupe-warning">
                      <AlertTriangle size={16} className="dupe-warning-icon" />
                      <span>All episodes from Season {sn} are already in your Jellyfin library.</span>
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

              <TorrentControls
                sortKey={sortKey} setSortKey={setSortKey}
                spanishOnly={spanishOnly} setSpanishOnly={setSpanishOnly}
              />

              {torrentLoading ? (
                <div className="torrent-loading">Searching indexers...</div>
              ) : visibleTorrents.length === 0 ? (
                <div className="torrent-empty">No results found.</div>
              ) : (() => {
                // In season-search mode, partition into packs + episodes
                // (packs first, then "Individual Episodes" divider, then eps).
                // Best Picks stay pinned at absolute top regardless.
                const seasonSearchMode = scoringContext.isSeasonSearch
                let sections
                if (seasonSearchMode) {
                  const pinned = []
                  const remainder = []
                  for (const t of visibleTorrents) {
                    if (pickTitleMap.has(t.title)) pinned.push(t)
                    else remainder.push(t)
                  }
                  const packs = remainder.filter(t => isSeasonPack(t.title))
                  const eps   = remainder.filter(t => !isSeasonPack(t.title))
                  sections = [
                    { items: pinned },
                    { items: packs },
                    ...(eps.length > 0
                      ? [{ label: `Individual Episodes (${eps.length})`, items: eps }]
                      : []),
                  ]
                } else {
                  sections = [{ items: visibleTorrents }]
                }
                return (
                  <TorrentList
                    sections={sections}
                    scoringContext={scoringContext}
                    pickTitleMap={pickTitleMap}
                    prefs={prefs}
                    prefsOn={prefsOn}
                    selectedTitle={detailTorrent?.title}
                    downloadingTitle={downloading}
                    onSelect={setDetailTorrent}
                    onDownload={handleAdd}
                    extraTags={t => (
                      <span className={`type-tag ${isSeasonPack(t.title) ? 'type-pack' : 'type-ep'}`}>
                        {isSeasonPack(t.title) ? 'Season Pack' : 'Episode'}
                      </span>
                    )}
                  />
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

      {/* Shared modal/torrent styles live in ./torrentModal.css.
          TV-only rules below: seasons/episodes UI, scope chip, save hint,
          pack/episode tags, plus the intentional search-row override. */}
      <style>{`
        .tag-accent { background: rgba(232,160,48,0.15); border-color: var(--accent); color: var(--accent); }
        .library-progress-bar {
          width: 100%;
          max-width: 320px;
          height: 6px;
          background: var(--border);
          border-radius: 3px;
          overflow: hidden;
          margin: 6px 0 10px;
        }
        .library-progress-fill {
          height: 100%;
          background: var(--accent);
          transition: width 0.4s ease;
        }

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
        .library-have { font-size: 12px; color: var(--green); }
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

        .scope-chip { font-size: 12px; color: var(--text-muted); padding: 6px 10px; background: var(--surface2); border: 1px solid var(--border); border-radius: 6px; }
        .scope-label { color: var(--text-muted); margin-right: 4px; }
        .save-hint { font-size: 11px; color: var(--text-muted); margin-bottom: 12px; display: flex; align-items: center; gap: 6px; }
        .save-hint code { background: var(--surface2); padding: 1px 6px; border-radius: 3px; font-size: 11px; color: var(--text); }
        .empty-hint { font-size: 13px; color: var(--text-muted); padding: 12px 14px; background: var(--surface2); border: 1px dashed var(--border); border-radius: var(--radius); }

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

        /* Intentional divergence from the shared search-row base: TV's row
           also holds the scope chip, so the inputs flex and wrap instead of
           movie's fixed-width filter. */
        .search-row { align-items: center; flex-wrap: wrap; margin-bottom: 8px; }
        .torrent-search { flex: 2 1 240px; }
        .torrent-filter { flex: 1; width: auto; min-width: 200px; padding: 10px 14px; }

        @media (max-width: 768px) {
          .episode-row { grid-template-columns: 100px 1fr auto; gap: 10px; padding: 10px; }
          .episode-thumb { width: 100px; }
          /* Re-assert the shared mobile layout over the desktop override above
             (this style tag loads after torrentModal.css, so it would win). */
          .torrent-search { flex: 1 1 70%; }
          .torrent-filter { flex: 1 1 100%; width: 100%; min-width: 0; }
        }
      `}</style>

      {detailTorrent && (
        <TorrentDetailPanel
          torrent={detailTorrent}
          context={scoringContext}
          onClose={() => setDetailTorrent(null)}
          onDownload={(t) => { handleAdd(t); setDetailTorrent(null) }}
        />
      )}
    </div>
  )
}
