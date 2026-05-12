import re
import time
import httpx
from config import settings

BASE = settings.plex_url
HEADERS = {"X-Plex-Token": settings.plex_token, "Accept": "application/json"}

_LIBRARY_CACHE = {"data": None, "ts": 0}
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
