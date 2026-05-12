import asyncio
from datetime import date, datetime, timedelta
import httpx
from config import settings

BASE = "https://api.themoviedb.org/3"
IMAGE_BASE = "https://image.tmdb.org/t/p/w500"

# Curated set of Best Picture winners (TMDb IDs). Extend as needed.
OSCAR_BEST_PICTURE_IDS = [
    872585,  # Oppenheimer (2023)
    545611,  # Everything Everywhere All at Once (2022)
    776503,  # CODA (2021)
    581734,  # Nomadland (2020)
    496243,  # Parasite (2019)
    490132,  # Green Book (2018)
    399055,  # The Shape of Water (2017)
    376867,  # Moonlight (2016)
    314365,  # Spotlight (2015)
    194662,  # Birdman (2014)
    76203,   # 12 Years a Slave (2013)
    84892,   # Argo (2012)
    74643,   # The Artist (2011)
    45269,   # The King's Speech (2010)
    12405,   # The Hurt Locker (2009)
    1924,    # Slumdog Millionaire (2008)
    6977,    # No Country for Old Men (2007)
    1422,    # The Departed (2006)
    1640,    # Crash (2005)
    70,      # Million Dollar Baby (2004)
    122,     # The Lord of the Rings: The Return of the King (2003)
    597,     # Titanic (1997)
    13,      # Forrest Gump (1994)
    274,     # The Silence of the Lambs (1991)
    238,     # The Godfather (1972)
]

def _params(**extra):
    return {"api_key": settings.tmdb_api_key, **extra}

def _filters_active(filters: dict) -> bool:
    return bool(
        filters.get("min_rating")
        or filters.get("year_from")
        or filters.get("year_to")
        or filters.get("include_adult")
        or filters.get("sort_by")
    )

def _apply_filters(base: dict, *, min_rating=None, year_from=None, year_to=None,
                   include_adult=False, sort_by=None) -> dict:
    """Merge user filter params onto a base discover params dict.
    Year ranges intersect (tighter wins). sort_by overrides. adult included only if true."""
    merged = dict(base)
    if min_rating is not None and min_rating > 0:
        merged["vote_average.gte"] = min_rating
    if year_from is not None:
        new_gte = f"{year_from}-01-01"
        existing = merged.get("primary_release_date.gte")
        merged["primary_release_date.gte"] = max(existing, new_gte) if existing else new_gte
    if year_to is not None:
        new_lte = f"{year_to}-12-31"
        existing = merged.get("primary_release_date.lte")
        merged["primary_release_date.lte"] = min(existing, new_lte) if existing else new_lte
    if include_adult:
        merged["include_adult"] = "true"
    if sort_by:
        merged["sort_by"] = sort_by
    return merged

async def _discover(**params):
    """Generic TMDb discover wrapper. Pass any TMDb discover params as kwargs;
    use **{"vote_count.gte": ...} for dotted keys Python can't name directly."""
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{BASE}/discover/movie", params=_params(**params))
        r.raise_for_status()
        return r.json()["results"]

async def get_trending(time_window: str = "week", page: int = 1, **filters):
    if _filters_active(filters):
        params = _apply_filters({"sort_by": "popularity.desc"}, **filters)
        return await _discover(page=page, **params)
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{BASE}/trending/movie/{time_window}", params=_params(page=page))
        r.raise_for_status()
        return r.json()["results"]

async def get_top_rated(page: int = 1, **filters):
    if _filters_active(filters):
        params = _apply_filters(
            {"sort_by": "vote_average.desc", "vote_count.gte": 300},
            **filters,
        )
        return await _discover(page=page, **params)
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{BASE}/movie/top_rated", params=_params(page=page))
        r.raise_for_status()
        return r.json()["results"]

async def get_now_playing(page: int = 1, **filters):
    if _filters_active(filters):
        params = _apply_filters({"sort_by": "popularity.desc"}, **filters)
        return await _discover(page=page, **params)
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{BASE}/movie/now_playing", params=_params(page=page))
        r.raise_for_status()
        return r.json()["results"]

async def get_popular(page: int = 1, **filters):
    params = _apply_filters({"sort_by": "popularity.desc"}, **filters)
    return await _discover(page=page, **params)

async def get_upcoming(page: int = 1, **filters):
    if _filters_active(filters):
        params = _apply_filters({"sort_by": "popularity.desc"}, **filters)
        return await _discover(page=page, **params)
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{BASE}/movie/upcoming", params=_params(page=page))
        r.raise_for_status()
        return r.json()["results"]

async def get_all_time_best(page: int = 1, **filters):
    params = _apply_filters(
        {"sort_by": "vote_average.desc", "vote_count.gte": 1000},
        **filters,
    )
    return await _discover(page=page, **params)

