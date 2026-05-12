import random
from typing import Optional
from fastapi import APIRouter, Query
from services import tmdb, plex

router = APIRouter(prefix="/movies", tags=["movies"])


async def _annotate(movies):
    """Annotate each movie with in_library + poster_url. TMDb ID match is
    authoritative for Plex-mapped library items; normalized-title fallback
    only catches the small set of library items Plex couldn't map to a TMDb id."""
    index = await plex.get_library_index()
    tmdb_ids = index["tmdb_ids"]
    fallback_titles = index["fallback_titles"]
    for m in movies:
        mid = m.get("id")
        in_lib = bool(mid and mid in tmdb_ids)
        if not in_lib and fallback_titles:
            in_lib = plex.normalize_title(m.get("title", "")) in fallback_titles
        m["in_library"] = in_lib
        m["poster_url"] = tmdb.poster_url(m.get("poster_path"))
    return movies


def _filter_kwargs(min_rating, year_from, year_to, include_adult, sort_by):
    return {
        "min_rating": min_rating,
        "year_from": year_from,
        "year_to": year_to,
        "include_adult": include_adult,
        "sort_by": sort_by,
    }


@router.get("/trending")
async def trending(
    window: str = "week",
    page: int = 1,
    min_rating: Optional[float] = None,
    year_from: Optional[int] = None,
    year_to: Optional[int] = None,
    include_adult: bool = False,
    sort_by: Optional[str] = None,
):
    return await _annotate(await tmdb.get_trending(
        window, page, **_filter_kwargs(min_rating, year_from, year_to, include_adult, sort_by)
    ))


@router.get("/top-rated")
async def top_rated(
    page: int = 1,
    min_rating: Optional[float] = None,
    year_from: Optional[int] = None,
    year_to: Optional[int] = None,
    include_adult: bool = False,
    sort_by: Optional[str] = None,
):
    return await _annotate(await tmdb.get_top_rated(
        page, **_filter_kwargs(min_rating, year_from, year_to, include_adult, sort_by)
    ))


@router.get("/now-playing")
async def now_playing(
    page: int = 1,
    min_rating: Optional[float] = None,
    year_from: Optional[int] = None,
    year_to: Optional[int] = None,
    include_adult: bool = False,
    sort_by: Optional[str] = None,
):
    return await _annotate(await tmdb.get_now_playing(
        page, **_filter_kwargs(min_rating, year_from, year_to, include_adult, sort_by)
    ))


@router.get("/popular")
async def popular(
    page: int = 1,
    min_rating: Optional[float] = None,
    year_from: Optional[int] = None,
    year_to: Optional[int] = None,
    include_adult: bool = False,
    sort_by: Optional[str] = None,
):
    return await _annotate(await tmdb.get_popular(
        page, **_filter_kwargs(min_rating, year_from, year_to, include_adult, sort_by)
    ))


@router.get("/upcoming")
async def upcoming(
    page: int = 1,
    min_rating: Optional[float] = None,
    year_from: Optional[int] = None,
    year_to: Optional[int] = None,
    include_adult: bool = False,
    sort_by: Optional[str] = None,
):
    return await _annotate(await tmdb.get_upcoming(
        page, **_filter_kwargs(min_rating, year_from, year_to, include_adult, sort_by)
    ))


@router.get("/all-time-best")
async def all_time_best(
    page: int = 1,
    min_rating: Optional[float] = None,
    year_from: Optional[int] = None,
    year_to: Optional[int] = None,
    include_adult: bool = False,
    sort_by: Optional[str] = None,
):
    return await _annotate(await tmdb.get_all_time_best(
        page, **_filter_kwargs(min_rating, year_from, year_to, include_adult, sort_by)
    ))


@router.get("/hidden-gems")
async def hidden_gems(
    page: int = 1,
    min_rating: Optional[float] = None,
    year_from: Optional[int] = None,
    year_to: Optional[int] = None,
    include_adult: bool = False,
    sort_by: Optional[str] = None,
):
    return await _annotate(await tmdb.get_hidden_gems(
        page, **_filter_kwargs(min_rating, year_from, year_to, include_adult, sort_by)
    ))


