import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, Bookmark, BookmarkCheck, X as XIcon, SlidersHorizontal } from 'lucide-react'
import MovieCard from '../components/MovieCard'
import MovieModal from '../components/MovieModal'
import DownloadQueue from '../components/DownloadQueue'
import {
  getTrending, getTopRated, getNowPlaying, getPopular, getUpcoming,
  getAllTimeBest, getHiddenGems, getByDecade, getDateNight, getOscarWinners,
  getByStreaming, getByGenre, getGenres, searchMovies, getRecentlyAdded,
  getFreshRips,
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
  { id: 'popular', label: 'Popular' },
  { id: 'fresh_rips', label: 'Fresh Rips 🔥' },
  { id: 'top_rated', label: 'Top Rated' },
  { id: 'now_playing', label: 'Now Playing' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'all_time_best', label: 'All Time Best' },
  { id: 'hidden_gems', label: 'Hidden Gems' },
  { id: 'oscar_winners', label: 'Oscar Winners' },
  { id: 'date_night', label: 'Date Night' },
  { id: 'decades', label: 'Decades' },
  { id: 'recently_added', label: 'Recently Added' },
]

const QUICK_GENRES = [
  { id: 28, label: 'Action' },
  { id: 35, label: 'Comedy' },
  { id: 27, label: 'Horror' },
  { id: 53, label: 'Thriller' },
]

const DECADES = ['70s', '80s', '90s', '00s', '10s', '20s']

const PAGE_SIZE = 20

const SORT_OPTIONS = [
  { id: 'default', label: 'Popularity', tmdb: null },
  { id: 'vote_average.desc', label: 'Rating ↓', tmdb: 'vote_average.desc' },
  { id: 'primary_release_date.desc', label: 'Newest', tmdb: 'primary_release_date.desc' },
  { id: 'primary_release_date.asc', label: 'Oldest', tmdb: 'primary_release_date.asc' },
  { id: 'revenue.desc', label: 'Revenue ↓', tmdb: 'revenue.desc' },
]

const RATING_OPTIONS = [
  { id: 0, label: 'Any' },
  { id: 7, label: '7+' },
  { id: 8, label: '8+' },
  { id: 9, label: '9+' },
]

const YEAR_PRESETS = [
  { id: 'all', label: 'All Time', from: null, to: null },
  { id: '2020s', label: '2020s', from: 2020, to: 2029 },
  { id: '2010s', label: '2010s', from: 2010, to: 2019 },
  { id: '2000s', label: '2000s', from: 2000, to: 2009 },
  { id: '90s', label: '90s', from: 1990, to: 1999 },
  { id: '80s', label: '80s', from: 1980, to: 1989 },
]

const DEFAULT_FILTERS = {
  sortBy: 'default',
  minRating: 0,
  yearPreset: 'all',  // tracks which preset is active for UI; emits yearFrom/yearTo
  includeAdult: false,
}

function effectiveYearRange(preset) {
  return YEAR_PRESETS.find(p => p.id === preset) || YEAR_PRESETS[0]
}

function filterPayload(f) {
  // Convert UI filter state to the shape api.js expects
  const yr = effectiveYearRange(f.yearPreset)
  return {
    sortBy: f.sortBy,
    minRating: f.minRating,
    yearFrom: yr.from,
    yearTo: yr.to,
    includeAdult: f.includeAdult,
  }
}

function countActiveFilters(f) {
  let n = 0
  if (f.sortBy !== 'default') n++
  if (f.minRating > 0) n++
  if (f.yearPreset !== 'all') n++
  if (f.includeAdult) n++
  return n
}

