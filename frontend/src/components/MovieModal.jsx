import { useState, useEffect } from 'react'
import { X, Download, Search, ExternalLink, Check } from 'lucide-react'
import { getMovieDetail, searchTorrents, addTorrent, refreshPlex } from '../api'

function formatSize(bytes) {
  if (!bytes) return '?'
  const gb = bytes / 1024 / 1024 / 1024
  return gb >= 1 ? `${gb.toFixed(2)} GB` : `${(bytes / 1024 / 1024).toFixed(0)} MB`
}

export default function MovieModal({ movie, onClose }) {
  const [detail, setDetail] = useState(null)
  const [torrents, setTorrents] = useState([])
  const [searchQuery, setSearchQuery] = useState(movie.title)
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    getMovieDetail(movie.id).then(r => setDetail(r.data))
    handleSearch()
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
      alert('Failed to add torrent. Check qBittorrent connection.')
    }
    setDownloading(null)
  }

  const year = movie.release_date?.split('-')[0]
  const trailer = detail?.trailer

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
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
          </div>

          {done && (
            <div className="success-banner">
              <Check size={16} /> Added to qBittorrent — Plex will update when download finishes
            </div>
          )}

          {loading ? (
            <div className="torrent-loading">Searching indexers...</div>
          ) : torrents.length === 0 ? (
            <div className="torrent-empty">No results found. Try editing the search above.</div>
          ) : (
            <div className="torrent-list">
              <div className="torrent-header">
                <span>Title</span>
                <span>Size</span>
                <span>Seeds</span>
                <span>Source</span>
                <span></span>
              </div>
              {torrents.map((t, i) => (
                <div key={i} className="torrent-row">
                  <span className="torrent-name">{t.title}</span>
                  <span className="torrent-size">{formatSize(t.size)}</span>
                  <span className="torrent-seeds" style={{color: t.seeders > 10 ? 'var(--green)' : t.seeders > 0 ? 'var(--accent)' : 'var(--red)'}}>
                    {t.seeders}
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
              ))}
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
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 14px;
          width: 100%; max-width: 860px;
          max-height: 90vh;
          overflow-y: auto;
          position: relative;
        }
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
          grid-template-columns: 1fr 80px 60px 100px 70px;
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
          grid-template-columns: 1fr 80px 60px 100px 70px;
          gap: 8px;
          padding: 11px 14px;
          border-top: 1px solid var(--border);
          align-items: center;
          font-size: 13px;
          transition: background 0.15s;
        }
        .torrent-row:hover { background: var(--surface2); }
        .torrent-name {
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .torrent-size, .torrent-indexer { color: var(--text-muted); font-size: 12px; }
        .torrent-seeds { font-weight: 600; font-size: 13px; }
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
      `}</style>
    </div>
  )
}
