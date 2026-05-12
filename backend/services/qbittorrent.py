import httpx
import os
from contextlib import asynccontextmanager
from urllib.parse import urlparse, urlunparse
from fastapi import HTTPException
from config import settings

QBT = settings.qbit_url

def _rewrite_for_host(url: str) -> str:
    """qBit runs on the host and can't resolve docker service names; rewrite
    Prowlarr's internal download URLs to the host-mapped equivalent."""
    if not url or url.startswith("magnet:"):
        return url
    internal = urlparse(settings.prowlarr_url)
    parsed = urlparse(url)
    if parsed.hostname == internal.hostname:
        new_netloc = f"localhost:{parsed.port}" if parsed.port else "localhost"
        return urlunparse(parsed._replace(netloc=new_netloc))
    return url

@asynccontextmanager
async def _get_client():
    """Yields an authenticated qBittorrent client; closes on exit."""
    async with httpx.AsyncClient(base_url=QBT) as client:
        try:
            r = await client.post("/api/v2/auth/login", data={
                "username": settings.qbit_username,
                "password": settings.qbit_password
            })
        except httpx.RequestError as e:
            raise HTTPException(status_code=502, detail=f"qBittorrent unreachable at {QBT}: {e}")

        if r.status_code == 403:
            raise HTTPException(status_code=502, detail=f"qBittorrent rejected login (HTTP 403): {r.text.strip()}")
        if r.status_code != 200 or r.text.strip() != "Ok.":
            raise HTTPException(status_code=502, detail=f"qBittorrent login failed (HTTP {r.status_code}): {r.text.strip()!r}. Check QBIT_USERNAME/QBIT_PASSWORD in .env.")
        yield client

async def add_torrent(magnet: str, movie_title: str) -> dict:
    """Add a torrent, create movie folder, return save path."""
    safe_title = "".join(c for c in movie_title if c.isalnum() or c in " ._-").strip()
    save_path = os.path.join(settings.movies_path, safe_title)

    async with _get_client() as client:
        r = await client.post("/api/v2/torrents/add", data={
            "urls": _rewrite_for_host(magnet),
            "savepath": save_path,
            "category": "movies",
        })
        r.raise_for_status()
    return {"save_path": save_path, "title": safe_title}

async def add_anime_torrent(magnet: str, show_title: str, season_number: int) -> dict:
    """Save under TV-Shows path (Plex treats anime as TV) but with a separate
    'anime' qBit category so the queue stays separate from regular TV downloads."""
    safe_show = "".join(c for c in show_title if c.isalnum() or c in " ._-").strip()
    season_folder = f"Season {int(season_number):02d}"
    save_path = os.path.join(settings.tv_shows_path, safe_show, season_folder)
    async with _get_client() as client:
        r = await client.post("/api/v2/torrents/add", data={
            "urls": _rewrite_for_host(magnet),
            "savepath": save_path,
            "category": "anime",
        })
        r.raise_for_status()
    return {"save_path": save_path, "show": safe_show, "season": int(season_number)}


async def add_tv_torrent(magnet: str, show_title: str, season_number: int) -> dict:
    """Add a TV-show torrent. Save path is `<TV_SHOWS_PATH>/<Show Name>/Season XX/`
    so Plex's TV agent picks it up automatically."""
    safe_show = "".join(c for c in show_title if c.isalnum() or c in " ._-").strip()
    season_folder = f"Season {int(season_number):02d}"
    save_path = os.path.join(settings.tv_shows_path, safe_show, season_folder)

    async with _get_client() as client:
        r = await client.post("/api/v2/torrents/add", data={
            "urls": _rewrite_for_host(magnet),
            "savepath": save_path,
            "category": "tv",
        })
        r.raise_for_status()
    return {"save_path": save_path, "show": safe_show, "season": int(season_number)}


async def get_torrents(category: str = "movies") -> list:
    """Get active torrents for a category. Defaults to 'movies' for back-compat."""
    async with _get_client() as client:
        r = await client.get("/api/v2/torrents/info", params={"category": category})
        r.raise_for_status()
        return r.json()

async def delete_torrent(torrent_hash: str, delete_files: bool = False):
    """Delete torrent (keep files by default)."""
    async with _get_client() as client:
        await client.post("/api/v2/torrents/delete", data={
            "hashes": torrent_hash,
            "deleteFiles": str(delete_files).lower()
        })

async def get_main_data() -> dict:
    """Get overall transfer info including disk space."""
    async with _get_client() as client:
        r = await client.get("/api/v2/sync/maindata")
        r.raise_for_status()
        return r.json()
