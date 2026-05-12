import { useState, useEffect } from 'react'
import { Search } from 'lucide-react'
import HeroBanner from '../components/HeroBanner'
import ContentRow from '../components/ContentRow'
import DownloadQueue from '../components/DownloadQueue'
import MovieModal from '../components/MovieModal'
import {
  getTrending, getTrendingDay, getNowPlaying, getByGenre,
  getBecauseYouDownloaded, getFreshRips, searchMovies, getMovieDetail,
} from '../api'

const BROWSE_GENRES = [
  { id: 28, label: 'Action' },
  { id: 35, label: 'Comedy' },
  { id: 27, label: 'Horror' },
  { id: 53, label: 'Thriller' },
  { id: 878, label: 'Sci-Fi' },
  { id: 18, label: 'Drama' },
  { id: 16, label: 'Animation' },
  { id: 10749, label: 'Romance' },
  { id: 14, label: 'Fantasy' },
  { id: 99, label: 'Documentary' },
]

export default function Browse() {
  const [trendingDay, setTrendingDay] = useState(null)
  const [selectedMovie, setSelectedMovie] = useState(null)
  const [becauseRows, setBecauseRows] = useState([])
  const [searchQ, setSearchQ] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [searchResults, setSearchResults] = useState([])

  // Eagerly load trending/day for the hero — needed immediately.
  useEffect(() => {
    getTrendingDay().then(r => setTrendingDay(r.data))
    getBecauseYouDownloaded(2).then(r => setBecauseRows(r.data || []))
  }, [])

  async function openMovie(stub) {
    // ContentRow gives us a trimmed movie; for the modal, fetch full detail so overview/runtime/genres are present.
    if (stub.id) {
      try {
        const r = await getMovieDetail(stub.id)
        setSelectedMovie({ ...stub, ...r.data })
      } catch {
        setSelectedMovie(stub)
      }
    } else {
      setSelectedMovie(stub)
    }
  }

  async function handleSearch(e) {
    e?.preventDefault()
    if (!searchQ.trim()) { setIsSearching(false); return }
    setIsSearching(true)
    const r = await searchMovies(searchQ)
    setSearchResults(r.data)
  }

  function clearSearch() {
    setSearchQ('')
    setIsSearching(false)
    setSearchResults([])
  }

  return (
    <div className="browse">
      <HeroBanner movies={trendingDay || []} onOpen={openMovie} />

      <div className="browse-search">
        <form className="search-form" onSubmit={handleSearch}>
          <Search size={18} className="search-icon" />
          <input
            className="search-input"
            placeholder="Search any movie..."
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
          />
          {isSearching && (
            <button type="button" className="search-clear" onClick={clearSearch}>✕</button>
          )}
          <button type="submit" className="search-submit">Search</button>
        </form>
      </div>

      <div className="browse-queue"><DownloadQueue /></div>

      {isSearching ? (
        <div className="browse-search-results">
          <h2 className="row-title" style={{padding: '0 5%', marginBottom: 16}}>
            Search results
          </h2>
          <div className="search-grid">
            {searchResults.map((m, i) => (
              <div key={`${m.id}-${i}`} className="search-card" onClick={() => openMovie(m)}>
                {m.poster_url ? <img src={m.poster_url} alt={m.title} /> :
                  <div className="search-card-fallback">{m.title}</div>}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          <ContentRow
            title="Top 10 Today"
            variant="top10"
            preloaded={trendingDay}
            fetcher={null}
            onOpen={openMovie}
          />
          <ContentRow
            title="Trending Now"
            fetcher={() => getTrending()}
            onOpen={openMovie}
          />
          <ContentRow
            title="Fresh Rips 🔥"
            subtitle="Quality digital rips that just became available"
            fetcher={() => getFreshRips()}
            onOpen={openMovie}
          />
          <ContentRow
            title="New Releases"
            fetcher={() => getNowPlaying()}
            onOpen={openMovie}
          />

          {becauseRows.map((row, i) => (
            <ContentRow
              key={`because-${row.seed.tmdb_id}`}
              title={`Because you have ${row.seed.title}`}
              variant="recommendation"
              preloaded={row.recommendations}
              fetcher={null}
              onOpen={openMovie}
            />
          ))}

          {BROWSE_GENRES.map(g => (
            <ContentRow
              key={`genre-${g.id}`}
              title={g.label}
              fetcher={() => getByGenre(g.id)}
              onOpen={openMovie}
            />
          ))}
        </>
      )}

      {selectedMovie && (
        <MovieModal movie={selectedMovie} onClose={() => setSelectedMovie(null)} />
      )}

      <style>{`
        .browse { padding-bottom: 60px; }
        .browse-search { padding: 0 5%; margin-bottom: 12px; }
        .browse-search .search-form {
          display: flex; align-items: center; gap: 8px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 10px 14px;
        }
        .browse-search .search-form:focus-within { border-color: var(--accent); }
        .browse-search .search-icon { color: var(--text-muted); flex-shrink: 0; }
        .browse-search .search-input {
          flex: 1; background: transparent;
          border: none; outline: none;
          color: var(--text); font-size: 15px;
        }
        .browse-search .search-clear {
          background: transparent; color: var(--text-muted);
          padding: 2px 6px; border-radius: 4px;
        }
        .browse-search .search-clear:hover { color: var(--text); }
        .browse-search .search-submit {
          background: var(--accent); color: #000;
          padding: 6px 16px; border-radius: 6px;
          font-size: 13px; font-weight: 600;
        }
        .browse-queue { padding: 0 5%; margin-bottom: 24px; }
        .browse-search-results { padding-top: 20px; }
        .search-grid {
          padding: 0 5%;
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
          gap: 12px;
        }
        .search-card {
          aspect-ratio: 2/3;
          border-radius: 6px;
          overflow: hidden;
          cursor: pointer;
          background: var(--surface2);
          transition: transform 0.15s;
        }
        .search-card:hover { transform: scale(1.04); }
        .search-card img { width: 100%; height: 100%; object-fit: cover; }
        .search-card-fallback {
          width: 100%; height: 100%;
          display: flex; align-items: center; justify-content: center;
          padding: 10px; text-align: center;
          color: var(--text-muted); font-size: 12px;
        }
        @media (max-width: 768px) {
          .browse-search, .browse-queue { padding: 0 16px; }
          .search-grid { padding: 0 16px; grid-template-columns: repeat(3, 1fr); gap: 10px; }
        }
        @media (max-width: 480px) {
          .search-grid { grid-template-columns: repeat(2, 1fr); gap: 8px; }
          .browse-search .search-input { font-size: 14px; }
          .browse-search .search-submit { padding: 6px 12px; }
        }
      `}</style>
    </div>
  )
}
