import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
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
import useHeaderSearchSlot from '../useHeaderSearchSlot'

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
  // Everything hidden inside the collapsed panel: toolbar filters + genre +
  // streaming. Surfaced on the Filters button so a closed panel never hides
  // that filters are applied.
  const panelFilterCount =
    activeFilterCount + (selectedGenre ? 1 : 0) + (streaming !== 'all' ? 1 : 0)

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
        // Jellyfin shape (normalized by the backend), map to TMDb-ish
        data = data.map(p => ({
          id: p.tmdb_id,
          title: p.title,
          poster_url: p.item_id ? `${import.meta.env.VITE_API_URL || ''}/downloads/poster/${p.item_id}` : null,
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

  const headerSlot = useHeaderSearchSlot()
  const searchForm = (
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
  )

  return (
    <div className="home">
      {headerSlot
        ? createPortal(searchForm, headerSlot)
        : <div className="search-container">{searchForm}</div>}

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
          <button
            className={`tab filters-toggle ${panelFilterCount > 0 ? 'has-active' : ''}`}
            onClick={() => setFiltersOpen(v => !v)}
            aria-expanded={filtersOpen}
          >
            <SlidersHorizontal size={14} /> Filters{panelFilterCount > 0 ? ` · ${panelFilterCount}` : ''}
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

      {!isSearching && (
      <div className={`filter-panel ${filtersOpen ? 'open' : ''}`}>
      <div className="filter-panel-inner">
      {!showWatchlist && (
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

      {!showWatchlist && (
        <div className="filter-toolbar">
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
      )}
      </div>
      </div>
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
        .home { padding: 28px 32px 48px; max-width: 1440px; margin: 0 auto; }
        .search-container { margin-bottom: 24px; }
        .search-form {
          display: flex; align-items: center; gap: 10px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 999px;
          padding: 11px 12px 11px 20px;
          box-shadow: var(--shadow-1);
          transition: border-color var(--dur) var(--ease), box-shadow var(--dur) var(--ease);
        }
        .search-form:focus-within {
          border-color: var(--accent-dim);
          box-shadow: var(--shadow-1), 0 0 0 3px var(--accent-soft);
        }
        .search-icon { color: var(--text-muted); flex-shrink: 0; }
        .search-input {
          flex: 1; background: transparent;
          border: none; outline: none;
          color: var(--text); font-size: 15px;
          letter-spacing: 0.01em;
        }
        .search-input::placeholder { color: var(--text-faint); }
        .search-clear {
          background: transparent; color: var(--text-muted);
          font-size: 14px; padding: 2px 8px; border-radius: 999px;
          transition: color var(--dur-fast) var(--ease);
        }
        .search-clear:hover { color: var(--text); }
        .search-submit {
          background: var(--accent); color: #100a02;
          padding: 8px 20px; border-radius: 999px;
          font-size: 13px; font-weight: 700;
          letter-spacing: 0.02em;
          transition: background var(--dur-fast) var(--ease), transform var(--dur-fast) var(--ease);
        }
        .search-submit:hover { background: var(--accent-bright); transform: scale(1.03); }
        .tabs { display: flex; gap: 6px; margin-bottom: 18px; flex-wrap: wrap; }
        .tab {
          background: transparent;
          border: 1px solid transparent;
          color: var(--text-muted);
          padding: 8px 16px; border-radius: 999px;
          font-size: 13px;
          font-family: 'Anton', sans-serif;
          font-weight: 400;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          display: flex; align-items: center; gap: 6px;
          transition: all var(--dur-fast) var(--ease);
        }
        .tab:hover { color: var(--text); background: var(--surface); }
        .tab.active {
          background: var(--accent); border-color: var(--accent); color: #100a02;
          font-weight: 700;
          box-shadow: 0 2px 16px var(--accent-glow);
        }
        .filters-toggle {
          border: 1px solid var(--border);
          margin-left: 4px;
        }
        .filters-toggle:hover { color: var(--text); background: var(--surface); }
        .filters-toggle[aria-expanded="true"] {
          background: var(--surface2);
          border-color: var(--border-strong);
          color: var(--text);
        }
        .filters-toggle.has-active {
          color: var(--accent-bright);
          border-color: rgb(var(--accent-rgb) / 0.5);
          background: var(--accent-soft);
          font-weight: 700;
        }
        /* Progressive disclosure: secondary filter rows live in a panel that
           animates open via grid-template-rows (smooth height without
           max-height hacks); collapsed contributes zero height. */
        .filter-panel {
          display: grid;
          grid-template-rows: 0fr;
          transition: grid-template-rows var(--dur-slow) var(--ease);
        }
        .filter-panel.open { grid-template-rows: 1fr; }
        .filter-panel-inner { overflow: hidden; min-height: 0; }
        .filter-panel.open .filter-panel-inner { padding-top: 4px; }
        .decade-row {
          display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap;
        }
        .decade-btn {
          background: transparent; border: 1px solid var(--border);
          color: var(--text-muted);
          padding: 6px 18px; border-radius: 999px;
          font-size: 13px; font-weight: 600; letter-spacing: 0.06em;
          transition: all var(--dur-fast) var(--ease);
        }
        .decade-btn:hover { border-color: var(--accent-dim); color: var(--accent); }
        .decade-btn.active {
          background: var(--accent); border-color: var(--accent); color: #100a02;
          box-shadow: 0 2px 16px var(--accent-glow);
        }
        .genre-scroll {
          display: flex; gap: 6px; overflow-x: auto;
          padding-bottom: 8px; margin-bottom: 12px;
          scrollbar-width: none;
        }
        .genre-scroll::-webkit-scrollbar { display: none; }
        .genre-btn {
          background: transparent; border: 1px solid var(--border);
          color: var(--text-muted); white-space: nowrap;
          padding: 5px 14px; border-radius: 999px;
          font-size: 12px; letter-spacing: 0.02em;
          transition: all var(--dur-fast) var(--ease);
        }
        .genre-btn:hover, .genre-btn.active {
          border-color: rgb(var(--accent-rgb) / 0.5); color: var(--accent-bright);
          background: var(--accent-soft);
        }
        .streaming-filters {
          display: flex; gap: 6px; margin-bottom: 24px; flex-wrap: wrap;
        }
        .streaming-btn {
          background: var(--surface); border: 1px solid var(--border);
          color: var(--text-muted);
          padding: 6px 14px; border-radius: var(--radius-sm);
          font-size: 12px; font-weight: 500;
          letter-spacing: 0.02em;
          transition: all var(--dur-fast) var(--ease);
        }
        .streaming-btn:hover { border-color: var(--border-strong); color: var(--text); }
        .streaming-btn.active {
          border-color: rgb(var(--accent-rgb) / 0.5); color: var(--accent-bright);
          background: var(--accent-soft);
        }
        .movie-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
          gap: 24px 20px;
        }
        .movie-card-wrapper { position: relative; }
        .watchlist-btn {
          position: absolute; bottom: 56px; right: 8px;
          background: rgba(7, 7, 11, 0.7);
          border: 1px solid var(--border-strong);
          color: var(--text-muted);
          width: 30px; height: 30px;
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          transition: all var(--dur-fast) var(--ease);
          backdrop-filter: blur(8px);
          z-index: 2;
        }
        .watchlist-btn:hover, .watchlist-btn.saved {
          color: var(--accent-bright); border-color: var(--accent-dim);
          background: rgb(var(--accent-rgb) / 0.18);
          transform: scale(1.08);
        }
        .sentinel {
          height: 72px;
          display: flex; align-items: center; justify-content: center;
          color: var(--text-faint); font-size: 12px;
          letter-spacing: 0.14em; text-transform: uppercase;
          margin-top: 16px;
        }
        .filter-toolbar {
          display: flex; flex-wrap: wrap; gap: 12px 28px;
          align-items: center;
          padding: 14px 18px;
          background: var(--bg-raised);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          box-shadow: var(--shadow-1);
          margin-bottom: 24px;
        }
        .filter-group { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
        .filter-label {
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 10px; text-transform: uppercase;
          letter-spacing: 0.12em; color: var(--text-faint);
          font-weight: 600;
          margin-right: 8px;
        }
        .filter-btn {
          background: transparent;
          border: 1px solid var(--border);
          color: var(--text-muted);
          padding: 4px 12px;
          border-radius: 999px;
          font-size: 12px;
          transition: all var(--dur-fast) var(--ease);
        }
        .filter-btn:hover { border-color: var(--accent-dim); color: var(--accent); }
        .filter-btn.active {
          background: var(--accent); border-color: var(--accent); color: #100a02;
          font-weight: 700;
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
          color: var(--accent-bright);
          font-weight: 700;
          padding: 2px 10px;
          background: var(--accent-soft);
          border: 1px solid rgb(var(--accent-rgb) / 0.4);
          border-radius: 999px;
        }
        .filter-clear {
          display: inline-flex; align-items: center; gap: 4px;
          background: transparent;
          border: 1px solid var(--border);
          color: var(--text-muted);
          padding: 4px 12px; border-radius: 999px;
          font-size: 12px;
          transition: all var(--dur-fast) var(--ease);
        }
        .filter-clear:hover { border-color: var(--red); color: var(--red); }


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
          .tabs, .genre-scroll, .streaming-filters { overscroll-behavior-x: contain; }
          .tab { white-space: nowrap; font-size: 13px; padding: 10px 16px; min-height: 44px; }
          .genre-scroll { padding-right: 14px; }
          .genre-btn { padding: 8px 14px; font-size: 12px; min-height: 40px; }
          .decade-btn { min-height: 40px; padding: 8px 18px; }
          .streaming-filters {
            flex-wrap: nowrap;
            overflow-x: auto;
            scrollbar-width: none;
            padding: 0 14px 6px 0;
          }
          .streaming-filters::-webkit-scrollbar { display: none; }
          .streaming-btn { white-space: nowrap; font-size: 12px; padding: 8px 14px; min-height: 40px; }
          .filter-btn, .filter-clear { min-height: 40px; padding: 8px 14px; }
          .search-form { padding: 8px 8px 8px 18px; }
          .search-input { font-size: 16px; } /* 16px stops iOS auto-zoom on focus */
          .search-submit { min-height: 40px; }
          .watchlist-btn { width: 36px; height: 36px; bottom: 60px; }

          .filter-toolbar {
            flex-direction: column;
            align-items: stretch;
            gap: 14px;
          }
          .filter-panel { margin-left: -14px; margin-right: -14px; }
          .filter-panel-inner { padding-left: 14px; padding-right: 14px; }
          .filter-group { flex-direction: row; flex-wrap: wrap; }
          .filter-actions { margin-left: 0; }
          .movie-grid {
            grid-template-columns: repeat(3, 1fr);
            gap: 10px;
          }
        }
        @media (max-width: 480px) {
          .home { padding: 14px 10px 40px; }
          .movie-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 14px 10px;
          }
          .search-form { padding: 7px 7px 7px 16px; }
          .search-submit { padding: 8px 14px; font-size: 12px; }
        }
      `}</style>
    </div>
  )
}
