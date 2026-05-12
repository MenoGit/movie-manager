from typing import Optional
from fastapi import APIRouter
from pydantic import BaseModel
from services import prowlarr, qbittorrent, plex, history

router = APIRouter(prefix="/tv-downloads", tags=["tv-downloads"])


class AddTVTorrentRequest(BaseModel):
    magnet: str
    show_title: str
    season_number: int


@router.get("/search")
async def search_tv_torrents(q: str, season: Optional[int] = None, episode: Optional[int] = None):
    """Search Prowlarr for TV torrents. Optionally narrow to season/episode."""
    return await prowlarr.search_tv_torrents(q, season=season, episode=episode)


@router.post("/add")
async def add_tv_torrent(req: AddTVTorrentRequest):
    """Add a TV torrent to qBit. Save path follows Plex's TV layout:
    <TV_SHOWS_PATH>/<Show Name>/Season XX/"""
    return await qbittorrent.add_tv_torrent(req.magnet, req.show_title, req.season_number)


@router.get("/queue")
async def get_queue():
    """Active TV downloads. Auto-deletes completed torrents (keeping files
    on disk) and triggers a Plex TV-library refresh when any complete."""
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
            await plex.refresh_tv_library()
        except Exception as e:
            print(f"plex TV refresh failed after auto-delete: {e}")

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


@router.post("/plex-refresh")
async def plex_refresh():
    """Trigger a Plex TV library scan."""
    return await plex.refresh_tv_library()