async def get_hidden_gems(page: int = 1, **filters):
    params = _apply_filters(
        {"sort_by": "vote_average.desc", "vote_average.gte": 7.5,
         "vote_count.gte": 100, "vote_count.lte": 5000},
        **filters,
    )
    return await _discover(page=page, **params)

_DECADE_STARTS = {"70s": 1970, "80s": 1980, "90s": 1990, "00s": 2000, "10s": 2010, "20s": 2020}

async def get_by_decade(decade: str, page: int = 1, **filters):
    start = _DECADE_STARTS.get(decade)
    if start is None:
        return []
    end = start + 9
    params = _apply_filters(
        {
            "sort_by": "popularity.desc",
            "primary_release_date.gte": f"{start}-01-01",
            "primary_release_date.lte": f"{end}-12-31",
        },
        **filters,
    )
    return await _discover(page=page, **params)

async def get_date_night(page: int = 1, **filters):
    params = _apply_filters(
        {"sort_by": "popularity.desc", "with_genres": "10749,35"},
        **filters,
    )
    return await _discover(page=page, **params)

async def get_by_streaming(provider_id: int, page: int = 1, **filters):
    params = _apply_filters(
        {"sort_by": "popularity.desc",
         "with_watch_providers": str(provider_id), "watch_region": "US"},
        **filters,
    )
    return await _discover(page=page, **params)

async def get_oscar_winners(page: int = 1, per_page: int = 20, **filters):
    start = (page - 1) * per_page
    batch = OSCAR_BEST_PICTURE_IDS[start:start + per_page]
    if not batch:
        return []
    async with httpx.AsyncClient() as client:
        async def fetch(mid):
            r = await client.get(f"{BASE}/movie/{mid}", params=_params())
            return r.json() if r.status_code == 200 else None
        results = await asyncio.gather(*[fetch(mid) for mid in batch])
    movies = [r for r in results if r]
    # Filters apply in-memory since this is a curated ID list.
    if filters.get("min_rating"):
        movies = [m for m in movies if (m.get("vote_average") or 0) >= filters["min_rating"]]
    if filters.get("year_from"):
        cutoff = f"{filters['year_from']}-01-01"
        movies = [m for m in movies if (m.get("release_date") or "0000-00-00") >= cutoff]
    if filters.get("year_to"):
        cutoff = f"{filters['year_to']}-12-31"
        movies = [m for m in movies if (m.get("release_date") or "9999-12-31") <= cutoff]
    if not filters.get("include_adult"):
        movies = [m for m in movies if not m.get("adult")]
    sort_by = filters.get("sort_by")
    if sort_by:
        field, _, direction = sort_by.partition(".")
        key_map = {
            "vote_average": lambda m: m.get("vote_average") or 0,
            "primary_release_date": lambda m: m.get("release_date") or "",
            "revenue": lambda m: m.get("revenue") or 0,
            "popularity": lambda m: m.get("popularity") or 0,
        }
        if field in key_map:
            movies.sort(key=key_map[field], reverse=(direction != "asc"))
    return movies

async def _has_us_digital_release(client: httpx.AsyncClient, movie_id: int) -> bool:
    """Check if TMDb has a US type-4 (digital) release on file for this movie."""
    try:
        r = await client.get(f"{BASE}/movie/{movie_id}/release_dates", params=_params())
        if r.status_code != 200:
            return False
        for entry in r.json().get("results", []):
            if entry.get("iso_3166_1") == "US":
                return any(rd.get("type") == 4 for rd in entry.get("release_dates", []))
        return False
    except httpx.RequestError:
        return False


async def get_fresh_rips(page: int = 1, **filters):
    """Movies released 45-120 days ago — the sweet spot for WEB-DL/BluRay rips.
    Discover by date window + vote_count threshold, then reorder so titles with
    a TMDb-confirmed US digital release surface first."""
    today = date.today()
    base = {
        "sort_by": "popularity.desc",
        "primary_release_date.gte": (today - timedelta(days=120)).isoformat(),
        "primary_release_date.lte": (today - timedelta(days=45)).isoformat(),
        "vote_count.gte": 100,
    }
    params = _apply_filters(base, **filters)
    results = await _discover(page=page, **params)
    if not results:
        return results

    # Verify digital availability in parallel — adds one round-trip of latency
    # for the whole page rather than serial per-movie cost.
    async with httpx.AsyncClient() as client:
        confirms = await asyncio.gather(
            *[_has_us_digital_release(client, m["id"]) for m in results]
        )

    confirmed, unconfirmed = [], []
    for m, c in zip(results, confirms):
        m["digital_release_confirmed"] = bool(c)
        (confirmed if c else unconfirmed).append(m)
    return confirmed + unconfirmed


async def get_recommendations(movie_id: int, page: int = 1):
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{BASE}/movie/{movie_id}/recommendations",
            params=_params(page=page),
        )
        r.raise_for_status()
        return r.json()["results"]


