from fastapi import APIRouter
from pydantic import BaseModel
from services import prowlarr, qbittorrent, plex

router = APIRouter(prefix="/downloads", tags=["downloads"])

class AddTorrentRequest(BaseModel):
    magnet: str
    movie_title: str

@router.get("/search")
async def search_torrents(q: str):
    """Search Prowlarr for torrents matching query."""
    return await prowlarr.search_torrents(q)

@router.post("/add")
async def add_torrent(req: AddTorrentRequest):
    """Add torrent to qBit, returns save path."""
    result = await qbittorrent.add_torrent(req.magnet, req.movie_title)
    return result

@router.get("/queue")
async def get_queue():
    """Get current download queue from qBit. Auto-deletes completed torrents
    (keeping files on disk) and triggers a Plex refresh when any complete."""
    torrents = await qbittorrent.get_torrents()
    completed = {
        t["hash"] for t in torrents
        if t.get("state") == "uploading" or t.get("progress", 0) >= 1.0
    }
    for h in completed:
        await qbittorrent.delete_torrent(h, delete_files=False)
    if completed:
        try:
            await plex.refresh_library()
        except Exception as e:
            print(f"plex refresh failed after auto-delete: {e}")

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
async def delete_torrent(torrent_hash: str):
    """Delete torrent but keep the downloaded files."""
    await qbittorrent.delete_torrent(torrent_hash, delete_files=False)
    return {"status": "deleted"}

@router.post("/plex-refresh")
async def plex_refresh():
    """Trigger Plex library scan."""
    return await plex.refresh_library()

@router.get("/storage")
async def storage_info():
    """Get disk usage info from qBit."""
    data = await qbittorrent.get_main_data()
    server = data.get("server_state", {})
    return {
        "free_space": server.get("free_space_on_disk"),
        "dl_speed": server.get("dl_info_speed"),
        "up_speed": server.get("up_info_speed"),
    }

@router.get("/plex/recently-added")
async def recently_added():
    return await plex.get_recently_added()
