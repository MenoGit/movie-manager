import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, Bookmark, BookmarkCheck, X as XIcon, SlidersHorizontal } from 'lucide-react'
import MovieCard from '../components/MovieCard'
import TVShowModal from '../components/TVShowModal'
import TVDownloadQueue from '../components/TVDownloadQueue'
import {
  getTrendingTV, getPopularTV, getTopRatedTV, getOnTheAir, getAiringToday,
  getAllTimeBestTV, getHiddenGemsTV, getTVByDecade, getTVByGenre, getTVByNetwork,
  getTVGenres, searchTV,
} from '../api'

// TMDb network IDs for streaming-style filter row
const TV_NETWORKS = [
  { id: 'all', label: 'All' },
  { id: 213, label: 'Netflix' },
  { id: 2739, label: 'Disney+' },
  { id: 49, label: 'Max' },
  { id: 1024, label: 'Prime' },
  { id: 453, label: 'Hulu' },
  { id: 2552, label: 'Apple TV+' },
  { id: 4330, label: 'Paramount+' },
  { id: 3353, label: 'Peacock' },
]

const TABS = [
  { id: 'trending', label: 'Trending' },
  { id: 'popular', label: 'Popular' },
  { id: 'top_rated', label: 'Top Rated' },
  { id: 'on_the_air', label: 'On The Air' },
  { id: 'airing_today', label: 'Airing Today' },
  { id: 'all_time_best', label: 'All Time Best' },
  { id: 'hidden_gems', label: 'Hidden Gems' },
  { id: 'decades', label: 'Decades' },
]

// Quick genre shortcuts for TV (different IDs than movies)
const QUICK_GENRES = [
  { id: 18, label: 'Drama' },
  { id: 35, label: 'Comedy' },
  { id: 10765, label: 'Sci-Fi' },
  { id: 80, label: 'Crime' },
]

const DECADES = ['70s', '80s', '90s', '00s', '10s', '20s']
const PAGE_SIZE = 20

const SORT_OPTIONS = [
  { id: 'default', label: 'Popularity' },
  { id: 'vote_average.desc', label: 'Rating ↓' },
  { id: 'first_air_date.desc', label: 'Newest' },
  { id: 'first_air_date.asc', label: 'Oldest' },
]
const RATING_OPTIONS = [
  { id: 0, label: 'Any' }, { id: 7, label: '7+' }, { id: 8, label: '8+' }, { id: 9, label: '9+' },
]
const YEAR_PRESETS = [
  { id: 'all', label: 'All Time', from: null, to: null },
  { id: '2020s', label: '2020s', from: 2020, to: 2029 },
  { id: '2010s', label: '2010s', from: 2010, to: 2019 },
  { id: '2000s', label: '2000s', from: 2000, to: 2009 },
  { id: '90s', label: '90s', from: 1990, to: 1999 },
  { id: '80s', label: '80s', from: 1980, to: 1989 },
]
const DEFAULT_FILTERS = { sortBy: 'default', minRating: 0, yearPreset: 'all', includeAdult: false }

