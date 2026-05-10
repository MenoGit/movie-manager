import { useState, useEffect, useCallback } from 'react'
import { Search, Bookmark, BookmarkCheck, Tv } from 'lucide-react'
import MovieCard from '../components/MovieCard'
import MovieModal from '../components/MovieModal'
import DownloadQueue from '../components/DownloadQueue'
import {
  getTrending, getTopRated, getNowPlaying,
  getByGenre, getGenres, searchMovies, getRecentlyAdded
} from '../api'

const STREAMING_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 8, label: 'Netflix' },
  { id: 337, label: 'Disney+' },
  { id: 9, label: 'Prime' },
  { id: 384, label: 'Max' },
  { id: 15, label: 'Hulu' },
  { id: 2, label: 'Apple TV+' },
]

const TABS = [
  { id: 'trending', label: 'Trending' },
  { id: 'top_rated', label: 'Top Rated' },
  { id: 'now_playing', label: 'Now Playing' },
  { id: 'recently_added', label: 'Recently Added' },
]

export default function Home() {
  const [movies, setMovies] = useState([])
  const [tab, setTab] = useState('trending')
  const [streaming, setStreaming] = useState('all')
  const [genres, setGenres] = useState([])
  const [selectedGenre, setSelectedGenre] = useState(null)
  const [searchQ, setSearchQ] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [selectedMovie, setSelectedMovie] = useState(null)
  const [watchlist, setWatchlist] = useState(() => {
    try { return JSON.parse(localStorage.getItem('watchlist') || '[]') } catch { return [] }
  })
  const [showWatchlist, setShowWatchlist] = useState(false)

  useEffect(() => { getGenres().then(r => setGenres(r.data)) }, [])

  useEffect(() => {
    if (isSearching) return
    fetchMovies()
  }, [tab, selectedGenre])

  async function fetchMovies() {
    let data = []
    try {
      if (selectedGenre) {
        data = (await getByGenre(selectedGenre)).data
      } else if (tab === 'trending') {
        data = (await getTrending()).data
      } else if (tab === 'top_rated') {
        data = (await getTopRated()).data
      } else if (tab === 'now_playing') {
        data = (await getNowPlaying()).data
      } else if (tab === 'recently_added') {
        const r = (await getRecentlyAdded()).data
        // Format Plex items to look like TMDb
        data = r.map(p => ({
          id: null,
          title: p.title,
          poster_url: p.thumb ? `${import.meta.env.VITE_API_URL || ''}/plex-image${p.thumb}` : null,
          vote_average: p.rating,
          release_date: p.year?.toString(),
          in_library: true,
        }))
      }
    } catch (e) {
      console.error(e)
    }
    setMovies(data)
  }

  async function handleSearch(e) {
    e?.preventDefault()
    if (!searchQ.trim()) { setIsSearching(false); fetchMovies(); return }
    setIsSearching(true)
    const r = await searchMovies(searchQ)
    setMovies(r.data)
  }

  function clearSearch() {
    setSearchQ('')
    setIsSearching(false)
    fetchMovies()
  }

  function toggleWatchlist(movie) {
    const existing = watchlist.find(m => m.id === movie.id)
    const updated = existing
      ? watchlist.filter(m => m.id !== movie.id)
      : [...watchlist, movie]
    setWatchlist(updated)
    localStorage.setItem('watchlist', JSON.stringify(updated))
  }

  const displayMovies = showWatchlist ? watchlist : movies
  const filteredMovies = streaming === 'all'
    ? displayMovies
    : displayMovies.filter(m =>
        m.streaming_services?.some(s => s.provider_id === streaming)
      )

  return (
    <div className="home">
      {/* Search Bar */}
      <div className="search-container">
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

      {/* Download Queue */}
      <DownloadQueue />

      {/* Tabs */}
      {!isSearching && (
        <div className="tabs">
          {TABS.map(t => (
            <button
              key={t.id}
              className={`tab ${tab === t.id && !showWatchlist ? 'active' : ''}`}
              onClick={() => { setTab(t.id); setShowWatchlist(false); setSelectedGenre(null) }}
            >
              {t.label}
            </button>
          ))}
          <button
            className={`tab ${showWatchlist ? 'active' : ''}`}
            onClick={() => setShowWatchlist(v => !v)}
          >
            <Bookmark size={14} /> Watchlist {watchlist.length > 0 && `(${watchlist.length})`}
          </button>
        </div>
      )}

      {/* Genre filter */}
      {!isSearching && !showWatchlist && (
        <div className="genre-scroll">
          <button
            className={`genre-btn ${!selectedGenre ? 'active' : ''}`}
            onClick={() => setSelectedGenre(null)}
          >
            All Genres
          </button>
          {genres.map(g => (
            <button
              key={g.id}
              className={`genre-btn ${selectedGenre === g.id ? 'active' : ''}`}
              onClick={() => setSelectedGenre(g.id)}
            >
              {g.name}
            </button>
          ))}
        </div>
      )}

      {/* Streaming filter */}
      <div className="streaming-filters">
        {STREAMING_FILTERS.map(s => (
          <button
            key={s.id}
            className={`streaming-btn ${streaming === s.id ? 'active' : ''}`}
            onClick={() => setStreaming(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="movie-grid">
        {filteredMovies.map((movie, i) => (
          <div key={movie.id || i} className="movie-card-wrapper">
            <MovieCard movie={movie} onClick={setSelectedMovie} />
            {movie.id && (
              <button
                className={`watchlist-btn ${watchlist.find(m => m.id === movie.id) ? 'saved' : ''}`}
                onClick={(e) => { e.stopPropagation(); toggleWatchlist(movie) }}
                title="Add to watchlist"
              >
                {watchlist.find(m => m.id === movie.id) ? <BookmarkCheck size={14}/> : <Bookmark size={14}/>}
              </button>
            )}
          </div>
        ))}
      </div>

      {selectedMovie && (
        <MovieModal movie={selectedMovie} onClose={() => setSelectedMovie(null)} />
      )}

      <style>{`
        .home { padding: 24px; max-width: 1400px; margin: 0 auto; }
        .search-container { margin-bottom: 24px; }
        .search-form {
          display: flex; align-items: center; gap: 8px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 10px 14px;
          transition: border-color 0.2s;
        }
        .search-form:focus-within { border-color: var(--accent); }
        .search-icon { color: var(--text-muted); flex-shrink: 0; }
        .search-input {
          flex: 1; background: transparent;
          border: none; outline: none;
          color: var(--text); font-size: 15px;
        }
        .search-clear {
          background: transparent; color: var(--text-muted);
          font-size: 14px; padding: 2px 6px; border-radius: 4px;
        }
        .search-clear:hover { color: var(--text); }
        .search-submit {
          background: var(--accent); color: #000;
          padding: 6px 16px; border-radius: 6px;
          font-size: 13px; font-weight: 600;
        }
        .search-submit:hover { background: #f0b040; }
        .tabs { display: flex; gap: 4px; margin-bottom: 16px; flex-wrap: wrap; }
        .tab {
          background: transparent;
          border: 1px solid var(--border);
          color: var(--text-muted);
          padding: 7px 16px; border-radius: 6px;
          font-size: 13px; font-weight: 500;
          display: flex; align-items: center; gap: 6px;
          transition: all 0.2s;
        }
        .tab:hover { border-color: var(--accent); color: var(--accent); }
        .tab.active { background: var(--accent); border-color: var(--accent); color: #000; }
        .genre-scroll {
          display: flex; gap: 6px; overflow-x: auto;
          padding-bottom: 8px; margin-bottom: 12px;
          scrollbar-width: none;
        }
        .genre-scroll::-webkit-scrollbar { display: none; }
        .genre-btn {
          background: transparent; border: 1px solid var(--border);
          color: var(--text-muted); white-space: nowrap;
          padding: 5px 12px; border-radius: 20px;
          font-size: 12px; transition: all 0.2s;
        }
        .genre-btn:hover, .genre-btn.active {
          border-color: var(--accent); color: var(--accent);
          background: rgba(232,160,48,0.08);
        }
        .streaming-filters {
          display: flex; gap: 6px; margin-bottom: 20px; flex-wrap: wrap;
        }
        .streaming-btn {
          background: var(--surface); border: 1px solid var(--border);
          color: var(--text-muted);
          padding: 5px 14px; border-radius: 6px;
          font-size: 12px; font-weight: 500;
          transition: all 0.2s;
        }
        .streaming-btn:hover { border-color: var(--border); color: var(--text); }
        .streaming-btn.active { border-color: var(--accent); color: var(--accent); background: rgba(232,160,48,0.08); }
        .movie-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
          gap: 16px;
        }
        .movie-card-wrapper { position: relative; }
        .watchlist-btn {
          position: absolute; bottom: 48px; right: 8px;
          background: rgba(10,10,15,0.75);
          border: 1px solid var(--border);
          color: var(--text-muted);
          width: 28px; height: 28px;
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          transition: all 0.2s;
          backdrop-filter: blur(4px);
        }
        .watchlist-btn:hover, .watchlist-btn.saved {
          color: var(--accent); border-color: var(--accent);
          background: rgba(232,160,48,0.15);
        }
      `}</style>
    </div>
  )
}
