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

// Downloads
export const searchTorrents = (q) => api.get('/downloads/search', { params: { q } })
export const addTorrent = (magnet, movie_title) => api.post('/downloads/add', { magnet, movie_title })
export const getQueue = () => api.get('/downloads/queue')
export const deleteTorrent = (hash) => api.delete(`/downloads/${hash}`)
export const refreshPlex = () => api.post('/downloads/plex-refresh')
export const getStorage = () => api.get('/downloads/storage')
export const getRecentlyAdded = () => api.get('/downloads/plex/recently-added')
