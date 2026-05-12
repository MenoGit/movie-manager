import re
import time
import httpx
from config import settings

BASE = settings.plex_url
HEADERS = {"X-Plex-Token": settings.plex_token, "Accept": "application/json"}

_LIBRARY_CACHE = {"data": None, "ts": 0}
_TV_LIBRARY_CACHE = {"data": None, "ts": 0}
_TV_EPISODES_CACHE: dict[str, dict] = {}  # {normalized_title: {"data": dict, "ts": float}}
_LIBRARY_TTL = 300  # 5 minutes

async def get_library_sections() -> list:
    """Get all Plex library sections."""
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{BASE}/library/sections", headers=HEADERS)
        r.raise_for_status()
        return r.json()["MediaContainer"]["Directory"]

async def get_movies_section_key() -> str | None:
    """Find the movie library section key."""
    sections = await get_library_sections()
    for s in sections:
        if s.get("type") == "movie":
            return s["key"]
    return None

async def refresh_library():
    """Trigger a scan of the movie library."""
    key = await get_movies_section_key()
    if not key:
        return {"error": "No movie library found in Plex"}
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{BASE}/library/sections/{key}/refresh", headers=HEADERS)
        r.raise_for_status()
    return {"status": "refresh triggered", "section": key}

def normalize_title(s: str) -> str:
    """Strip articles, punctuation, and case so we can match titles loosely.
    'The Lord of the Rings: The Return of the King' -> 'lordofringsreturnoftheking-ish'
    Used as fallback when TMDb ID match isn't available."""
    if not s:
        return ""
    s = s.lower()
    for prefix in ("the ", "a ", "an "):
        if s.startswith(prefix):
            s = s[len(prefix):]
            break
    s = re.sub(r"[^a-z0-9]+", "", s)
    return s


async def get_library_index() -> dict:
    """Return lookup sets for in-library matching. Shares the 5-minute cache
    with get_library_items_with_tmdb().

    'tmdb_ids' is authoritative for any TMDb-mapped library item.
    'fallback_titles' contains normalized titles ONLY of items Plex couldn't
    match to a TMDb id — so title-based matching can't falsely flag a movie
    that happens to share a title with a Plex-matched library item."""
    items = await get_library_items_with_tmdb()
    return {
        "tmdb_ids": {it["tmdb_id"] for it in items if it.get("tmdb_id")},
        "fallback_titles": {
            normalize_title(it["title"])
            for it in items
            if it.get("title") and not it.get("tmdb_id")
        },
    }


async def get_library_items_with_tmdb() -> list[dict]:
    """Return library entries with title/year/tmdb_id. Cached for 5 minutes."""
    now = time.time()
    if _LIBRARY_CACHE["data"] is not None and now - _LIBRARY_CACHE["ts"] < _LIBRARY_TTL:
        return _LIBRARY_CACHE["data"]

    key = await get_movies_section_key()
    if not key:
        _LIBRARY_CACHE.update(data=[], ts=now)
        return []
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{BASE}/library/sections/{key}/all",
            headers=HEADERS,
            params={"includeGuids": 1},
            timeout=10,
        )
        r.raise_for_status()
        items = r.json()["MediaContainer"].get("Metadata", [])

    out = []
    for it in items:
        guids = it.get("Guid") or []
        tmdb_id = None
        for g in guids:
            gid = g.get("id", "")
            if gid.startswith("tmdb://"):
                try:
                    tmdb_id = int(gid.replace("tmdb://", ""))
                    break
                except ValueError:
                    pass
        out.append({"title": it.get("title", ""), "year": it.get("year"), "tmdb_id": tmdb_id})
    _LIBRARY_CACHE.update(data=out, ts=now)
    return out

async def get_recently_added(limit: int = 10) -> list:
    """Get recently added movies from Plex."""
    key = await get_movies_section_key()
    if not key:
        return []
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{BASE}/library/sections/{key}/recentlyAdded",
            headers=HEADERS,
            params={"X-Plex-Container-Size": limit}
        )
        r.raise_for_status()
        return r.json()["MediaContainer"].get("Metadata", [])


# ─── TV library ───────────────────────────────────────────────────────────────

async def get_tv_section_key() -> str | None:
    """Find the TV show library section key."""
    sections = await get_library_sections()
    for s in sections:
        if s.get("type") == "show":
            return s["key"]
    return None


async def refresh_tv_library():
    """Trigger a scan of the TV library."""
    key = await get_tv_section_key()
    if not key:
        return {"error": "No TV library found in Plex"}
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{BASE}/library/sections/{key}/refresh", headers=HEADERS)
        r.raise_for_status()
    return {"status": "refresh triggered", "section": key}


