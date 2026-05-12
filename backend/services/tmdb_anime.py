"""TMDb client for anime (animation + 'anime' keyword filter).
Most endpoints share params: with_genres=16 (Animation), with_keywords=210024 (anime).
For TV anime that's discover/tv; for anime films it's discover/movie."""

import httpx
from .tmdb import BASE, _params, poster_url  # noqa: F401

# TMDb identifiers
ANIMATION_GENRE_TV = 16
ANIMATION_GENRE_MOVIE = 16
ANIME_KEYWORD = 210024

# Static list of subgenres for the UI. Where TMDb has a direct genre we
# use with_genres; for anime-specific labels (Mecha, Slice of Life) we use
# keyword IDs. Keyword IDs sourced from TMDb's keyword catalog.
ANIME_SUBGENRES = [
    {"id": 10759, "name": "Action",       "kind": "genre"},   # TV "Action & Adventure"
    {"id": 35,    "name": "Comedy",       "kind": "genre"},
    {"id": 18,    "name": "Drama",        "kind": "genre"},
    {"id": 10765, "name": "Fantasy",      "kind": "genre"},   # TV "Sci-Fi & Fantasy"
    {"id": 9648,  "name": "Mystery",      "kind": "genre"},
    {"id": 6075,  "name": "Mecha",        "kind": "keyword"},
    {"id": 9799,  "name": "Romance",      "kind": "keyword"},
    {"id": 10183, "name": "Slice of Life", "kind": "keyword"},
    {"id": 6152,  "name": "Supernatural", "kind": "keyword"},
    {"id": 6075,  "name": "Sports",       "kind": "keyword"},
]


def _anime_filter() -> dict:
    """Base discover params restricting to anime: Animation genre + anime keyword."""
    return {
        "with_genres": str(ANIMATION_GENRE_TV),
        "with_keywords": str(ANIME_KEYWORD),
    }


async def _get(path: str, **params) -> dict:
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{BASE}{path}", params=_params(**params))
        r.raise_for_status()
        return r.json()


async def _discover_tv(**extra) -> list:
    data = await _get("/discover/tv", **{**_anime_filter(), **extra})
    return data.get("results", [])


async def _discover_movie(**extra) -> list:
    data = await _get("/discover/movie",
                      with_genres=str(ANIMATION_GENRE_MOVIE),
                      with_keywords=str(ANIME_KEYWORD),
                      **extra)
    return data.get("results", [])


async def get_trending_anime(page: int = 1) -> list:
    """Anime trending — discover sorted by popularity rather than the
    TMDb /trending endpoint, since the latter has no keyword filter."""
    return await _discover_tv(sort_by="popularity.desc", page=page)


async def get_popular_anime(page: int = 1) -> list:
    return await _discover_tv(sort_by="popularity.desc", page=page)


async def get_top_rated_anime(page: int = 1) -> list:
    return await _discover_tv(
        sort_by="vote_average.desc",
        page=page,
        **{"vote_count.gte": 200},
    )


async def get_airing_anime(page: int = 1) -> list:
    """Anime currently airing. Restrict by recent first_air_date."""
    from datetime import date, timedelta
    today = date.today()
    recent = (today - timedelta(days=120)).isoformat()
    return await _discover_tv(
        sort_by="popularity.desc",
        page=page,
        **{
            "air_date.gte": recent,
            "air_date.lte": today.isoformat(),
        },
    )


async def get_anime_movies(page: int = 1) -> list:
    """Anime films (Spirited Away, Your Name, Akira, etc.)."""
    return await _discover_movie(sort_by="popularity.desc", page=page)


async def search_anime(query: str) -> list:
    """Search TV with animation genre filter post-applied — TMDb's /search/tv
    doesn't accept with_genres directly, so we filter client-side after the
    text search."""
    data = await _get("/search/tv", query=query)
    results = data.get("results", [])
    # Keep results whose genre_ids include Animation (16)
    animation = [r for r in results if ANIMATION_GENRE_TV in (r.get("genre_ids") or [])]
    # If genre filter strips everything (some entries lack genre_ids), fall back to raw results
    return animation or results


async def get_anime_detail(tv_id: int) -> dict:
    """Show detail — same shape as TV detail since anime uses TV endpoints."""
    data = await _get(
        f"/tv/{tv_id}",
        append_to_response="videos,credits,watch/providers,content_ratings",
    )
    us_providers = data.get("watch/providers", {}).get("results", {}).get("US", {})
    data["streaming_services"] = us_providers.get("flatrate", []) or us_providers.get("free", [])
    data["trailer"] = next(
        (
            v for v in data.get("videos", {}).get("results", [])
            if v.get("type") == "Trailer" and v.get("site") == "YouTube"
        ),
        None,
    )
    return data


async def get_anime_season(tv_id: int, season_number: int) -> dict:
    return await _get(f"/tv/{tv_id}/season/{season_number}")


async def get_anime_genres() -> list:
    """Return the curated subgenre list for the UI."""
    return ANIME_SUBGENRES


async def get_anime_by_subgenre(subgenre_id: int, kind: str, page: int = 1) -> list:
    """Discover anime narrowed by either a TMDb genre id or a keyword id."""
    if kind == "keyword":
        return await _discover_tv(
            sort_by="popularity.desc",
            page=page,
            with_keywords=f"{ANIME_KEYWORD},{subgenre_id}",
        )
    # Combine the base anime genre filter with the requested genre
    return await _discover_tv(
        sort_by="popularity.desc",
        page=page,
        with_genres=f"{ANIMATION_GENRE_TV},{subgenre_id}",
    )
