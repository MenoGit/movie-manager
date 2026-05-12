"""TMDb client for TV endpoints. Shares the API key / BASE / poster helpers
with the movie service to avoid duplication."""

import httpx
from .tmdb import BASE, IMAGE_BASE, _params, poster_url  # noqa: F401  (re-exported)


# Network / streaming-service IDs on TMDb (use with discover_tv with_networks)
TV_NETWORKS = {
    "netflix": 213,
    "disney_plus": 2739,
    "hbo_max": 49,
    "prime": 1024,
    "hulu": 453,
    "apple_tv_plus": 2552,
    "paramount_plus": 4330,
    "peacock": 3353,
}


async def _get(path: str, **params) -> dict:
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{BASE}{path}", params=_params(**params))
        r.raise_for_status()
        return r.json()


async def discover_tv(**params) -> list:
    """Generic /discover/tv. Accepts any TMDb discover params as kwargs;
    use **{"vote_count.gte": ...} for dotted keys Python can't name directly."""
    data = await _get("/discover/tv", **params)
    return data.get("results", [])


async def get_trending_tv(time_window: str = "week", page: int = 1) -> list:
    data = await _get(f"/trending/tv/{time_window}", page=page)
    return data.get("results", [])


async def get_popular_tv(page: int = 1) -> list:
    data = await _get("/tv/popular", page=page)
    return data.get("results", [])


async def get_top_rated_tv(page: int = 1) -> list:
    data = await _get("/tv/top_rated", page=page)
    return data.get("results", [])


async def get_on_the_air(page: int = 1) -> list:
    """Shows airing somewhere in the world in the next 7 days."""
    data = await _get("/tv/on_the_air", page=page)
    return data.get("results", [])


async def get_airing_today(page: int = 1) -> list:
    """Shows airing today."""
    data = await _get("/tv/airing_today", page=page)
    return data.get("results", [])


async def search_tv(query: str) -> list:
    data = await _get("/search/tv", query=query)
    return data.get("results", [])


async def get_tv_detail(tv_id: int) -> dict:
    """Full show metadata + extras (videos, credits, watch/providers, content_ratings)."""
    data = await _get(
        f"/tv/{tv_id}",
        append_to_response="videos,credits,watch/providers,content_ratings",
    )

    # Extract US streaming providers (flatrate / free / ads) for convenience
    us_providers = data.get("watch/providers", {}).get("results", {}).get("US", {})
    data["streaming_services"] = us_providers.get("flatrate", []) or us_providers.get("free", [])

    # Trailer convenience field
    data["trailer"] = next(
        (
            v
            for v in data.get("videos", {}).get("results", [])
            if v.get("type") == "Trailer" and v.get("site") == "YouTube"
        ),
        None,
    )

    # US content rating (TV-MA / TV-14 / etc.)
    us_rating = next(
        (
            cr.get("rating")
            for cr in data.get("content_ratings", {}).get("results", [])
            if cr.get("iso_3166_1") == "US"
        ),
        None,
    )
    data["us_rating"] = us_rating
    return data


async def get_tv_season(tv_id: int, season_number: int) -> dict:
    """Episode list and per-episode metadata for one season."""
    return await _get(f"/tv/{tv_id}/season/{season_number}")


async def get_tv_recommendations(tv_id: int, page: int = 1) -> list:
    data = await _get(f"/tv/{tv_id}/recommendations", page=page)
    return data.get("results", [])


async def get_tv_genres() -> list:
    data = await _get("/genre/tv/list")
    return data.get("genres", [])


async def get_tv_by_genre(genre_id: int, page: int = 1) -> list:
    return await discover_tv(with_genres=genre_id, sort_by="popularity.desc", page=page)


async def get_tv_by_network(network_id: int, page: int = 1) -> list:
    return await discover_tv(with_networks=network_id, sort_by="popularity.desc", page=page)


async def get_all_time_best_tv(page: int = 1) -> list:
    """High-rated shows with enough votes to be meaningful. TV thresholds are
    lower than movies — fewer TMDb users rate shows."""
    return await discover_tv(
        sort_by="vote_average.desc",
        page=page,
        **{"vote_count.gte": 300},
    )


async def get_hidden_gems_tv(page: int = 1) -> list:
    return await discover_tv(
        sort_by="vote_average.desc",
        page=page,
        **{"vote_average.gte": 8.0, "vote_count.gte": 50, "vote_count.lte": 1000},
    )


_TV_DECADE_STARTS = {"70s": 1970, "80s": 1980, "90s": 1990, "00s": 2000, "10s": 2010, "20s": 2020}


async def get_tv_by_decade(decade: str, page: int = 1) -> list:
    start = _TV_DECADE_STARTS.get(decade)
    if start is None:
        return []
    end = start + 9
    return await discover_tv(
        sort_by="popularity.desc",
        page=page,
        **{
            "first_air_date.gte": f"{start}-01-01",
            "first_air_date.lte": f"{end}-12-31",
        },
    )
