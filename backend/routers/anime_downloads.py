from typing import Optional
from fastapi import APIRouter
from pydantic import BaseModel
import os

from services import prowlarr, qbittorrent, library, history, safe_download
from config import settings

router = APIRouter(prefix="/anime-downloads", tags=["anime-downloads"])


class AddAnimeTorrentRequest(BaseModel):
    magnet: str
    show_title: str
    season_number: int
    # Optional safety-validation context (all back-compatible):
    release_title: str | None = None
    size: int | None = None
    episode_count: int | None = None
    info_hash: str | None = None
    force: bool = False


@router.get("/search")
async def search_anime_torrents(q: str, season: Optional[int] = None,
                                  episode: Optional[int] = None, year: Optional[int] = None):
    """Anime search uses plain text Prowlarr queries — Nyaa-style release
    naming rarely follows S##E## patterns, so structured tvsearch isn't a
    good fit. `year` post-sorts matching releases to the top."""
    return await prowlarr.search_anime_torrents(q, season=season, episode=episode, year=year)


@router.post("/add")
async def add_anime_torrent(req: AddAnimeTorrentRequest):
    """Safety-validated anime add. Saves under the TV-Shows path so the TV
    agent picks it up; qBit category 'anime' keeps its queue separate."""
    safe_show = "".join(c for c in req.show_title if c.isalnum() or c in " ._-").strip()
    save_path = os.path.join(settings.tv_shows_path, safe_show,
                             f"Season {int(req.season_number):02d}")
    result = await safe_download.guarded_add(
        url=req.magnet, save_path=save_path, category="anime",
        release_title=req.release_title, size=req.size, mode="tv",
        episode_count=req.episode_count, info_hash=req.info_hash, force=req.force,
    )
    if result["status"] == "added":
        result.update(save_path=save_path, show=safe_show, season=int(req.season_number))
    return result


@router.get("/queue")
async def get_queue():
    """Active anime downloads (qBit category 'anime'). Auto-deletes finished
    items, logs to history, and triggers a TV-library refresh."""
    torrents = await qbittorrent.get_torrents(category="anime")
    completed_items = [
        t for t in torrents
        if t.get("state") == "uploading" or t.get("progress", 0) >= 1.0
    ]
    completed = {t["hash"] for t in completed_items}
    for t in completed_items:
        await history.append({
            "type": "anime",
            "name": t.get("name"),
            "hash": t.get("hash"),
            "size": t.get("size"),
        })
        await qbittorrent.delete_torrent(t["hash"], delete_files=False)
    if completed:
        try:
            await library.refresh_tv_library()
        except Exception as e:
            print(f"library TV refresh failed after anime auto-delete: {e}")

    return [
        {
            "hash": t["hash"],
            "name": t["name"],
            "progress": round(t["progress"] * 100, 1),
            "state": t["state"],
            "size": t["size"],
            "downloaded": t["downloaded"],
            "speed": t["dlspeed"],
            "eta": t["eta"],
            "seeds": t["num_seeds"],
        }
        for t in torrents
        if t["hash"] not in completed
    ]


@router.delete("/{torrent_hash}")
async def delete_anime_torrent(torrent_hash: str):
    await qbittorrent.delete_torrent(torrent_hash, delete_files=False)
    return {"status": "deleted"}


@router.post("/refresh")
async def library_refresh():
    """Anime goes into the TV library, so use the TV refresh."""
    return await library.refresh_tv_library()
