from fastapi import APIRouter, Response
from pydantic import BaseModel
import os

from services import prowlarr, qbittorrent, library, history, storage, safe_download
from config import settings

router = APIRouter(prefix="/downloads", tags=["downloads"])

class AddTorrentRequest(BaseModel):
    magnet: str
    movie_title: str
    # Optional safety-validation context (all back-compatible):
    release_title: str | None = None   # raw release name for parsing
    size: int | None = None            # bytes, from the search result
    info_hash: str | None = None
    force: bool = False                # bypass WARN-level findings only

@router.get("/search")
async def search_torrents(q: str, year: int | None = None):
    """Search Prowlarr for movie torrents. Optional `year` prioritises
    titles containing that year (release year) in the result list."""
    return await prowlarr.search_torrents(q, year=year)

@router.post("/add")
async def add_torrent(req: AddTorrentRequest):
    """Safety-validated add: name/size pre-checks, then a paused add whose
    file list is inspected before the download is allowed to start."""
    safe_title = "".join(c for c in req.movie_title if c.isalnum() or c in " ._-").strip()
    save_path = os.path.join(settings.movies_path, safe_title)
    result = await safe_download.guarded_add(
        url=req.magnet, save_path=save_path, category="movies",
        release_title=req.release_title, size=req.size, mode="movie",
        info_hash=req.info_hash, force=req.force,
    )
    if result["status"] == "added":
        result.update(save_path=save_path, title=safe_title)
    return result

@router.get("/queue")
async def get_queue():
    """Get current download queue from qBit. Auto-deletes completed torrents
    (keeping files on disk) and triggers a library refresh when any complete."""
    torrents = await qbittorrent.get_torrents()
    completed_items = [
        t for t in torrents
        if t.get("state") == "uploading" or t.get("progress", 0) >= 1.0
    ]
    completed = {t["hash"] for t in completed_items}
    for t in completed_items:
        await history.append({
            "type": "movie",
            "name": t.get("name"),
            "hash": t.get("hash"),
            "size": t.get("size"),
        })
        await qbittorrent.delete_torrent(t["hash"], delete_files=False)
    if completed:
        try:
            await library.refresh_library()
        except Exception as e:
            print(f"library refresh failed after auto-delete: {e}")

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

@router.post("/refresh")
async def library_refresh():
    """Trigger a scan on the active library provider."""
    return await library.refresh_library()

@router.get("/disk-usage")
async def disk_usage():
    """Detailed disk usage for the media drive: total/free/used plus
    Movies and TV-Shows folder breakdowns."""
    return await storage.get_disk_usage()


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

@router.get("/recently-added")
async def recently_added():
    return await library.get_recently_added()


@router.get("/poster/{item_id}")
async def poster(item_id: str, w: int = 400):
    """Proxy a poster image from the active library provider so the browser
    never needs direct media-server access (or its credentials)."""
    content, content_type = await library.get_poster_image(item_id, max_width=w)
    return Response(content=content, media_type=content_type,
                    headers={"Cache-Control": "public, max-age=3600"})


@router.get("/history")
async def get_history():
    """Return completed downloads (both movies and TV), newest first."""
    return await history.read_all()


@router.delete("/history")
async def clear_history():
    await history.clear()
    return {"status": "cleared"}
