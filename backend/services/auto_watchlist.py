"""JSON-file storage for the auto-download watchlist. Each entry tracks a
movie/show the user wants auto-downloaded when a good rip drops."""

import asyncio
import json
import os
from datetime import datetime, timezone

WATCHLIST_PATH = os.environ.get("WATCHLIST_PATH", "/app/watchlist_auto.json")
_lock = asyncio.Lock()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _read_sync() -> list:
    if not os.path.exists(WATCHLIST_PATH):
        return []
    try:
        with open(WATCHLIST_PATH) as f:
            data = json.load(f)
            return data if isinstance(data, list) else []
    except (json.JSONDecodeError, OSError):
        return []


def _write_sync(items: list):
    tmp = WATCHLIST_PATH + ".tmp"
    with open(tmp, "w") as f:
        json.dump(items, f, indent=2)
    os.replace(tmp, WATCHLIST_PATH)


def _key(it: dict) -> tuple:
    return (it.get("id"), it.get("type"))


async def read_all() -> list:
    async with _lock:
        return _read_sync()


async def add(entry: dict) -> dict:
    async with _lock:
        items = _read_sync()
        if any(_key(it) == _key(entry) for it in items):
            return {"already_added": True, **entry}
        entry = {
            "added_date": now_iso(),
            "status": "waiting",
            "last_checked": None,
            "min_seeds": 20,
            "quality_preset": "value",
            **entry,
        }
        items.append(entry)
        _write_sync(items)
        return entry


async def remove(item_id, item_type) -> bool:
    async with _lock:
        items = _read_sync()
        new_items = [it for it in items if not (it.get("id") == item_id and it.get("type") == item_type)]
        if len(new_items) == len(items):
            return False
        _write_sync(new_items)
        return True


async def update(item_id, item_type, patch: dict) -> dict | None:
    async with _lock:
        items = _read_sync()
        updated = None
        for it in items:
            if it.get("id") == item_id and it.get("type") == item_type:
                it.update(patch)
                updated = it
                break
        if updated is not None:
            _write_sync(items)
        return updated


async def bulk_update(predicate, patch: dict):
    """Update every item matching `predicate(item) -> bool` with `patch`.
    Used by the downloader for batch status updates."""
    async with _lock:
        items = _read_sync()
        changed = False
        for it in items:
            if predicate(it):
                it.update(patch)
                changed = True
        if changed:
            _write_sync(items)
