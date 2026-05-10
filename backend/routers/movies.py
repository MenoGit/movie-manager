from fastapi import APIRouter, Query
from services import tmdb, plex

router = APIRouter(prefix="/movies", tags=["movies"])

@router.get("/trending")
async def trending(window: str = "week"):
    movies = await tmdb.get_trending(window)
    library = await plex.get_library_movies()
    for m in movies:
        m["in_library"] = m["title"].lower() in library
        m["poster_url"] = tmdb.poster_url(m.get("poster_path"))
    return movies

@router.get("/top-rated")
async def top_rated(page: int = 1):
    movies = await tmdb.get_top_rated(page)
    library = await plex.get_library_movies()
    for m in movies:
        m["in_library"] = m["title"].lower() in library
        m["poster_url"] = tmdb.poster_url(m.get("poster_path"))
    return movies

@router.get("/now-playing")
async def now_playing():
    movies = await tmdb.get_now_playing()
    library = await plex.get_library_movies()
    for m in movies:
        m["in_library"] = m["title"].lower() in library
        m["poster_url"] = tmdb.poster_url(m.get("poster_path"))
    return movies

@router.get("/genre/{genre_id}")
async def by_genre(genre_id: int, page: int = 1):
    movies = await tmdb.get_by_genre(genre_id, page)
    library = await plex.get_library_movies()
    for m in movies:
        m["in_library"] = m["title"].lower() in library
        m["poster_url"] = tmdb.poster_url(m.get("poster_path"))
    return movies

@router.get("/genres")
async def genres():
    return await tmdb.get_genres()

@router.get("/search")
async def search(q: str = Query(..., min_length=1)):
    movies = await tmdb.search_movies(q)
    library = await plex.get_library_movies()
    for m in movies:
        m["in_library"] = m["title"].lower() in library
        m["poster_url"] = tmdb.poster_url(m.get("poster_path"))
    return movies

@router.get("/{movie_id}")
async def movie_detail(movie_id: int):
    detail = await tmdb.get_movie_detail(movie_id)
    library = await plex.get_library_movies()
    detail["in_library"] = detail["title"].lower() in library
    detail["poster_url"] = tmdb.poster_url(detail.get("poster_path"))
    return detail
