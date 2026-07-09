"""Safety-gated torrent adding: orchestrates services.safety (pure checks)
around the qBittorrent paused-add flow.

Sequence per add request:
1. Name + size pre-checks (no qBit contact). Block -> refuse outright.
   Warn without force -> refuse with override offer.
2. Add PAUSED with a unique tag; resolve the hash (info_hash from the
   search result, the magnet's btih, or tag lookup).
3. Poll the file list (immediate for .torrent adds; magnets wait on DHT
   metadata) and validate it. Block -> delete torrent + files. Warn
   without force -> delete, offer override. Metadata timeout -> treated
   as a warn ("couldn't inspect"), so magnets degrade to name+size
   checks plus an explicit user override rather than hanging.
4. Cleared -> untag and resume.

Returns {"status": "added"|"warned"|"blocked", "reason": str|None, **extra}.
Blocks are never forceable; force only bypasses warns. Every non-clean
verdict is logged with a [safety] prefix for auditing.
"""

import asyncio
import re
import uuid

from services import qbittorrent, safety

FILE_LIST_TIMEOUT_S = 15
_BTIH_RE = re.compile(r"btih:([0-9a-fA-F]{40})")


def _hash_from_magnet(url: str) -> str | None:
    m = _BTIH_RE.search(url or "")
    return m.group(1).lower() if m else None


async def _wait_for_files(torrent_hash: str) -> list[str] | None:
    """Poll until the file list exists or the timeout passes (None)."""
    for _ in range(FILE_LIST_TIMEOUT_S):
        files = await qbittorrent.get_torrent_files(torrent_hash)
        if files:
            return files
        await asyncio.sleep(1)
    return None


async def guarded_add(*, url: str, save_path: str, category: str,
                      release_title: str | None = None,
                      size: int | None = None,
                      mode: str = "movie",
                      episode_count: int | None = None,
                      info_hash: str | None = None,
                      force: bool = False) -> dict:
    # ── 1. Pre-checks: name + size, before qBit is contacted ──
    pre = safety.check_release(release_title, size, mode=mode,
                               episode_count=episode_count)
    if pre["level"] == "block":
        print(f"[safety] BLOCK (pre-add) {release_title!r}: {pre['reasons']}", flush=True)
        return {"status": "blocked", "reason": "; ".join(pre["reasons"])}
    if pre["level"] == "warn" and not force:
        print(f"[safety] WARN (pre-add) {release_title!r}: {pre['reasons']}", flush=True)
        return {"status": "warned", "reason": "; ".join(pre["reasons"])}

    # ── 2. Paused add + hash resolution ──
    tag = f"safety-{uuid.uuid4().hex[:12]}"
    await qbittorrent.add_torrent_paused(url, save_path, category, tag)

    torrent_hash = (info_hash or "").lower() or _hash_from_magnet(url)
    if not torrent_hash:
        for _ in range(10):
            torrent_hash = await qbittorrent.find_hash_by_tag(tag)
            if torrent_hash:
                break
            await asyncio.sleep(1)
    if not torrent_hash:
        # Can't locate what we just added — refuse to leave an untracked
        # paused torrent behind as "success".
        print(f"[safety] WARN could not resolve hash for {release_title!r} (tag {tag})", flush=True)
        return {"status": "warned",
                "reason": "could not verify the torrent after adding — try again"}

    # ── 3. File-list validation ──
    files = await _wait_for_files(torrent_hash)
    if files is None:
        if not force:
            await qbittorrent.delete_torrent(torrent_hash, delete_files=True)
            print(f"[safety] WARN (no metadata in {FILE_LIST_TIMEOUT_S}s) {release_title!r}", flush=True)
            return {"status": "warned",
                    "reason": "couldn't inspect the file list (magnet metadata "
                              "not available yet) — download anyway?"}
        print(f"[safety] OVERRIDE without file list {release_title!r}", flush=True)
    else:
        verdict = safety.check_files(files)
        if verdict["level"] == "block":
            await qbittorrent.delete_torrent(torrent_hash, delete_files=True)
            print(f"[safety] BLOCK (files) {release_title!r}: {verdict['reasons']} "
                  f"files={files[:5]}", flush=True)
            return {"status": "blocked", "reason": "; ".join(verdict["reasons"])}
        if verdict["level"] == "warn" and not force:
            await qbittorrent.delete_torrent(torrent_hash, delete_files=True)
            print(f"[safety] WARN (files) {release_title!r}: {verdict['reasons']}", flush=True)
            return {"status": "warned", "reason": "; ".join(verdict["reasons"])}
        if verdict["level"] == "warn":
            print(f"[safety] OVERRIDE (files warn) {release_title!r}: {verdict['reasons']}", flush=True)

    # ── 4. Cleared: untag + start ──
    await qbittorrent.remove_tag(torrent_hash, tag)
    await qbittorrent.resume_torrent(torrent_hash)
    return {"status": "added"}
