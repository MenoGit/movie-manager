import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

// Movies
export const getTrending = () => api.get('/movies/trending')
export const getTopRated = (page = 1) => api.get('/movies/top-rated', { params: { page } })
export const getNowPlaying = () => api.get('/movies/now-playing')
export const getByGenre = (genreId, page = 1) => api.get(`/movies/genre/${genreId}`, { params: { page } })
export const getGenres = () => api.get('/movies/genres')
export const searchMovies = (q) => api.get('/movies/search', { params: { q } })
export const getMovieDetail = (id) => api.get(`/movies/${id}`)

// Downloads
export const searchTorrents = (q) => api.get('/downloads/search', { params: { q } })
export const addTorrent = (magnet, movie_title) => api.post('/downloads/add', { magnet, movie_title })
export const getQueue = () => api.get('/downloads/queue')
export const deleteTorrent = (hash) => api.delete(`/downloads/${hash}`)
export const refreshPlex = () => api.post('/downloads/plex-refresh')
export const getStorage = () => api.get('/downloads/storage')
export const getRecentlyAdded = () => api.get('/downloads/plex/recently-added')
