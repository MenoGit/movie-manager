import { useState, useEffect } from 'react'
import { Search } from 'lucide-react'
import HeroBanner from '../components/HeroBanner'
import ContentRow from '../components/ContentRow'
import AnimeDownloadQueue from '../components/AnimeDownloadQueue'
import AnimeModal from '../components/AnimeModal'
import {
  getTrendingAnime, getAiringAnime, getAnimeMovies, getPopularAnime,
  getAnimeBySubgenre, searchAnime, getAnimeDetail,
} from '../api'

// Subgenre rows for browse. Mix of TMDb TV genres and anime keywords.
const BROWSE_SUBGENRES = [
  { id: 10759, kind: 'genre',   label: 'Action' },
  { id: 10765, kind: 'genre',   label: 'Fantasy' },
  { id: 9799,  kind: 'keyword', label: 'Romance' },
  { id: 10183, kind: 'keyword', label: 'Slice of Life' },
  { id: 6075,  kind: 'keyword', label: 'Mecha' },
  { id: 6152,  kind: 'keyword', label: 'Supernatural' },
]

export default function AnimeBrowse() {
  const [heroShows, setHeroShows] = useState(null)
  const [selectedShow, setSelectedShow] = useState(null)
  const [searchQ, setSearchQ] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [searchResults, setSearchResults] = useState([])

  useEffect(() => {
    getTrendingAnime().then(r => setHeroShows(r.data))
  }, [])

  async function openShow(stub) {
    if (stub.id) {
      try {
        const r = await getAnimeDetail(stub.id)
        setSelectedShow({ ...stub, ...r.data })
      } catch {
        setSelectedShow(stub)
      }
    } else { setSelectedShow(stub) }
  }

  async function handleSearch(e) {
    e?.preventDefault()
    if (!searchQ.trim()) { setIsSearching(false); return }
    setIsSearching(true)
    const r = await searchAnime(searchQ)
    setSearchResults(r.data)
  }
  function clearSearch() { setSearchQ(''); setIsSearching(false); setSearchResults([]) }

  return (
    <div className="browse">
      <HeroBanner movies={heroShows || []} onOpen={openShow} />

      <div className="browse-search">
        <form className="search-form" onSubmit={handleSearch}>
          <Search size={18} className="search-icon" />
          <input className="search-input" placeholder="Search any anime..." value={searchQ} onChange={e => setSearchQ(e.target.value)} />
          {isSearching && <button type="button" className="search-clear" onClick={clearSearch}>✕</button>}
          <button type="submit" className="search-submit">Search</button>
        </form>
      </div>

      <div className="browse-queue"><AnimeDownloadQueue /></div>

      {isSearching ? (
        <div className="browse-search-results">
          <h2 className="row-title" style={{padding:'0 5%', marginBottom:16}}>Search results</h2>
          <div className="search-grid">
            {searchResults.map((s, i) => (
              <div key={`${s.id}-${i}`} className="search-card" onClick={() => openShow(s)}>
                {s.poster_url ? <img src={s.poster_url} alt={s.title} /> :
                  <div className="search-card-fallback">{s.title}</div>}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          <ContentRow title="Top Anime Today" variant="top10" preloaded={heroShows} fetcher={null} onOpen={openShow} />
          <ContentRow title="Trending Anime" fetcher={() => getTrendingAnime()} onOpen={openShow} />
          <ContentRow title="Currently Airing" subtitle="New episodes recently" fetcher={() => getAiringAnime()} onOpen={openShow} />
          <ContentRow title="Popular Anime Movies" subtitle="Spirited Away, Your Name, and more" fetcher={() => getAnimeMovies()} onOpen={openShow} />
          <ContentRow title="Popular Anime" fetcher={() => getPopularAnime()} onOpen={openShow} />

          {BROWSE_SUBGENRES.map(g => (
            <ContentRow
              key={`${g.kind}-${g.id}-${g.label}`}
              title={g.label}
              fetcher={() => getAnimeBySubgenre(g.id, g.kind)}
              onOpen={openShow}
            />
          ))}
        </>
      )}

      {selectedShow && <AnimeModal show={selectedShow} onClose={() => setSelectedShow(null)} />}

      <style>{`
        .browse { padding-bottom: 60px; }
        .browse-search { padding: 0 5%; margin-bottom: 12px; }
        .browse-search .search-form { display: flex; align-items: center; gap: 8px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 10px 14px; }
        .browse-search .search-form:focus-within { border-color: var(--accent); }
        .browse-search .search-icon { color: var(--text-muted); flex-shrink: 0; }
        .browse-search .search-input { flex: 1; background: transparent; border: none; outline: none; color: var(--text); font-size: 15px; }
        .browse-search .search-clear { background: transparent; color: var(--text-muted); padding: 2px 6px; border-radius: 4px; }
        .browse-search .search-submit { background: var(--accent); color: #000; padding: 6px 16px; border-radius: 6px; font-size: 13px; font-weight: 600; }
        .browse-queue { padding: 0 5%; margin-bottom: 24px; }
        .browse-search-results { padding-top: 20px; }
        .search-grid { padding: 0 5%; display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
        .search-card { aspect-ratio: 2/3; border-radius: 6px; overflow: hidden; cursor: pointer; background: var(--surface2); transition: transform 0.15s; }
        .search-card:hover { transform: scale(1.04); }
        .search-card img { width: 100%; height: 100%; object-fit: cover; }
        .search-card-fallback { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; padding: 10px; text-align: center; color: var(--text-muted); font-size: 12px; }
        @media (max-width: 768px) {
          .browse-search, .browse-queue { padding: 0 16px; }
          .search-grid { padding: 0 16px; grid-template-columns: repeat(3, 1fr); gap: 10px; }
        }
        @media (max-width: 480px) {
          .search-grid { grid-template-columns: repeat(2, 1fr); gap: 8px; }
        }
      `}</style>
    </div>
  )
}
