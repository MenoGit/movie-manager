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

async def get_torrents() -> list:
    """Get all active torrents."""
    async with _get_client() as client:
        r = await client.get("/api/v2/torrents/info", params={"category": "movies"})
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
