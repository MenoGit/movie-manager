"""Simple JSON-file download history. Stored at /app/download_history.json
inside the container, which persists on the host via the backend volume mount.
Capped at 500 most recent entries so the file stays small."""

import asyncio
import json
import os
from datetime import datetime, timezone
from typing import Any

HISTORY_PATH = os.environ.get("HISTORY_PATH", "/app/download_history.json")
MAX_ENTRIES = 500

_lock = asyncio.Lock()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _read_sync() -> list[dict]:
    if not os.path.exists(HISTORY_PATH):
        return []
    try:
        with open(HISTORY_PATH) as f:
            data = json.load(f)
            return data if isinstance(data, list) else []
    except (json.JSONDecodeError, OSError):
        return []


def _write_sync(entries: list[dict]):
    tmp = HISTORY_PATH + ".tmp"
    with open(tmp, "w") as f:
        json.dump(entries, f, indent=2)
    os.replace(tmp, HISTORY_PATH)


async def append(entry: dict[str, Any]):
    """Append a completion entry. Always stamps timestamp if absent."""
    entry = {"timestamp": _now_iso(), **entry}
    async with _lock:
        entries = _read_sync()
        entries.append(entry)
        if len(entries) > MAX_ENTRIES:
            entries = entries[-MAX_ENTRIES:]
        _write_sync(entries)


async def read_all() -> list[dict]:
    """Return all entries, newest first."""
    async with _lock:
        return list(reversed(_read_sync()))


async def clear():
    async with _lock:
        _write_sync([])
