import httpx
from config import settings

BASE = settings.prowlarr_url
HEADERS = {"X-Api-Key": settings.prowlarr_api_key}

async def search_torrents(query: str, limit: int = 20) -> list:
    """Search all configured indexers in Prowlarr for a movie."""
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{BASE}/api/v1/search",
            headers=HEADERS,
            params={"query": query, "type": "movie", "limit": limit},
            timeout=30.0
        )
        r.raise_for_status()
        results = r.json()

    # Sort by seeders descending, filter out dead torrents
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
