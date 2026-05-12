import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

function applyFilters(params, filters) {
  if (!filters) return params
  const out = { ...params }
  if (filters.sortBy && filters.sortBy !== 'default') out.sort_by = filters.sortBy
  if (filters.minRating && filters.minRating > 0) out.min_rating = filters.minRating
  if (filters.yearFrom) out.year_from = filters.yearFrom
  if (filters.yearTo) out.year_to = filters.yearTo
  if (filters.includeAdult) out.include_adult = true
  return out
}

// Movies
export const getTrending = (page = 1, filters) =>
  api.get('/movies/trending', { params: applyFilters({ page }, filters) })
export const getTrendingDay = (page = 1, filters) =>
  api.get('/movies/trending', { params: applyFilters({ page, window: 'day' }, filters) })
export const getTopRated = (page = 1, filters) =>
  api.get('/movies/top-rated', { params: applyFilters({ page }, filters) })
export const getNowPlaying = (page = 1, filters) =>
  api.get('/movies/now-playing', { params: applyFilters({ page }, filters) })
export const getPopular = (page = 1, filters) =>
  api.get('/movies/popular', { params: applyFilters({ page }, filters) })
export const getUpcoming = (page = 1, filters) =>
  api.get('/movies/upcoming', { params: applyFilters({ page }, filters) })
export const getAllTimeBest = (page = 1, filters) =>
  api.get('/movies/all-time-best', { params: applyFilters({ page }, filters) })
export const getHiddenGems = (page = 1, filters) =>
  api.get('/movies/hidden-gems', { params: applyFilters({ page }, filters) })
export const getByDecade = (decade, page = 1, filters) =>
  api.get(`/movies/decade/${decade}`, { params: applyFilters({ page }, filters) })
export const getDateNight = (page = 1, filters) =>
  api.get('/movies/date-night', { params: applyFilters({ page }, filters) })
export const getOscarWinners = (page = 1, filters) =>
  api.get('/movies/oscar-winners', { params: applyFilters({ page }, filters) })
export const getFreshRips = (page = 1, filters) =>
  api.get('/movies/fresh-rips', { params: applyFilters({ page }, filters) })
export const getByStreaming = (providerId, page = 1, filters) =>
  api.get(`/movies/streaming/${providerId}`, { params: applyFilters({ page }, filters) })
export const getByGenre = (genreId, page = 1, filters) =>
  api.get(`/movies/genre/${genreId}`, { params: applyFilters({ page }, filters) })
export const getGenres = () => api.get('/movies/genres')
export const searchMovies = (q) => api.get('/movies/search', { params: { q } })
export const getMovieDetail = (id) => api.get(`/movies/${id}`)
export const getRecommendations = (id, page = 1) =>
  api.get(`/movies/recommendations/${id}`, { params: { page } })
export const getBecauseYouDownloaded = (count = 3) =>
  api.get('/movies/because-you-downloaded', { params: { count } })

// ─── TV ──────────────────────────────────────────────────────────────────
// TMDb uses 'name' + 'first_air_date' for shows. We alias them to title +
// release_date so existing MovieCard / HeroBanner / ContentRow / utils
// (isInTheaters, hasSpanish) work for TV without modification.
function normalizeTV(s) {
  if (!s || typeof s !== 'object') return s
  return {
    ...s,
    title: s.title ?? s.name,
    release_date: s.release_date ?? s.first_air_date,
  }
}
function wrapTV(p) {
  return p.then(r => ({
    ...r,
    data: Array.isArray(r.data) ? r.data.map(normalizeTV) : normalizeTV(r.data),
  }))
}

export const getTrendingTV = (page = 1, filters) =>
  wrapTV(api.get('/tv/trending', { params: applyFilters({ page }, filters) }))
export const getTrendingTVDay = (page = 1) =>
  wrapTV(api.get('/tv/trending', { params: { page, window: 'day' } }))
export const getPopularTV = (page = 1, filters) =>
  wrapTV(api.get('/tv/popular', { params: applyFilters({ page }, filters) }))
export const getTopRatedTV = (page = 1, filters) =>
  wrapTV(api.get('/tv/top-rated', { params: applyFilters({ page }, filters) }))
export const getOnTheAir = (page = 1, filters) =>
  wrapTV(api.get('/tv/on-the-air', { params: applyFilters({ page }, filters) }))
export const getAiringToday = (page = 1, filters) =>
  wrapTV(api.get('/tv/airing-today', { params: applyFilters({ page }, filters) }))
