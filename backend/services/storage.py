"""Disk-usage reporting. statvfs() is real-time (cheap). du -sb on the
Plex media folders is expensive on multi-TB drives, so per-folder breakdowns
are cached for 5 minutes."""

import asyncio
import os
import time
from config import settings

_DU_CACHE = {"data": None, "ts": 0}
_DU_TTL = 300  # 5 minutes


async def _du_bytes(path: str) -> int:
    """Return recursive byte size of `path` using `du -sb`. Returns 0 on
    missing path or any failure — disk-usage reporting shouldn't crash if
    one of the folders is gone."""
    if not path or not os.path.exists(path):
        return 0
    try:
        proc = await asyncio.create_subprocess_exec(
            "du", "-sb", path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        stdout, _ = await proc.communicate()
        return int(stdout.decode().split()[0])
    except (FileNotFoundError, ValueError, IndexError, PermissionError):
        return 0


async def get_folder_sizes() -> dict:
    """Cached per-folder usage. Refreshes once every 5 minutes."""
    now = time.time()
    if _DU_CACHE["data"] is not None and now - _DU_CACHE["ts"] < _DU_TTL:
        return _DU_CACHE["data"]

    movies_bytes, tv_bytes = await asyncio.gather(
        _du_bytes(settings.movies_path),
        _du_bytes(settings.tv_shows_path),
    )
    data = {"movies_bytes": movies_bytes, "tv_bytes": tv_bytes}
    _DU_CACHE.update(data=data, ts=now)
    return data


async def get_disk_usage() -> dict:
    """Full report: live total/free/used from statvfs, cached movies/tv
    folder sizes, computed 'other' (everything else on the drive)."""
    path = settings.movies_path
    if not os.path.exists(path):
        return {
            "error": f"path not accessible: {path} (check that /mnt/6TB is bind-mounted into the backend container)",
            "total": 0, "free": 0, "used": 0, "usage_percent": 0,
            "movies_bytes": 0, "tv_bytes": 0, "other_bytes": 0,
        }
    try:
        s = os.statvfs(path)
    except OSError as e:
        return {"error": f"statvfs failed: {e}", "total": 0, "free": 0, "used": 0,
                "usage_percent": 0, "movies_bytes": 0, "tv_bytes": 0, "other_bytes": 0}

    total = s.f_blocks * s.f_frsize
    free = s.f_bavail * s.f_frsize
    used = total - free

    folders = await get_folder_sizes()
    movies = folders["movies_bytes"]
    tv = folders["tv_bytes"]
    other = max(0, used - movies - tv)

    return {
        "total": total,
        "free": free,
        "used": used,
        "usage_percent": round(100 * used / total, 1) if total > 0 else 0,
        "movies_bytes": movies,
        "tv_bytes": tv,
        "other_bytes": other,
    }
