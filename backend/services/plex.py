import httpx
from config import settings

BASE = settings.plex_url
HEADERS = {"X-Plex-Token": settings.plex_token, "Accept": "application/json"}

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

async def get_library_movies() -> list[str]:
    """Return list of movie titles already in Plex library."""
    key = await get_movies_section_key()
    if not key:
        return []
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{BASE}/library/sections/{key}/all", headers=HEADERS)
        r.raise_for_status()
        items = r.json()["MediaContainer"].get("Metadata", [])
    return [item["title"].lower() for item in items]

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
