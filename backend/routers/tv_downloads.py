from typing import Optional
from fastapi import APIRouter
from pydantic import BaseModel
import os

from services import prowlarr, qbittorrent, library, history, safe_download
from config import settings

router = APIRouter(prefix="/tv-downloads", tags=["tv-downloads"])


class AddTVTorrentRequest(BaseModel):
    magnet: str
    show_title: str
    season_number: int
    # Optional safety-validation context (all back-compatible):
    release_title: str | None = None
    size: int | None = None
    episode_count: int | None = None   # for season-pack size gates
    info_hash: str | None = None
    force: bool = False


@router.get("/search")
async def search_tv_torrents(q: str, season: Optional[int] = None,
                              episode: Optional[int] = None, year: Optional[int] = None):
    """Search Prowlarr for TV torrents. Optionally narrow to season/episode.
    `year` (the show's first-air year) prioritises matching titles."""
    return await prowlarr.search_tv_torrents(q, season=season, episode=episode, year=year)


@router.post("/add")
async def add_tv_torrent(req: AddTVTorrentRequest):
    """Safety-validated TV add. Save path follows the standard TV layout:
    <TV_SHOWS_PATH>/<Show Name>/Season XX/"""
    safe_show = "".join(c for c in req.show_title if c.isalnum() or c in " ._-").strip()
    save_path = os.path.join(settings.tv_shows_path, safe_show,
                             f"Season {int(req.season_number):02d}")
    result = await safe_download.guarded_add(
        url=req.magnet, save_path=save_path, category="tv",
        release_title=req.release_title, size=req.size, mode="tv",
        episode_count=req.episode_count, info_hash=req.info_hash, force=req.force,
    )
    if result["status"] == "added":
        result.update(save_path=save_path, show=safe_show, season=int(req.season_number))
    return result


@router.get("/queue")
async def get_queue():
    """Active TV downloads. Auto-deletes completed torrents (keeping files
    on disk) and triggers a TV-library refresh when any complete."""
    torrents = await qbittorrent.get_torrents(category="tv")
    completed_items = [
        t for t in torrents
        if t.get("state") == "uploading" or t.get("progress", 0) >= 1.0
    ]
    completed = {t["hash"] for t in completed_items}
    for t in completed_items:
        await history.append({
            "type": "tv",
            "name": t.get("name"),
            "hash": t.get("hash"),
            "size": t.get("size"),
        })
        await qbittorrent.delete_torrent(t["hash"], delete_files=False)
    if completed:
        try:
            await library.refresh_tv_library()
        except Exception as e:
            print(f"library TV refresh failed after auto-delete: {e}")

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
async def delete_tv_torrent(torrent_hash: str):
    """Delete a TV torrent (keep downloaded files)."""
    await qbittorrent.delete_torrent(torrent_hash, delete_files=False)
    return {"status": "deleted"}


@router.post("/refresh")
async def library_refresh():
    """Trigger a TV scan on the active library provider."""
    return await library.refresh_tv_library()
