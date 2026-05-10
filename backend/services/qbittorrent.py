import httpx
import os
from config import settings

QBT = settings.qbit_url

async def _get_client() -> httpx.AsyncClient:
    """Returns an authenticated qBittorrent client."""
    client = httpx.AsyncClient(base_url=QBT)
    await client.post("/api/v2/auth/login", data={
        "username": settings.qbit_username,
        "password": settings.qbit_password
    })
    return client

async def add_torrent(magnet: str, movie_title: str) -> dict:
    """Add a torrent, create movie folder, return save path."""
    safe_title = "".join(c for c in movie_title if c.isalnum() or c in " ._-").strip()
    save_path = os.path.join(settings.movies_path, safe_title)

    client = await _get_client()
    async with client:
        r = await client.post("/api/v2/torrents/add", data={
            "urls": magnet,
            "savepath": save_path,
            "category": "movies",
        })
        r.raise_for_status()
    return {"save_path": save_path, "title": safe_title}

async def get_torrents() -> list:
    """Get all active torrents."""
    client = await _get_client()
    async with client:
        r = await client.get("/api/v2/torrents/info", params={"category": "movies"})
        r.raise_for_status()
        return r.json()

async def delete_torrent(torrent_hash: str, delete_files: bool = False):
    """Delete torrent (keep files by default)."""
    client = await _get_client()
    async with client:
        await client.post("/api/v2/torrents/delete", data={
            "hashes": torrent_hash,
            "deleteFiles": str(delete_files).lower()
        })

async def get_main_data() -> dict:
    """Get overall transfer info including disk space."""
    client = await _get_client()
    async with client:
        r = await client.get("/api/v2/sync/maindata")
        r.raise_for_status()
        return r.json()
