import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, Bookmark, BookmarkCheck } from 'lucide-react'
import MovieCard from '../components/MovieCard'
import AnimeModal from '../components/AnimeModal'
import AnimeDownloadQueue from '../components/AnimeDownloadQueue'
import {
  getTrendingAnime, getPopularAnime, getTopRatedAnime, getAiringAnime,
  getAnimeMovies, getAnimeGenres, getAnimeBySubgenre, searchAnime,
} from '../api'

const TABS = [
  { id: 'trending', label: 'Trending' },
  { id: 'popular', label: 'Popular' },
  { id: 'top_rated', label: 'Top Rated' },
  { id: 'airing', label: 'Currently Airing' },
  { id: 'movies', label: 'Anime Movies' },
]

const PAGE_SIZE = 20

export default function AnimeHome() {
  const [items, setItems] = useState([])
  const [tab, setTab] = useState('trending')
  const [genres, setGenres] = useState([])
  const [selectedGenre, setSelectedGenre] = useState(null)
  const [searchQ, setSearchQ] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [selectedShow, setSelectedShow] = useState(null)
  const [watchlist, setWatchlist] = useState(() => {
    try { return JSON.parse(localStorage.getItem('anime_watchlist') || '[]') } catch { return [] }
  })
  const [showWatchlist, setShowWatchlist] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)
  const sentinelRef = useRef(null)
  const tabsRef = useRef(null)
  const requestSeq = useRef(0)

  useEffect(() => { getAnimeGenres().then(r => setGenres(r.data)) }, [])

  useEffect(() => {
    if (!tabsRef.current) return
    const active = tabsRef.current.querySelector('.tab.active')
    if (active?.scrollIntoView) active.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [tab, showWatchlist])

  const contextKey = `${tab}|${selectedGenre?.id ?? 'none'}|${selectedGenre?.kind ?? 'none'}|${showWatchlist}|${isSearching}`

  useEffect(() => {
    if (isSearching || showWatchlist) return
    setItems([]); setPage(1); setHasMore(true)
    fetchPage(1, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextKey])

  function fetcherForCurrentContext(pageNum) {
    if (selectedGenre) return getAnimeBySubgenre(selectedGenre.id, selectedGenre.kind, pageNum)
    switch (tab) {
      case 'trending': return getTrendingAnime(pageNum)
      case 'popular': return getPopularAnime(pageNum)
      case 'top_rated': return getTopRatedAnime(pageNum)
      case 'airing': return getAiringAnime(pageNum)
      case 'movies': return getAnimeMovies(pageNum)
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
      setItems(prev => append ? [...prev, ...data] : data)
      setHasMore(data.length === PAGE_SIZE)
    } catch (e) {
      console.error(e); setHasMore(false)
    } finally {
      if (seq === requestSeq.current) setLoading(false)
    }
  }

  const loadMore = useCallback(() => {
    if (loading || !hasMore || isSearching || showWatchlist) return
    const next = page + 1
    setPage(next); fetchPage(next, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, hasMore, page, isSearching, showWatchlist])

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
    const r = await searchAnime(searchQ)
    setItems(r.data)
  }
  function clearSearch() { setSearchQ(''); setIsSearching(false) }
  function switchTab(t) { setTab(t); setSelectedGenre(null); setShowWatchlist(false); setIsSearching(false) }
  function pickGenre(g) {
    if (selectedGenre?.id === g.id) { setSelectedGenre(null); return }
    setSelectedGenre(g)
  }
  function toggleWatchlist(show) {
    const existing = watchlist.find(m => m.id === show.id)
    const updated = existing ? watchlist.filter(m => m.id !== show.id) : [...watchlist, show]
    setWatchlist(updated); localStorage.setItem('anime_watchlist', JSON.stringify(updated))
  }

  const displayItems = showWatchlist ? watchlist : items

  return (
    <div className="home">
      <div className="search-container">
        <form className="search-form" onSubmit={handleSearch}>
          <Search size={18} className="search-icon" />
          <input className="search-input" placeholder="Search any anime..." value={searchQ} onChange={e => setSearchQ(e.target.value)} />
          {isSearching && <button type="button" className="search-clear" onClick={clearSearch}>✕</button>}
          <button type="submit" className="search-submit">Search</button>
        </form>
      </div>

      <AnimeDownloadQueue />

      {!isSearching && (
        <div className="tabs" ref={tabsRef}>
          {TABS.map(t => (
            <button
              key={t.id}
              className={`tab ${tab === t.id && !showWatchlist && !selectedGenre ? 'active' : ''}`}
              onClick={() => switchTab(t.id)}
            >{t.label}</button>
          ))}
          <button className={`tab ${showWatchlist ? 'active' : ''}`} onClick={() => setShowWatchlist(v => !v)}>
            <Bookmark size={14} /> Watchlist {watchlist.length > 0 && `(${watchlist.length})`}
          </button>
        </div>
      )}

      {!isSearching && !showWatchlist && genres.length > 0 && (
        <div className="genre-scroll">
          <button className={`genre-btn ${!selectedGenre ? 'active' : ''}`} onClick={() => setSelectedGenre(null)}>All</button>
          {genres.map(g => (
            <button
              key={`${g.kind}-${g.id}-${g.name}`}
              className={`genre-btn ${selectedGenre?.id === g.id && selectedGenre?.name === g.name ? 'active' : ''}`}
              onClick={() => pickGenre(g)}
            >{g.name}</button>
          ))}
        </div>
      )}

      <div className="movie-grid">
        {displayItems.map((show, i) => (
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
          {!hasMore && displayItems.length > 0 && <span className="sentinel-text">End of results</span>}
        </div>
      )}

      {selectedShow && <AnimeModal show={selectedShow} onClose={() => setSelectedShow(null)} />}

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
        .genre-scroll { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 8px; margin-bottom: 20px; scrollbar-width: none; }
        .genre-scroll::-webkit-scrollbar { display: none; }
        .genre-btn { background: transparent; border: 1px solid var(--border); color: var(--text-muted); white-space: nowrap; padding: 5px 12px; border-radius: 20px; font-size: 12px; }
        .genre-btn:hover, .genre-btn.active { border-color: var(--accent); color: var(--accent); background: rgba(232,160,48,0.08); }
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
          .genre-scroll { margin: 0 -14px 12px; padding: 0 14px 6px; }
          .movie-grid { grid-template-columns: repeat(3, 1fr); gap: 10px; }
        }
        @media (max-width: 480px) {
          .movie-grid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
        }
      `}</style>
    </div>
  )
}