export const getAllTimeBestTV = (page = 1, filters) =>
  wrapTV(api.get('/tv/all-time-best', { params: applyFilters({ page }, filters) }))
export const getHiddenGemsTV = (page = 1, filters) =>
  wrapTV(api.get('/tv/hidden-gems', { params: applyFilters({ page }, filters) }))
export const getTVByDecade = (decade, page = 1, filters) =>
  wrapTV(api.get(`/tv/decade/${decade}`, { params: applyFilters({ page }, filters) }))
export const getTVByGenre = (genreId, page = 1, filters) =>
  wrapTV(api.get(`/tv/genre/${genreId}`, { params: applyFilters({ page }, filters) }))
export const getTVByNetwork = (networkId, page = 1, filters) =>
  wrapTV(api.get(`/tv/network/${networkId}`, { params: applyFilters({ page }, filters) }))
export const getTVGenres = () => api.get('/tv/genres')
export const searchTV = (q) => wrapTV(api.get('/tv/search', { params: { q } }))
export const getTVDetail = (id) => wrapTV(api.get(`/tv/${id}`))
export const getTVSeason = (id, season) => api.get(`/tv/${id}/season/${season}`)

// ─── Anime ───────────────────────────────────────────────────────────────
// Anime uses TV-shaped data (name, first_air_date) so it gets the same
// normalizer as TV.
export const getTrendingAnime = (page = 1) =>
  wrapTV(api.get('/anime/trending', { params: { page } }))
export const getPopularAnime = (page = 1) =>
  wrapTV(api.get('/anime/popular', { params: { page } }))
export const getTopRatedAnime = (page = 1) =>
  wrapTV(api.get('/anime/top-rated', { params: { page } }))
export const getAiringAnime = (page = 1) =>
  wrapTV(api.get('/anime/airing', { params: { page } }))
export const getAnimeMovies = (page = 1) =>
  // Movies have title+release_date natively but wrapTV is a no-op for those
  wrapTV(api.get('/anime/movies', { params: { page } }))
export const getAnimeGenres = () => api.get('/anime/genres')
export const getAnimeBySubgenre = (subgenreId, kind = 'genre', page = 1) =>
  wrapTV(api.get(`/anime/genre/${subgenreId}`, { params: { kind, page } }))
export const searchAnime = (q) =>
  wrapTV(api.get('/anime/search', { params: { q } }))
export const getAnimeDetail = (id) => wrapTV(api.get(`/anime/${id}`))
export const getAnimeSeason = (id, season) => api.get(`/anime/${id}/season/${season}`)

// Anime downloads
export const searchAnimeTorrents = (q, season, episode) =>
  api.get('/anime-downloads/search', { params: { q, ...(season != null && { season }), ...(episode != null && { episode }) } })
export const addAnimeTorrent = (magnet, show_title, season_number) =>
  api.post('/anime-downloads/add', { magnet, show_title, season_number })
export const getAnimeQueue = () => api.get('/anime-downloads/queue')
export const deleteAnimeTorrent = (hash) => api.delete(`/anime-downloads/${hash}`)
export const refreshAnimePlex = () => api.post('/anime-downloads/plex-refresh')

// TV downloads
export const searchTVTorrents = (q, season, episode) =>
  api.get('/tv-downloads/search', { params: { q, ...(season != null && { season }), ...(episode != null && { episode }) } })
export const addTVTorrent = (magnet, show_title, season_number) =>
  api.post('/tv-downloads/add', { magnet, show_title, season_number })
export const getTVQueue = () => api.get('/tv-downloads/queue')
export const deleteTVTorrent = (hash) => api.delete(`/tv-downloads/${hash}`)
export const refreshTVPlex = () => api.post('/tv-downloads/plex-refresh')

// Downloads
export const searchTorrents = (q) => api.get('/downloads/search', { params: { q } })
export const addTorrent = (magnet, movie_title) => api.post('/downloads/add', { magnet, movie_title })
export const getQueue = () => api.get('/downloads/queue')
export const deleteTorrent = (hash) => api.delete(`/downloads/${hash}`)
export const refreshPlex = () => api.post('/downloads/plex-refresh')
export const getStorage = () => api.get('/downloads/storage')
export const getDiskUsage = () => api.get('/downloads/disk-usage')
export const getRecentlyAdded = () => api.get('/downloads/plex/recently-added')
export const getDownloadHistory = () => api.get('/downloads/history')
export const clearDownloadHistory = () => api.delete('/downloads/history')
