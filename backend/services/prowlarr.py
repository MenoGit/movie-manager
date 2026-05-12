import re
import httpx
from config import settings

BASE = settings.prowlarr_url
HEADERS = {"X-Api-Key": settings.prowlarr_api_key}

def _format(results: list) -> list:
    results = [t for t in results if t.get("seeders", 0) > 0]
    results.sort(key=lambda x: x.get("seeders", 0), reverse=True)
    return [
        {
            "title": t.get("title"),
            "size": t.get("size"),
            "seeders": t.get("seeders"),
            "leechers": t.get("leechers"),
            "quality": t.get("quality"),
            "indexer": t.get("indexer"),
            "magnet": t.get("magnetUrl") or t.get("downloadUrl"),
            "info_hash": t.get("infoHash"),
        }
        for t in results
    ]


async def search_torrents(query: str, limit: int = 20) -> list:
    """Search all configured indexers in Prowlarr for a movie."""
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{BASE}/api/v1/search",
            headers=HEADERS,
            params={"query": query, "type": "movie", "limit": limit},
            timeout=30.0,
        )
        r.raise_for_status()
        return _format(r.json())


def _matches_episode(title: str, season: int, episode: int) -> bool:
    """True if the torrent title likely contains the requested S/E.
    Handles common release naming: S03E01, S3E1, 3x01, 03x01, S03.E01, etc."""
    if not title:
        return False
    norm = re.sub(r"[^A-Z0-9]", "", title.upper())
    patterns = {
        f"S{season:02d}E{episode:02d}",
        f"S{season}E{episode:02d}",
        f"S{season:02d}E{episode}",
        f"S{season}E{episode}",
        f"{season:02d}X{episode:02d}",
        f"{season}X{episode:02d}",
        f"{season:02d}X{episode}",
        f"{season}X{episode}",
    }
    return any(p in norm for p in patterns)


async def search_tv_torrents(query: str, season: int | None = None,
                              episode: int | None = None, limit: int = 20) -> list:
    """Search Prowlarr for a TV show; optionally narrow to a specific season/episode.

    Uses Prowlarr's tvsearch type (which translates per-indexer correctly for
    season-pack and full-show queries). When an episode is requested we ALSO
    post-filter by title pattern — Prowlarr's `episode` param is honored
    loosely by many indexers and tends to return the whole season."""
    params: dict = {"query": query, "type": "tvsearch", "limit": limit}
    if season is not None:
        params["season"] = season
    if episode is not None:
        params["episode"] = episode

    print(f"[prowlarr tv search] query={query!r} season={season} episode={episode}", flush=True)

    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{BASE}/api/v1/search",
            headers=HEADERS,
            params=params,
            timeout=30.0,
        )
        r.raise_for_status()
        raw = r.json()

    formatted = _format(raw)
    print(f"[prowlarr tv search] raw={len(raw)} seeded={len(formatted)}", flush=True)

    # Episode narrowing: keep only titles that actually match this S/E
    if episode is not None and season is not None:
        narrowed = [t for t in formatted if _matches_episode(t["title"], season, episode)]
        print(f"[prowlarr tv search] episode-narrowed: {len(narrowed)}", flush=True)
        if narrowed:
            return narrowed
        # Fallback: if nothing matched the pattern, return the season-wide
        # results rather than 0 — better to give user something than nothing.
        print(f"[prowlarr tv search] no S{season:02d}E{episode:02d} matches, returning season results", flush=True)
        return formatted

    return formatted
