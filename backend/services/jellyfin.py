"""Jellyfin media-server client. Drop-in replacement for services.plex —
same public functions, same return shapes, so routers and the auto-downloader
switch by changing only their import.

Differences from the Plex client that make this simpler:
- No section-key discovery: /Items with Recursive + IncludeItemTypes queries
  the whole server in one call.
- TMDb ids come back structured (ProviderIds.Tmdb) instead of being parsed
  out of "tmdb://..." guid strings.
- Episode lookup is one request (/Shows/{id}/Episodes) instead of walking
  season children one by one.
"""

import re
import time
import httpx
from config import settings

BASE = settings.jellyfin_url
HEADERS = {
    "Authorization": f'MediaBrowser Token="{settings.jellyfin_api_key}"',
    "Accept": "application/json",
}

_LIBRARY_CACHE = {"data": None, "ts": 0}
_TV_LIBRARY_CACHE = {"data": None, "ts": 0}
_TV_EPISODES_CACHE: dict[str, dict] = {}  # {cache_key: {"data": dict, "ts": float}}
_LIBRARY_TTL = 300  # 5 minutes


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


def _tmdb_id(item: dict) -> int | None:
    """ProviderIds.Tmdb as int, tolerating case variations and junk values."""
    for key, val in (item.get("ProviderIds") or {}).items():
        if key.lower() == "tmdb":
            try:
                return int(val)
            except (TypeError, ValueError):
                return None
    return None


async def _query_items(item_type: str, **extra_params) -> list[dict]:
    """One recursive /Items query for a whole item type across the server."""
    params = {
        "IncludeItemTypes": item_type,
        "Recursive": "true",
        "Fields": "ProviderIds,ProductionYear",
        **extra_params,
    }
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{BASE}/Items", headers=HEADERS, params=params, timeout=10)
        r.raise_for_status()
        return r.json().get("Items", [])


# ─── Movie library ────────────────────────────────────────────────────────────

async def get_library_items_with_tmdb() -> list[dict]:
    """Return library entries with title/year/tmdb_id. Cached for 5 minutes."""
    now = time.time()
    if _LIBRARY_CACHE["data"] is not None and now - _LIBRARY_CACHE["ts"] < _LIBRARY_TTL:
        return _LIBRARY_CACHE["data"]

    items = await _query_items("Movie")
    out = [
        {"title": it.get("Name", ""), "year": it.get("ProductionYear"),
         "tmdb_id": _tmdb_id(it)}
        for it in items
    ]
    _LIBRARY_CACHE.update(data=out, ts=now)
    return out


async def get_library_index() -> dict:
    """Return lookup sets for in-library matching. Shares the 5-minute cache
    with get_library_items_with_tmdb().

    'tmdb_ids' is authoritative for any TMDb-mapped library item.
    'fallback_titles' contains normalized titles ONLY of items Jellyfin
    couldn't match to a TMDb id — so title-based matching can't falsely flag
    a movie that happens to share a title with a mapped library item."""
    items = await get_library_items_with_tmdb()
    return {
        "tmdb_ids": {it["tmdb_id"] for it in items if it.get("tmdb_id")},
        "fallback_titles": {
            normalize_title(it["title"])
            for it in items
            if it.get("title") and not it.get("tmdb_id")
        },
    }


async def get_recently_added(limit: int = 10) -> list:
    """Most recently added movies, newest first. Normalized shape (not raw
    Jellyfin items): title/year/rating/tmdb_id/item_id. item_id feeds the
    backend image proxy; tmdb_id lets the frontend open the detail modal."""
    items = await _query_items(
        "Movie", SortBy="DateCreated", SortOrder="Descending", Limit=str(limit))
    return [
        {
            "title": it.get("Name", ""),
            "year": it.get("ProductionYear"),
            "rating": it.get("CommunityRating"),
            "tmdb_id": _tmdb_id(it),
            "item_id": it.get("Id"),
        }
        for it in items
    ]


async def refresh_library():
    """Trigger a scan of all Jellyfin libraries. Jellyfin's refresh endpoint
    is server-wide (no per-library granularity needed here)."""
    async with httpx.AsyncClient() as client:
        r = await client.post(f"{BASE}/Library/Refresh", headers=HEADERS, timeout=10)
        r.raise_for_status()
    return {"status": "refresh triggered"}


async def get_poster_image(item_id: str, max_width: int = 400) -> tuple[bytes, str]:
    """Fetch an item's primary poster image. Returns (bytes, content_type).
    Used by the backend image-proxy route so the browser never needs direct
    Jellyfin access (or its API key)."""
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{BASE}/Items/{item_id}/Images/Primary",
            headers=HEADERS, params={"maxWidth": max_width}, timeout=10,
        )
        r.raise_for_status()
        return r.content, r.headers.get("content-type", "image/jpeg")


# ─── TV library ───────────────────────────────────────────────────────────────

async def get_tv_library_items_with_tmdb() -> list[dict]:
    """Return TV library entries with title/year/tmdb_id. Cached for 5 minutes.
    item_id (Jellyfin GUID) is carried for episode lookups, mirroring the
    rating_key the Plex client carried."""
    now = time.time()
    if _TV_LIBRARY_CACHE["data"] is not None and now - _TV_LIBRARY_CACHE["ts"] < _LIBRARY_TTL:
        return _TV_LIBRARY_CACHE["data"]

    items = await _query_items("Series")
    out = [
        {"title": it.get("Name", ""), "year": it.get("ProductionYear"),
         "tmdb_id": _tmdb_id(it), "item_id": it.get("Id")}
        for it in items
    ]
    _TV_LIBRARY_CACHE.update(data=out, ts=now)
    return out


async def get_tv_library_shows() -> list[str]:
    """Return list of show titles in the Jellyfin TV library (for quick checks)."""
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


async def refresh_tv_library():
    """Same server-wide refresh as refresh_library(); kept as a separate
    function to preserve the media-server interface routers already use."""
    return await refresh_library()


async def get_tv_show_episodes(show_title: str, tmdb_id: int | None = None) -> dict:
    """Return {season_number: [episode_numbers]} for a show present in
    Jellyfin. Cached per show for 5 minutes. Matches by TMDb id when provided
    (most reliable), falls back to normalized title otherwise."""
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
        f"[jellyfin tv episodes] lookup show_title={show_title!r} tmdb_id={tmdb_id} "
        f"→ found={bool(show)} "
        + (f"(title={show['title']!r} item_id={show.get('item_id')})" if show else ""),
        flush=True,
    )

    if not show or not show.get("item_id"):
        _TV_EPISODES_CACHE[cache_key] = {"data": {}, "ts": now}
        return {}

    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{BASE}/Shows/{show['item_id']}/Episodes",
            headers=HEADERS, timeout=10,
        )
        r.raise_for_status()
        episodes = r.json().get("Items", [])

    result: dict[int, list[int]] = {}
    for ep in episodes:
        season_idx = ep.get("ParentIndexNumber")
        ep_idx = ep.get("IndexNumber")
        if season_idx is None or ep_idx is None:
            continue
        result.setdefault(int(season_idx), []).append(int(ep_idx))
    for season_idx in result:
        result[season_idx].sort()

    print(
        f"[jellyfin tv episodes] {show['title']!r} → seasons={sorted(result.keys())} "
        f"total_eps={sum(len(v) for v in result.values())}",
        flush=True,
    )
    _TV_EPISODES_CACHE[cache_key] = {"data": result, "ts": now}
    return result
