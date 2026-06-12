import { useState, useEffect, useMemo } from 'react'
import { X, Search, Play, Check, AlertTriangle, Maximize2, Minimize2 } from 'lucide-react'
import { getMovieDetail, searchTorrents, addTorrent, refreshPlex } from '../api'
import AutoDownloadButton from './AutoDownloadButton'
import TorrentDetailPanel from './TorrentDetailPanel'
import { TorrentControls, TorrentList } from './TorrentList'
import useTorrentView from '../useTorrentView'
import './torrentModal.css'

// Backend tags each torrent with _match: year_match | no_year | other_year.
// A different 4-digit year usually means a sequel/remake/other edition: rows
// are hidden unless the user hits the showAll toggle, and Best Pick badges
// never go to them — a badge always means "best for the movie you searched".
const isOtherYear = (t) => t._match === 'other_year'

export default function MovieModal({ movie, onClose }) {
  const [detail, setDetail] = useState(null)
  const [torrents, setTorrents] = useState([])
  const [searchQuery, setSearchQuery] = useState(movie.title)
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(null)
  const [done, setDone] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [trailerOpen, setTrailerOpen] = useState(false)
  const [detailTorrent, setDetailTorrent] = useState(null)

  const scoringContext = useMemo(
    () => ({ mode: 'movie', runtimeMin: detail?.runtime || null }),
    [detail?.runtime]
  )

  const {
    filterText, setFilterText, sortKey, setSortKey,
    spanishOnly, setSpanishOnly, prefs, prefsOn,
    scored, bestPicks, pickTitleMap, visibleTorrents, showLowQualityWarning,
  } = useTorrentView(torrents, scoringContext, {
    excludeFromView: showAll ? null : isOtherYear,
    excludeFromPicks: isOtherYear,
  })

  const hiddenCount = useMemo(
    () => scored.filter(isOtherYear).length,
    [scored]
  )

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
      // Pass the release year so Prowlarr results matching it sort to the top
      // (filters out e.g. "Wolf of Wall Street" when searching for WALL-E).
      const year = (movie.release_date || '').slice(0, 4) || undefined
      const r = await searchTorrents(searchQuery, year)
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
              <div className="hero-action-row">
                {trailer && !trailerOpen && (
                  <button className="trailer-btn" onClick={() => setTrailerOpen(true)}>
                    <Play size={14} fill="currentColor" /> Play Trailer
                  </button>
                )}
                <AutoDownloadButton
                  id={movie.id}
                  type="movie"
                  title={movie.title}
                  release_date={movie.release_date}
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

          {movie.in_library && (
            <div className="dupe-warning">
              <AlertTriangle size={16} className="dupe-warning-icon" />
              <span>
                This movie is already in your Plex library. Downloading again will use
                additional storage.
              </span>
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
              <TorrentControls
                sortKey={sortKey} setSortKey={setSortKey}
                spanishOnly={spanishOnly} setSpanishOnly={setSpanishOnly}
              >
                {hiddenCount > 0 && (
                  <button
                    className={`sort-btn show-all-btn ${showAll ? 'active' : ''}`}
                    onClick={() => setShowAll(v => !v)}
                    title={showAll
                      ? 'Hide releases tagged as a different year (likely sequels or other editions)'
                      : 'These are releases whose title contains a different 4-digit year — likely sequels, remakes, or other editions'}
                  >
                    {showAll
                      ? 'Hide other editions'
                      : `${hiddenCount} hidden (different movie/edition) — show all`}
                  </button>
                )}
              </TorrentControls>

              {filterText && (
                <div className="filter-meta">
                  Showing {visibleTorrents.length} of {torrents.length} matching "{filterText}"
                </div>
              )}

              <TorrentList
                sections={[{ items: visibleTorrents }]}
                scoringContext={scoringContext}
                pickTitleMap={pickTitleMap}
                prefs={prefs}
                prefsOn={prefsOn}
                selectedTitle={detailTorrent?.title}
                downloadingTitle={downloading}
                onSelect={setDetailTorrent}
                onDownload={handleDownload}
              />
            </>
          )}
        </div>
      </div>

      {/* Shared modal/torrent styles live in ./torrentModal.css.
          Movie-only rules below. */}
      <style>{`
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
        .filter-meta {
          font-size: 11px; color: var(--text-muted);
          margin-bottom: 8px;
        }
      `}</style>

      {detailTorrent && (
        <TorrentDetailPanel
          torrent={detailTorrent}
          context={scoringContext}
          onClose={() => setDetailTorrent(null)}
          onDownload={(t) => { handleDownload(t); setDetailTorrent(null) }}
        />
      )}
    </div>
  )
}