async def get_tv_library_items_with_tmdb() -> list[dict]:
    """Return TV library entries with title/year/tmdb_id. Cached for 5 minutes."""
    now = time.time()
    if _TV_LIBRARY_CACHE["data"] is not None and now - _TV_LIBRARY_CACHE["ts"] < _LIBRARY_TTL:
        return _TV_LIBRARY_CACHE["data"]

    key = await get_tv_section_key()
    if not key:
        _TV_LIBRARY_CACHE.update(data=[], ts=now)
        return []
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{BASE}/library/sections/{key}/all",
            headers=HEADERS,
            params={"includeGuids": 1, "type": 2},  # type=2 means "show"
            timeout=10,
        )
        r.raise_for_status()
        items = r.json()["MediaContainer"].get("Metadata", [])

    out = []
    for it in items:
        guids = it.get("Guid") or []
        tmdb_id = None
        for g in guids:
            gid = g.get("id", "")
            if gid.startswith("tmdb://"):
                try:
                    tmdb_id = int(gid.replace("tmdb://", ""))
                    break
                except ValueError:
                    pass
        out.append({
            "title": it.get("title", ""),
            "year": it.get("year"),
            "tmdb_id": tmdb_id,
            "rating_key": it.get("ratingKey"),
        })
    _TV_LIBRARY_CACHE.update(data=out, ts=now)
    return out


async def get_tv_library_shows() -> list[str]:
    """Return list of show titles in the Plex TV library (for quick checks)."""
    items = await get_tv_library_items_with_tmdb()
    return [it["title"] for it in items if it.get("title")]


async def get_tv_library_index() -> dict:
    """TMDb-id-first lookup sets for TV in_library matching. Same shape as
    get_library_index() so routers can use it uniformly."""
    items = await get_tv_library_items_with_tmdb()
    return {
        "tmdb_ids": {it["tmdb_id"] for it in items if it.get("tmdb_id")},
        "fallback_titles": {
            normalize_title(it["title"])
            for it in items
            if it.get("title") and not it.get("tmdb_id")
        },
    }


async def get_tv_show_episodes(show_title: str, tmdb_id: int | None = None) -> dict:
    """Return {season_number: [episode_numbers]} for a show present in Plex.
    Cached per show for 5 minutes. Matches by TMDb id when provided (most
    reliable — Plex sometimes appends '(US)' / '(2019)' to disambiguate
    same-named shows), falls back to normalized title otherwise."""
    target = normalize_title(show_title)
    cache_key = f"tmdb:{tmdb_id}" if tmdb_id else f"title:{target}"
    now = time.time()
    cached = _TV_EPISODES_CACHE.get(cache_key)
    if cached and now - cached["ts"] < _LIBRARY_TTL:
        return cached["data"]

    items = await get_tv_library_items_with_tmdb()
    show = None
    if tmdb_id is not None:
        show = next((it for it in items if it.get("tmdb_id") == tmdb_id), None)
    if show is None and target:
        show = next((it for it in items if normalize_title(it["title"]) == target), None)

    print(
        f"[plex tv episodes] lookup show_title={show_title!r} tmdb_id={tmdb_id} "
        f"→ found={bool(show)} "
        + (f"(title={show['title']!r} rating_key={show.get('rating_key')})" if show else ""),
        flush=True,
    )

    if not show or not show.get("rating_key"):
        _TV_EPISODES_CACHE[cache_key] = {"data": {}, "ts": now}
        return {}

    async with httpx.AsyncClient() as client:
        # Get seasons under the show
        r = await client.get(
            f"{BASE}/library/metadata/{show['rating_key']}/children",
            headers=HEADERS, timeout=10,
        )
        r.raise_for_status()
        seasons = r.json()["MediaContainer"].get("Metadata", [])

        result: dict[int, list[int]] = {}
        for season in seasons:
            season_idx = season.get("index")
            if season_idx is None:  # "All Episodes" pseudo-season
                continue
            ep_resp = await client.get(
                f"{BASE}/library/metadata/{season['ratingKey']}/children",
                headers=HEADERS, timeout=10,
            )
            ep_resp.raise_for_status()
            episodes = ep_resp.json()["MediaContainer"].get("Metadata", [])
            result[int(season_idx)] = sorted(
                int(ep["index"]) for ep in episodes if ep.get("index") is not None
            )
    print(
        f"[plex tv episodes] {show['title']!r} → seasons={sorted(result.keys())} "
        f"total_eps={sum(len(v) for v in result.values())}",
        flush=True,
    )
    _TV_EPISODES_CACHE[cache_key] = {"data": result, "ts": now}
    return result
