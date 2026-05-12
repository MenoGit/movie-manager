import asyncio
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services import auto_watchlist, auto_downloader

router = APIRouter(prefix="/watchlist", tags=["watchlist"])


class WatchlistAddRequest(BaseModel):
    id: int
    title: str
    type: str  # "movie" | "tv" | "anime"
    quality_preset: str = "value"
    release_date: Optional[str] = None
    poster_url: Optional[str] = None
    min_seeds: int = 20


class WatchlistPatchRequest(BaseModel):
    quality_preset: Optional[str] = None
    status: Optional[str] = None
    min_seeds: Optional[int] = None


@router.post("/auto/add")
async def add_item(req: WatchlistAddRequest):
    if req.type not in ("movie", "tv", "anime"):
        raise HTTPException(400, "type must be movie, tv, or anime")
    if req.quality_preset not in ("quality", "value", "budget"):
        raise HTTPException(400, "quality_preset must be quality, value, or budget")
    return await auto_watchlist.add(req.dict())


@router.get("/auto")
async def list_items():
    """All auto-watchlist items, newest-added first."""
    items = await auto_watchlist.read_all()
    return list(reversed(items))


@router.delete("/auto/{item_type}/{item_id}")
async def remove_item(item_type: str, item_id: int):
    removed = await auto_watchlist.remove(item_id, item_type)
    if not removed:
        raise HTTPException(404, "item not found")
    return {"status": "removed"}


@router.patch("/auto/{item_type}/{item_id}")
async def patch_item(item_type: str, item_id: int, req: WatchlistPatchRequest):
    patch = {k: v for k, v in req.dict().items() if v is not None}
    if not patch:
        raise HTTPException(400, "no fields to update")
    if "quality_preset" in patch and patch["quality_preset"] not in ("quality", "value", "budget"):
        raise HTTPException(400, "invalid quality_preset")
    if "status" in patch and patch["status"] not in ("waiting", "downloaded", "failed"):
        raise HTTPException(400, "invalid status")
    updated = await auto_watchlist.update(item_id, item_type, patch)
    if updated is None:
        raise HTTPException(404, "item not found")
    return updated


@router.post("/auto/check-now")
async def check_now():
    """Trigger an immediate watchlist sweep — fires off the background check
    and returns immediately so the request doesn't block."""
    # Reset last_checked for waiting items so the scheduler will re-evaluate
    # all of them on this sweep regardless of when they were last checked.
    await auto_watchlist.bulk_update(
        lambda it: it.get("status") == "waiting",
        {"last_checked": None},
    )
    asyncio.create_task(auto_downloader.check_watchlist())
    return {"status": "check started"}