export default function Home() {
  const [movies, setMovies] = useState([])
  const [tab, setTab] = useState('trending')
  const [streaming, setStreaming] = useState('all')
  const [genres, setGenres] = useState([])
  const [selectedGenre, setSelectedGenre] = useState(null)
  const [selectedDecade, setSelectedDecade] = useState(null)
  const [searchQ, setSearchQ] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [selectedMovie, setSelectedMovie] = useState(null)
  const [watchlist, setWatchlist] = useState(() => {
    try { return JSON.parse(localStorage.getItem('watchlist') || '[]') } catch { return [] }
  })
  const [showWatchlist, setShowWatchlist] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const sentinelRef = useRef(null)
  const tabsRef = useRef(null)
  const requestSeq = useRef(0)

  const activeFilterCount = countActiveFilters(filters)

  // Scroll active tab into view (mobile)
  useEffect(() => {
    if (!tabsRef.current) return
    const active = tabsRef.current.querySelector('.tab.active')
    if (active && active.scrollIntoView) {
      active.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
    }
  }, [tab, showWatchlist])

  useEffect(() => { getGenres().then(r => setGenres(r.data)) }, [])

  // Build a "context" key from anything that determines what we're fetching.
  // Whenever it changes, reset paging and refetch from page 1.
  const contextKey = `${tab}|${streaming}|${selectedGenre}|${selectedDecade}|${showWatchlist}|${isSearching}|${filters.sortBy}|${filters.minRating}|${filters.yearPreset}|${filters.includeAdult}`

  useEffect(() => {
    if (isSearching || showWatchlist) return
    setMovies([])
    setPage(1)
    setHasMore(true)
    fetchPage(1, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextKey])

  // Returns the API call appropriate for current state, or null if no paging applies.
  function fetcherForCurrentContext(pageNum) {
    const f = filterPayload(filters)
    if (streaming !== 'all') return getByStreaming(streaming, pageNum, f)
    if (selectedDecade) return getByDecade(selectedDecade, pageNum, f)
    if (selectedGenre) return getByGenre(selectedGenre, pageNum, f)
    switch (tab) {
      case 'trending': return getTrending(pageNum, f)
      case 'popular': return getPopular(pageNum, f)
      case 'fresh_rips': return getFreshRips(pageNum, f)
      case 'top_rated': return getTopRated(pageNum, f)
      case 'now_playing': return getNowPlaying(pageNum, f)
      case 'upcoming': return getUpcoming(pageNum, f)
      case 'all_time_best': return getAllTimeBest(pageNum, f)
      case 'hidden_gems': return getHiddenGems(pageNum, f)
      case 'oscar_winners': return getOscarWinners(pageNum, f)
      case 'date_night': return getDateNight(pageNum, f)
      case 'decades': return null // sub-decade must be picked first
      case 'recently_added': return pageNum === 1 ? getRecentlyAdded() : null
      default: return null
    }
  }

  async function fetchPage(pageNum, append) {
    const fetcher = fetcherForCurrentContext(pageNum)
    if (!fetcher) { setHasMore(false); return }
    const seq = ++requestSeq.current
    setLoading(true)
    try {
      const r = await fetcher
      if (seq !== requestSeq.current) return // a newer fetch superseded this one
      let data = r.data || []
      if (tab === 'recently_added' && !selectedGenre && !selectedDecade && streaming === 'all') {
        // Plex shape, map to TMDb-ish
        data = data.map(p => ({
          id: null,
          title: p.title,
          poster_url: p.thumb ? `${import.meta.env.VITE_API_URL || ''}/plex-image${p.thumb}` : null,
          vote_average: p.rating,
          release_date: p.year?.toString(),
          in_library: true,
        }))
      }
      setMovies(prev => append ? [...prev, ...data] : data)
      setHasMore(data.length === PAGE_SIZE)
    } catch (e) {
      console.error(e)
      setHasMore(false)
    } finally {
      if (seq === requestSeq.current) setLoading(false)
    }
  }

  // IntersectionObserver for infinite scroll
  const loadMore = useCallback(() => {
    if (loading || !hasMore || isSearching || showWatchlist) return
    if (tab === 'decades' && !selectedDecade) return
    const next = page + 1
    setPage(next)
    fetchPage(next, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, hasMore, page, isSearching, showWatchlist, tab, selectedDecade])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) loadMore()
    }, { rootMargin: '400px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [loadMore])

  async function handleSearch(e) {
    e?.preventDefault()
    if (!searchQ.trim()) { setIsSearching(false); return }
    setIsSearching(true)
    setHasMore(false)
    const r = await searchMovies(searchQ)
    setMovies(r.data)
  }

  function clearSearch() {
    setSearchQ('')
    setIsSearching(false)
  }

  function switchTab(newTabId) {
    setTab(newTabId)
    setStreaming('all')
    setSelectedGenre(null)
    setSelectedDecade(null)
    setShowWatchlist(false)
    setIsSearching(false)
  }

  function pickGenre(id) {
    if (selectedGenre === id) {
      setSelectedGenre(null)
      return
    }
    setSelectedGenre(id)
    setSelectedDecade(null)
    setStreaming('all')
  }

  function pickDecade(d) {
    setSelectedDecade(d)
    setSelectedGenre(null)
    setStreaming('all')
  }

  function pickStreaming(id) {
    setStreaming(id)
    setSelectedGenre(null)
    setSelectedDecade(null)
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
  const showDecadePicker = !isSearching && !showWatchlist && tab === 'decades'

  return (
    <div className="home">
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

      <DownloadQueue />

      {!isSearching && (
        <div className="tabs" ref={tabsRef}>
          {TABS.map(t => (
            <button
              key={t.id}
              className={`tab ${tab === t.id && !showWatchlist && streaming === 'all' && !selectedGenre ? 'active' : ''}`}
              onClick={() => switchTab(t.id)}
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

      {showDecadePicker && (
        <div className="decade-row">
          {DECADES.map(d => (
            <button
              key={d}
              className={`decade-btn ${selectedDecade === d ? 'active' : ''}`}
              onClick={() => pickDecade(d)}
            >
              {d}
            </button>
          ))}
        </div>
      )}

      {!isSearching && !showWatchlist && (
        <div className="genre-scroll">
          <button
            className={`genre-btn ${!selectedGenre ? 'active' : ''}`}
            onClick={() => { setSelectedGenre(null); setSelectedDecade(null) }}
          >
            All Genres
          </button>
          {QUICK_GENRES.map(g => (
            <button
              key={`q-${g.id}`}
              className={`genre-btn ${selectedGenre === g.id ? 'active' : ''}`}
              onClick={() => pickGenre(g.id)}
            >
              {g.label}
            </button>
          ))}
          {genres
            .filter(g => !QUICK_GENRES.some(q => q.id === g.id))
            .map(g => (
              <button
                key={g.id}
                className={`genre-btn ${selectedGenre === g.id ? 'active' : ''}`}
                onClick={() => pickGenre(g.id)}
              >
                {g.name}
              </button>
            ))}
        </div>
      )}

      <div className="streaming-filters">
        {STREAMING_FILTERS.map(s => (
          <button
            key={s.id}
            className={`streaming-btn ${streaming === s.id ? 'active' : ''}`}
            onClick={() => pickStreaming(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {!isSearching && !showWatchlist && (
        <>
          <button
            className="filter-mobile-toggle"
            onClick={() => setFiltersOpen(v => !v)}
            aria-expanded={filtersOpen}
          >
            <SlidersHorizontal size={14} /> Filters
            {activeFilterCount > 0 && (
              <span className="filter-mobile-count">{activeFilterCount}</span>
            )}
          </button>
        <div className={`filter-toolbar ${filtersOpen ? 'open' : ''}`}>
          <div className="filter-group">
            <span className="filter-label"><SlidersHorizontal size={12} /> Sort</span>
            {SORT_OPTIONS.map(s => (
              <button
                key={s.id}
                className={`filter-btn ${filters.sortBy === s.id ? 'active' : ''}`}
                onClick={() => setFilters(f => ({ ...f, sortBy: s.id }))}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="filter-group">
            <span className="filter-label">Min Rating</span>
            {RATING_OPTIONS.map(r => (
              <button
                key={r.id}
                className={`filter-btn ${filters.minRating === r.id ? 'active' : ''}`}
                onClick={() => setFilters(f => ({ ...f, minRating: r.id }))}
              >
                {r.label}
              </button>
            ))}
          </div>

          <div className="filter-group">
            <span className="filter-label">Year</span>
            {YEAR_PRESETS.map(y => (
              <button
                key={y.id}
                className={`filter-btn ${filters.yearPreset === y.id ? 'active' : ''}`}
                onClick={() => setFilters(f => ({ ...f, yearPreset: y.id }))}
              >
                {y.label}
              </button>
            ))}
          </div>

          <div className="filter-group">
            <label className="adult-toggle">
              <input
                type="checkbox"
                checked={filters.includeAdult}
                onChange={e => setFilters(f => ({ ...f, includeAdult: e.target.checked }))}
              />
              Include adult
            </label>
          </div>

          {activeFilterCount > 0 && (
            <div className="filter-group filter-actions">
              <span className="filter-count">{activeFilterCount} active</span>
              <button
                className="filter-clear"
                onClick={() => setFilters(DEFAULT_FILTERS)}
              >
                <XIcon size={12} /> Clear
              </button>
            </div>
          )}
        </div>
        </>
      )}

      <div className="movie-grid">
        {displayMovies.map((movie, i) => (
          <div key={`${movie.id || 'p'}-${i}`} className="movie-card-wrapper">
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

      {!showWatchlist && !isSearching && (
        <div ref={sentinelRef} className="sentinel">
          {loading && <span className="sentinel-text">Loading…</span>}
          {!hasMore && displayMovies.length > 0 && <span className="sentinel-text">End of results</span>}
          {tab === 'decades' && !selectedDecade && <span className="sentinel-text">Pick a decade above</span>}
        </div>
      )}

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
        .decade-row {
          display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap;
        }
        .decade-btn {
          background: transparent; border: 1px solid var(--border);
          color: var(--text-muted);
          padding: 6px 18px; border-radius: 6px;
          font-size: 13px; font-weight: 600; letter-spacing: 0.5px;
          transition: all 0.2s;
        }
        .decade-btn:hover { border-color: var(--accent); color: var(--accent); }
        .decade-btn.active { background: var(--accent); border-color: var(--accent); color: #000; }
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
        .sentinel {
          height: 60px;
          display: flex; align-items: center; justify-content: center;
          color: var(--text-muted); font-size: 13px;
          margin-top: 16px;
        }
        .filter-toolbar {
          display: flex; flex-wrap: wrap; gap: 12px 24px;
          align-items: center;
          padding: 12px 14px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          margin-bottom: 20px;
        }
        .filter-group { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
        .filter-label {
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 10px; text-transform: uppercase;
          letter-spacing: 0.06em; color: var(--text-muted);
          margin-right: 6px;
        }
        .filter-btn {
          background: transparent;
          border: 1px solid var(--border);
          color: var(--text-muted);
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 12px;
          transition: all 0.15s;
        }
        .filter-btn:hover { border-color: var(--accent); color: var(--accent); }
        .filter-btn.active {
          background: var(--accent); border-color: var(--accent); color: #000;
          font-weight: 600;
        }
        .adult-toggle {
          display: inline-flex; align-items: center; gap: 6px;
          font-size: 12px; color: var(--text-muted);
          cursor: pointer;
          user-select: none;
        }
        .adult-toggle input { accent-color: var(--accent); }
        .filter-actions { margin-left: auto; }
        .filter-count {
          font-size: 11px;
          color: var(--accent);
          font-weight: 600;
          padding: 2px 8px;
          background: rgba(232,160,48,0.12);
          border: 1px solid rgba(232,160,48,0.4);
          border-radius: 10px;
        }
        .filter-clear {
          display: inline-flex; align-items: center; gap: 4px;
          background: transparent;
          border: 1px solid var(--border);
          color: var(--text-muted);
          padding: 4px 10px; border-radius: 6px;
          font-size: 12px;
          transition: all 0.15s;
        }
        .filter-clear:hover { border-color: var(--red); color: var(--red); }

        .filter-mobile-toggle {
          display: none;
          align-items: center;
          gap: 8px;
          background: var(--surface);
          border: 1px solid var(--border);
          color: var(--text);
          padding: 8px 14px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 500;
          margin-bottom: 12px;
          min-height: 40px;
        }
        .filter-mobile-toggle:hover { border-color: var(--accent); color: var(--accent); }
        .filter-mobile-count {
          background: var(--accent);
          color: #000;
          font-size: 11px;
          font-weight: 700;
          padding: 1px 6px;
          border-radius: 10px;
        }

        @media (max-width: 768px) {
          .home { padding: 16px 14px; }
          .tabs {
            flex-wrap: nowrap;
            overflow-x: auto;
            scroll-behavior: smooth;
            scrollbar-width: none;
            padding-bottom: 6px;
            margin-left: -14px; margin-right: -14px;
            padding-left: 14px; padding-right: 14px;
          }
          .tabs::-webkit-scrollbar { display: none; }
          .tab { white-space: nowrap; font-size: 12px; padding: 8px 14px; min-height: 36px; }
          .genre-scroll {
            margin-left: -14px; margin-right: -14px;
            padding-left: 14px; padding-right: 14px;
          }
          .genre-btn { padding: 6px 10px; font-size: 11px; min-height: 32px; }
          .streaming-filters {
            flex-wrap: nowrap;
            overflow-x: auto;
            scrollbar-width: none;
            margin-left: -14px; margin-right: -14px;
            padding: 0 14px 6px;
          }
          .streaming-filters::-webkit-scrollbar { display: none; }
          .streaming-btn { white-space: nowrap; font-size: 11px; padding: 6px 12px; min-height: 32px; }

          .filter-mobile-toggle { display: inline-flex; }
          .filter-toolbar {
            display: none;
            flex-direction: column;
            align-items: stretch;
            gap: 14px;
          }
          .filter-toolbar.open { display: flex; }
          .filter-group { flex-direction: row; flex-wrap: wrap; }
          .filter-actions { margin-left: 0; }
          .movie-grid {
            grid-template-columns: repeat(3, 1fr);
            gap: 10px;
          }
        }
        @media (max-width: 480px) {
          .movie-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 10px;
          }
          .search-form { padding: 8px 12px; }
          .search-submit { padding: 6px 10px; font-size: 12px; }
        }
      `}</style>
    </div>
  )
}
