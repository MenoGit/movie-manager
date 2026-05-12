from typing import Optional
from fastapi import APIRouter
from pydantic import BaseModel
from services import prowlarr, qbittorrent, plex, history

router = APIRouter(prefix="/anime-downloads", tags=["anime-downloads"])


class AddAnimeTorrentRequest(BaseModel):
    magnet: str
    show_title: str
    season_number: int


@router.get("/search")
async def search_anime_torrents(q: str, season: Optional[int] = None, episode: Optional[int] = None):
    """Anime search uses plain text Prowlarr queries — Nyaa-style release
    naming rarely follows S##E## patterns, so structured tvsearch isn't a
    good fit."""
    return await prowlarr.search_anime_torrents(q, season=season, episode=episode)


@router.post("/add")
async def add_anime_torrent(req: AddAnimeTorrentRequest):
    """Save under the TV-Shows path so Plex's TV agent picks it up; qBit
    category is 'anime' so it queues separately from regular TV downloads."""
    return await qbittorrent.add_anime_torrent(req.magnet, req.show_title, req.season_number)


@router.get("/queue")
async def get_queue():
    """Active anime downloads (qBit category 'anime'). Auto-deletes finished
    items, logs to history, and triggers a Plex TV-library refresh."""
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
            await plex.refresh_tv_library()
        except Exception as e:
            print(f"plex TV refresh failed after anime auto-delete: {e}")

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


@router.post("/plex-refresh")
async def plex_refresh():
    """Anime goes into the TV library, so use the TV refresh."""
    return await plex.refresh_tv_library()