function filterPayload(f) {
  const yr = YEAR_PRESETS.find(p => p.id === f.yearPreset) || YEAR_PRESETS[0]
  return {
    sortBy: f.sortBy, minRating: f.minRating,
    yearFrom: yr.from, yearTo: yr.to, includeAdult: f.includeAdult,
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

export default function TVHome() {
  const [shows, setShows] = useState([])
  const [tab, setTab] = useState('trending')
  const [network, setNetwork] = useState('all')
  const [genres, setGenres] = useState([])
  const [selectedGenre, setSelectedGenre] = useState(null)
  const [selectedDecade, setSelectedDecade] = useState(null)
  const [searchQ, setSearchQ] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [selectedShow, setSelectedShow] = useState(null)
  const [watchlist, setWatchlist] = useState(() => {
    try { return JSON.parse(localStorage.getItem('tv_watchlist') || '[]') } catch { return [] }
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

  useEffect(() => { getTVGenres().then(r => setGenres(r.data)) }, [])

  useEffect(() => {
    if (!tabsRef.current) return
    const active = tabsRef.current.querySelector('.tab.active')
    if (active?.scrollIntoView) active.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [tab, showWatchlist])

  const contextKey = `${tab}|${network}|${selectedGenre}|${selectedDecade}|${showWatchlist}|${isSearching}|${filters.sortBy}|${filters.minRating}|${filters.yearPreset}|${filters.includeAdult}`

  useEffect(() => {
    if (isSearching || showWatchlist) return
    setShows([]); setPage(1); setHasMore(true)
    fetchPage(1, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextKey])

  function fetcherForCurrentContext(pageNum) {
    const f = filterPayload(filters)
    if (network !== 'all') return getTVByNetwork(network, pageNum, f)
    if (selectedDecade) return getTVByDecade(selectedDecade, pageNum, f)
    if (selectedGenre) return getTVByGenre(selectedGenre, pageNum, f)
    switch (tab) {
      case 'trending': return getTrendingTV(pageNum, f)
      case 'popular': return getPopularTV(pageNum, f)
      case 'top_rated': return getTopRatedTV(pageNum, f)
      case 'on_the_air': return getOnTheAir(pageNum, f)
      case 'airing_today': return getAiringToday(pageNum, f)
      case 'all_time_best': return getAllTimeBestTV(pageNum, f)
      case 'hidden_gems': return getHiddenGemsTV(pageNum, f)
      case 'decades': return null
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
      if (seq !== requestSeq.current) return
      const data = r.data || []
      setShows(prev => append ? [...prev, ...data] : data)
      setHasMore(data.length === PAGE_SIZE)
    } catch (e) {
      console.error(e); setHasMore(false)
    } finally {
      if (seq === requestSeq.current) setLoading(false)
    }
  }

  const loadMore = useCallback(() => {
    if (loading || !hasMore || isSearching || showWatchlist) return
    if (tab === 'decades' && !selectedDecade) return
    const next = page + 1
    setPage(next); fetchPage(next, true)
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
    setIsSearching(true); setHasMore(false)
    const r = await searchTV(searchQ)
    setShows(r.data)
  }
  function clearSearch() { setSearchQ(''); setIsSearching(false) }
  function switchTab(t) { setTab(t); setNetwork('all'); setSelectedGenre(null); setSelectedDecade(null); setShowWatchlist(false); setIsSearching(false) }
  function pickGenre(id) {
    if (selectedGenre === id) { setSelectedGenre(null); return }
    setSelectedGenre(id); setSelectedDecade(null); setNetwork('all')
  }
  function pickDecade(d) { setSelectedDecade(d); setSelectedGenre(null); setNetwork('all') }
  function pickNetwork(id) { setNetwork(id); setSelectedGenre(null); setSelectedDecade(null) }
  function toggleWatchlist(show) {
    const existing = watchlist.find(m => m.id === show.id)
    const updated = existing ? watchlist.filter(m => m.id !== show.id) : [...watchlist, show]
    setWatchlist(updated); localStorage.setItem('tv_watchlist', JSON.stringify(updated))
  }

  const displayShows = showWatchlist ? watchlist : shows
  const showDecadePicker = !isSearching && !showWatchlist && tab === 'decades'

  return (
    <div className="home">
      <div className="search-container">
        <form className="search-form" onSubmit={handleSearch}>
          <Search size={18} className="search-icon" />
          <input className="search-input" placeholder="Search any TV show..." value={searchQ} onChange={e => setSearchQ(e.target.value)} />
          {isSearching && <button type="button" className="search-clear" onClick={clearSearch}>✕</button>}
          <button type="submit" className="search-submit">Search</button>
        </form>
      </div>

      <TVDownloadQueue />

      {!isSearching && (
        <div className="tabs" ref={tabsRef}>
          {TABS.map(t => (
            <button
              key={t.id}
              className={`tab ${tab === t.id && !showWatchlist && network === 'all' && !selectedGenre ? 'active' : ''}`}
              onClick={() => switchTab(t.id)}
            >{t.label}</button>
          ))}
          <button className={`tab ${showWatchlist ? 'active' : ''}`} onClick={() => setShowWatchlist(v => !v)}>
            <Bookmark size={14} /> Watchlist {watchlist.length > 0 && `(${watchlist.length})`}
          </button>
        </div>
      )}

      {showDecadePicker && (
        <div className="decade-row">
          {DECADES.map(d => (
            <button key={d} className={`decade-btn ${selectedDecade === d ? 'active' : ''}`} onClick={() => pickDecade(d)}>{d}</button>
          ))}
        </div>
      )}

      {!isSearching && !showWatchlist && (
        <div className="genre-scroll">
          <button className={`genre-btn ${!selectedGenre ? 'active' : ''}`} onClick={() => { setSelectedGenre(null); setSelectedDecade(null) }}>All Genres</button>
          {QUICK_GENRES.map(g => (
            <button key={`q-${g.id}`} className={`genre-btn ${selectedGenre === g.id ? 'active' : ''}`} onClick={() => pickGenre(g.id)}>{g.label}</button>
          ))}
          {genres.filter(g => !QUICK_GENRES.some(q => q.id === g.id)).map(g => (
            <button key={g.id} className={`genre-btn ${selectedGenre === g.id ? 'active' : ''}`} onClick={() => pickGenre(g.id)}>{g.name}</button>
          ))}
        </div>
      )}

      <div className="streaming-filters">
        {TV_NETWORKS.map(n => (
          <button key={n.id} className={`streaming-btn ${network === n.id ? 'active' : ''}`} onClick={() => pickNetwork(n.id)}>{n.label}</button>
        ))}
      </div>

      {!isSearching && !showWatchlist && (
        <>
          <button className="filter-mobile-toggle" onClick={() => setFiltersOpen(v => !v)} aria-expanded={filtersOpen}>
            <SlidersHorizontal size={14} /> Filters
            {activeFilterCount > 0 && <span className="filter-mobile-count">{activeFilterCount}</span>}
          </button>
          <div className={`filter-toolbar ${filtersOpen ? 'open' : ''}`}>
            <div className="filter-group">
              <span className="filter-label"><SlidersHorizontal size={12} /> Sort</span>
              {SORT_OPTIONS.map(s => (
                <button key={s.id} className={`filter-btn ${filters.sortBy === s.id ? 'active' : ''}`} onClick={() => setFilters(f => ({ ...f, sortBy: s.id }))}>{s.label}</button>
              ))}
            </div>
            <div className="filter-group">
              <span className="filter-label">Min Rating</span>
              {RATING_OPTIONS.map(r => (
                <button key={r.id} className={`filter-btn ${filters.minRating === r.id ? 'active' : ''}`} onClick={() => setFilters(f => ({ ...f, minRating: r.id }))}>{r.label}</button>
              ))}
            </div>
            <div className="filter-group">
              <span className="filter-label">Year</span>
              {YEAR_PRESETS.map(y => (
                <button key={y.id} className={`filter-btn ${filters.yearPreset === y.id ? 'active' : ''}`} onClick={() => setFilters(f => ({ ...f, yearPreset: y.id }))}>{y.label}</button>
              ))}
            </div>
            {activeFilterCount > 0 && (
              <div className="filter-group filter-actions">
                <span className="filter-count">{activeFilterCount} active</span>
                <button className="filter-clear" onClick={() => setFilters(DEFAULT_FILTERS)}><XIcon size={12} /> Clear</button>
              </div>
            )}
          </div>
        </>
      )}

      <div className="movie-grid">
        {displayShows.map((show, i) => (
          <div key={`${show.id || 'p'}-${i}`} className="movie-card-wrapper">
            <MovieCard movie={show} onClick={setSelectedShow} />
            {show.id && (
              <button
                className={`watchlist-btn ${watchlist.find(m => m.id === show.id) ? 'saved' : ''}`}
                onClick={(e) => { e.stopPropagation(); toggleWatchlist(show) }}
                title="Add to watchlist"
              >
                {watchlist.find(m => m.id === show.id) ? <BookmarkCheck size={14}/> : <Bookmark size={14}/>}
              </button>
            )}
          </div>
        ))}
      </div>

      {!showWatchlist && !isSearching && (
        <div ref={sentinelRef} className="sentinel">
          {loading && <span className="sentinel-text">Loading…</span>}
          {!hasMore && displayShows.length > 0 && <span className="sentinel-text">End of results</span>}
          {tab === 'decades' && !selectedDecade && <span className="sentinel-text">Pick a decade above</span>}
        </div>
      )}

      {selectedShow && <TVShowModal show={selectedShow} onClose={() => setSelectedShow(null)} />}

      <style>{`
        .home { padding: 24px; max-width: 1400px; margin: 0 auto; }
        .search-container { margin-bottom: 24px; }
        .search-form { display: flex; align-items: center; gap: 8px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 10px 14px; }
        .search-form:focus-within { border-color: var(--accent); }
        .search-icon { color: var(--text-muted); flex-shrink: 0; }
        .search-input { flex: 1; background: transparent; border: none; outline: none; color: var(--text); font-size: 15px; }
        .search-clear { background: transparent; color: var(--text-muted); padding: 2px 6px; border-radius: 4px; }
        .search-submit { background: var(--accent); color: #000; padding: 6px 16px; border-radius: 6px; font-size: 13px; font-weight: 600; }
        .tabs { display: flex; gap: 4px; margin-bottom: 16px; flex-wrap: wrap; }
        .tab { background: transparent; border: 1px solid var(--border); color: var(--text-muted); padding: 7px 16px; border-radius: 6px; font-size: 13px; font-weight: 500; display: flex; align-items: center; gap: 6px; }
        .tab:hover { border-color: var(--accent); color: var(--accent); }
        .tab.active { background: var(--accent); border-color: var(--accent); color: #000; }
        .decade-row { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
        .decade-btn { background: transparent; border: 1px solid var(--border); color: var(--text-muted); padding: 6px 18px; border-radius: 6px; font-size: 13px; font-weight: 600; letter-spacing: 0.5px; }
        .decade-btn:hover { border-color: var(--accent); color: var(--accent); }
        .decade-btn.active { background: var(--accent); border-color: var(--accent); color: #000; }
        .genre-scroll { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 8px; margin-bottom: 12px; scrollbar-width: none; }
        .genre-scroll::-webkit-scrollbar { display: none; }
        .genre-btn { background: transparent; border: 1px solid var(--border); color: var(--text-muted); white-space: nowrap; padding: 5px 12px; border-radius: 20px; font-size: 12px; }
        .genre-btn:hover, .genre-btn.active { border-color: var(--accent); color: var(--accent); background: rgba(232,160,48,0.08); }
        .streaming-filters { display: flex; gap: 6px; margin-bottom: 20px; flex-wrap: wrap; }
        .streaming-btn { background: var(--surface); border: 1px solid var(--border); color: var(--text-muted); padding: 5px 14px; border-radius: 6px; font-size: 12px; font-weight: 500; }
        .streaming-btn:hover { border-color: var(--border); color: var(--text); }
        .streaming-btn.active { border-color: var(--accent); color: var(--accent); background: rgba(232,160,48,0.08); }
        .filter-toolbar { display: flex; flex-wrap: wrap; gap: 12px 24px; align-items: center; padding: 12px 14px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); margin-bottom: 20px; }
        .filter-group { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
        .filter-label { display: inline-flex; align-items: center; gap: 4px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); margin-right: 6px; }
        .filter-btn { background: transparent; border: 1px solid var(--border); color: var(--text-muted); padding: 4px 10px; border-radius: 6px; font-size: 12px; }
        .filter-btn:hover { border-color: var(--accent); color: var(--accent); }
        .filter-btn.active { background: var(--accent); border-color: var(--accent); color: #000; font-weight: 600; }
        .filter-actions { margin-left: auto; }
        .filter-count { font-size: 11px; color: var(--accent); font-weight: 600; padding: 2px 8px; background: rgba(232,160,48,0.12); border: 1px solid rgba(232,160,48,0.4); border-radius: 10px; }
        .filter-clear { display: inline-flex; align-items: center; gap: 4px; background: transparent; border: 1px solid var(--border); color: var(--text-muted); padding: 4px 10px; border-radius: 6px; font-size: 12px; }
        .filter-clear:hover { border-color: var(--red); color: var(--red); }
        .filter-mobile-toggle { display: none; align-items: center; gap: 8px; background: var(--surface); border: 1px solid var(--border); color: var(--text); padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 500; margin-bottom: 12px; min-height: 40px; }
        .filter-mobile-count { background: var(--accent); color: #000; font-size: 11px; font-weight: 700; padding: 1px 6px; border-radius: 10px; }
        .movie-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 16px; }
        .movie-card-wrapper { position: relative; }
        .watchlist-btn { position: absolute; bottom: 48px; right: 8px; background: rgba(10,10,15,0.75); border: 1px solid var(--border); color: var(--text-muted); width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px); }
        .watchlist-btn:hover, .watchlist-btn.saved { color: var(--accent); border-color: var(--accent); background: rgba(232,160,48,0.15); }
        .sentinel { height: 60px; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 13px; margin-top: 16px; }

        @media (max-width: 768px) {
          .home { padding: 16px 14px; }
          .tabs { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; padding-bottom: 6px; margin: 0 -14px 16px; padding-left: 14px; padding-right: 14px; }
          .tabs::-webkit-scrollbar { display: none; }
          .tab { white-space: nowrap; font-size: 12px; padding: 8px 14px; min-height: 36px; }
          .genre-scroll, .streaming-filters { margin: 0 -14px 12px; padding: 0 14px 6px; }
          .filter-mobile-toggle { display: inline-flex; }
          .filter-toolbar { display: none; flex-direction: column; align-items: stretch; gap: 14px; }
          .filter-toolbar.open { display: flex; }
          .movie-grid { grid-template-columns: repeat(3, 1fr); gap: 10px; }
        }
        @media (max-width: 480px) {
          .movie-grid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
        }
      `}</style>
    </div>
  )
}