async def get_by_genre(genre_id: int, page: int = 1, **filters):
    params = _apply_filters(
        {"with_genres": genre_id, "sort_by": "popularity.desc"},
        **filters,
    )
    return await _discover(page=page, **params)

async def get_genres():
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{BASE}/genre/movie/list", params=_params())
        r.raise_for_status()
        return r.json()["genres"]

_FALLBACK_REGIONS = ("US", "GB", "CA", "AU")


def _has_occurred_digital_release(entries, today):
    """Any type 4/5/6 entry whose release_date is strictly before today.
    Date-granular comparison avoids timezone boundary false-positives
    (e.g. a release_date of tomorrow appearing 'past' under UTC time).
    Entries with missing dates are treated conservatively as 'already released'."""
    types_found = set()
    for r in entries:
        t = r.get("type")
        if t not in (4, 5, 6):
            continue
        rd_str = (r.get("release_date") or "")[:10]
        if not rd_str:
            types_found.add(t)
            continue
        try:
            rd_date = date.fromisoformat(rd_str)
            if rd_date < today:
                types_found.add(t)
        except ValueError:
            types_found.add(t)
    return types_found


def _detect_theatrical_only(data: dict) -> bool:
    """True when a movie likely has no good rips yet. Aggressive heuristic that
    treats missing/region-empty data as theatrical-only when the film is recent
    (<90 days). Logs the decision inputs for debugging."""
    title = data.get("title") or "?"
    today = date.today()

    # --- Parse release date / age ---
    release_date_str = data.get("release_date") or ""
    age_days = None
    if release_date_str:
        try:
            rd = date.fromisoformat(release_date_str)
            age_days = (today - rd).days
        except ValueError:
            pass
    is_recent_90 = age_days is not None and 0 <= age_days < 90

    # --- Release types across regions (US first, then fallbacks) ---
    region_entries = {
        e.get("iso_3166_1"): e.get("release_dates", [])
        for e in data.get("release_dates", {}).get("results", [])
    }
    digital_types_by_region = {}
    for region in _FALLBACK_REGIONS:
        entries = region_entries.get(region, [])
        if entries:
            digital_types_by_region[region] = _has_occurred_digital_release(entries, today)
    # Has *any* checked region had a digital release happen?
    has_digital_anywhere = any(types for types in digital_types_by_region.values())
    # Did we get release_dates data for any of our checked regions?
    has_any_region_data = any(region_entries.get(r) for r in _FALLBACK_REGIONS)

    # --- Watch providers (US only — that's the user's region for this app) ---
    us_providers = data.get("watch/providers", {}).get("results", {}).get("US", {})
    provider_categories = [k for k in ("flatrate", "rent", "buy", "free", "ads") if us_providers.get(k)]
    has_streaming = bool(provider_categories)

    is_released = data.get("status") == "Released"

    # --- Decision ---
    flag = False
    reason = ""
    # Rule A (aggressive): recent (<90d) AND no digital release in any checked region.
    if is_recent_90 and not has_digital_anywhere:
        flag = True
        reason = f"recent ({age_days}d) + no digital release in any of {list(_FALLBACK_REGIONS)}"
    # Rule B: recent + no region data at all (TMDb has zero release_dates filed yet).
    elif is_recent_90 and not has_any_region_data:
        flag = True
        reason = f"recent ({age_days}d) + no release_dates data in any region"
    # Rule C: released + no streaming presence anywhere + no digital release.
    elif is_released and not has_streaming and not has_digital_anywhere:
        flag = True
        reason = "released + no US streaming providers + no digital release"

    # --- Debug log ---
    print(
        f"[theatrical_only] title={title!r} release={release_date_str} age_days={age_days} "
        f"status={data.get('status')!r} digital_by_region={ {r: sorted(t) for r, t in digital_types_by_region.items()} } "
        f"region_data_present={ {r: bool(region_entries.get(r)) for r in _FALLBACK_REGIONS} } "
        f"us_providers={provider_categories} → {'FLAG' if flag else 'pass'}"
        + (f" ({reason})" if reason else ""),
        flush=True,
    )
    return flag


async def get_movie_detail(movie_id: int):
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{BASE}/movie/{movie_id}",
            params=_params(append_to_response="videos,credits,watch/providers,release_dates"),
        )
        r.raise_for_status()
        data = r.json()

        # Extract streaming providers for US
        providers = data.get("watch/providers", {}).get("results", {}).get("US", {})
        data["streaming_services"] = providers.get("flatrate", [])
        data["trailer"] = next(
            (v for v in data.get("videos", {}).get("results", [])
             if v["type"] == "Trailer" and v["site"] == "YouTube"),
            None
        )
        data["theatrical_only"] = _detect_theatrical_only(data)
        return data

async def search_movies(query: str):
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{BASE}/search/movie", params=_params(query=query))
        r.raise_for_status()
        return r.json()["results"]

def poster_url(path: str) -> str:
    return f"{IMAGE_BASE}{path}" if path else None