@router.get("/decade/{decade}")
async def by_decade(
    decade: str,
    page: int = 1,
    min_rating: Optional[float] = None,
    year_from: Optional[int] = None,
    year_to: Optional[int] = None,
    include_adult: bool = False,
    sort_by: Optional[str] = None,
):
    return await _annotate(await tmdb.get_by_decade(
        decade, page, **_filter_kwargs(min_rating, year_from, year_to, include_adult, sort_by)
    ))


@router.get("/date-night")
async def date_night(
    page: int = 1,
    min_rating: Optional[float] = None,
    year_from: Optional[int] = None,
    year_to: Optional[int] = None,
    include_adult: bool = False,
    sort_by: Optional[str] = None,
):
    return await _annotate(await tmdb.get_date_night(
        page, **_filter_kwargs(min_rating, year_from, year_to, include_adult, sort_by)
    ))


@router.get("/streaming/{provider_id}")
async def by_streaming(
    provider_id: int,
    page: int = 1,
    min_rating: Optional[float] = None,
    year_from: Optional[int] = None,
    year_to: Optional[int] = None,
    include_adult: bool = False,
    sort_by: Optional[str] = None,
):
    return await _annotate(await tmdb.get_by_streaming(
        provider_id, page, **_filter_kwargs(min_rating, year_from, year_to, include_adult, sort_by)
    ))


@router.get("/fresh-rips")
async def fresh_rips(
    page: int = 1,
    min_rating: Optional[float] = None,
    year_from: Optional[int] = None,
    year_to: Optional[int] = None,
    include_adult: bool = False,
    sort_by: Optional[str] = None,
):
    movies = await tmdb.get_fresh_rips(
        page, **_filter_kwargs(min_rating, year_from, year_to, include_adult, sort_by)
    )
    annotated = await _annotate(movies)
    for m in annotated:
        m["fresh_rip"] = True
    return annotated


@router.get("/oscar-winners")
async def oscar_winners(
    page: int = 1,
    min_rating: Optional[float] = None,
    year_from: Optional[int] = None,
    year_to: Optional[int] = None,
    include_adult: bool = False,
    sort_by: Optional[str] = None,
):
    return await _annotate(await tmdb.get_oscar_winners(
        page, **_filter_kwargs(min_rating, year_from, year_to, include_adult, sort_by)
    ))


@router.get("/genre/{genre_id}")
async def by_genre(
    genre_id: int,
    page: int = 1,
    min_rating: Optional[float] = None,
    year_from: Optional[int] = None,
    year_to: Optional[int] = None,
    include_adult: bool = False,
    sort_by: Optional[str] = None,
):
    return await _annotate(await tmdb.get_by_genre(
        genre_id, page, **_filter_kwargs(min_rating, year_from, year_to, include_adult, sort_by)
    ))


@router.get("/genres")
async def genres():
    return await tmdb.get_genres()


@router.get("/recommendations/{movie_id}")
async def recommendations(movie_id: int, page: int = 1):
    return await _annotate(await tmdb.get_recommendations(movie_id, page))


@router.get("/because-you-downloaded")
async def because_you_downloaded(count: int = 3):
    """Pick N random library movies (with TMDb ids) and return each with its
    recommendations. Frontend renders one row per seed."""
    library = await plex.get_library_items_with_tmdb()
    pool = [m for m in library if m.get("tmdb_id")]
    if not pool:
        return []
    seeds = random.sample(pool, min(count, len(pool)))
    rows = []
    for seed in seeds:
        recs = await tmdb.get_recommendations(seed["tmdb_id"])
        rows.append({"seed": seed, "recommendations": await _annotate(recs)})
    return rows


@router.get("/search")
async def search(q: str = Query(..., min_length=1)):
    return await _annotate(await tmdb.search_movies(q))


@router.get("/{movie_id}")
async def movie_detail(movie_id: int):
    detail = await tmdb.get_movie_detail(movie_id)
    index = await plex.get_library_index()
    in_lib = movie_id in index["tmdb_ids"]
    if not in_lib and index["fallback_titles"]:
        in_lib = plex.normalize_title(detail.get("title", "")) in index["fallback_titles"]
    detail["in_library"] = in_lib
    detail["poster_url"] = tmdb.poster_url(detail.get("poster_path"))
    return detail
