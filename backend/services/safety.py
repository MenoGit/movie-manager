"""Pre-download safety validation: pure functions only (the orchestration
that talks to qBittorrent lives in services/safe_download.py).

Two protections:
- File-type validation: block executable/script payloads disguised as
  movies, warn on archives (legit releases rarely ship archived).
- Size sanity: block sizes impossible for the release's claimed quality
  (fake/decoy releases). Bounds are deliberately WIDER than the scoring
  tiers in services/scoring.py — those rank quality (advisory), these
  gate downloads (hard). Name parsing is reused from scoring.parse_release
  / is_season_pack so there is exactly one parser.

Verdicts: {"level": "ok"|"warn"|"block", "reasons": [str, ...]}
"""

import os
import re

from services.scoring import parse_release, is_season_pack

GB = 1024 ** 3
MB = 1024 ** 2

# Executable / script / installer payloads — never legitimate in a release.
BLOCK_EXTENSIONS = {
    ".exe", ".scr", ".bat", ".cmd", ".com", ".msi", ".lnk", ".vbs",
    ".js", ".jar", ".pif", ".hta", ".reg", ".iso",
}

ARCHIVE_EXTENSIONS = {".rar", ".zip", ".7z", ".r00", ".r01", ".tar", ".gz"}

# Explicitly fine: video, subtitles, metadata, cover art.
ALLOW_EXTENSIONS = {
    ".mkv", ".mp4", ".avi", ".m4v", ".mov", ".webm", ".ts",
    ".srt", ".sub", ".ass", ".idx", ".sup", ".nfo", ".jpg", ".png",
}

_PASSWORD_RE = re.compile(r"pass\s?word|passworded|contrase", re.IGNORECASE)

# Hard size gates (block outside these), keyed by parsed resolution.
# (min_bytes, max_bytes)
MOVIE_SIZE_GATES = {
    "4K": (5 * GB, 100 * GB),
    "1080p": (500 * MB, 25 * GB),
    "720p": (300 * MB, 8 * GB),
}
TV_EPISODE_GATE = (50 * MB, 12 * GB)


def _ok():
    return {"level": "ok", "reasons": []}


def combine(*verdicts) -> dict:
    """Merge verdicts; block outranks warn outranks ok. Reasons accumulate."""
    level = "ok"
    reasons = []
    for v in verdicts:
        reasons.extend(v["reasons"])
        if v["level"] == "block":
            level = "block"
        elif v["level"] == "warn" and level != "block":
            level = "warn"
    return {"level": level, "reasons": reasons}


def check_files(file_names: list[str]) -> dict:
    """Validate a torrent's file list. Block-listed extensions block;
    any archive warns; everything else (video, subs, unknown-but-harmless
    like .txt) passes."""
    blocked = []
    archives = []
    for name in file_names or []:
        ext = os.path.splitext(name)[1].lower()
        if ext in BLOCK_EXTENSIONS:
            blocked.append(name)
        elif ext in ARCHIVE_EXTENSIONS:
            archives.append(name)

    verdicts = [_ok()]
    if blocked:
        verdicts.append({
            "level": "block",
            "reasons": [f"contains executable/blocked file: {os.path.basename(n)}"
                        for n in blocked[:3]],
        })
    if archives:
        verdicts.append({
            "level": "warn",
            "reasons": [f"contains archive ({os.path.basename(archives[0])}) — "
                        "legit releases rarely ship archived"],
        })
    return combine(*verdicts)


def check_release(title: str | None, size_bytes: int | None,
                  mode: str = "movie", episode_count: int | None = None) -> dict:
    """Name + size sanity for a release BEFORE anything touches qBittorrent.

    - Password-protected archive markers in the name -> block.
    - Size gates per parsed resolution; unknown resolution -> size check
      skipped (never block on missing information, except passwords).
    - mode "tv": single-episode gate, multiplied by episode_count for
      season packs (pack with unknown count -> skipped)."""
    verdicts = [_ok()]
    title = title or ""

    if title and _PASSWORD_RE.search(title):
        verdicts.append({
            "level": "block",
            "reasons": ["release name indicates a password-protected archive"],
        })

    if size_bytes:
        gate = None
        label = ""
        if mode == "movie":
            resolution = parse_release(title)["resolution"] if title else "other"
            gate = MOVIE_SIZE_GATES.get(resolution)
            label = f"{resolution} movie"
        elif mode == "tv" and title:
            if is_season_pack(title):
                if episode_count and episode_count > 0:
                    lo, hi = TV_EPISODE_GATE
                    gate = (lo * episode_count, hi * episode_count)
                    label = f"season pack ({episode_count} eps)"
            else:
                gate = TV_EPISODE_GATE
                label = "TV episode"

        if gate:
            lo, hi = gate
            if size_bytes < lo:
                verdicts.append({
                    "level": "block",
                    "reasons": [f"size {_fmt(size_bytes)} is implausibly small "
                                f"for a {label} (min {_fmt(lo)})"],
                })
            elif size_bytes > hi:
                verdicts.append({
                    "level": "block",
                    "reasons": [f"size {_fmt(size_bytes)} is implausibly large "
                                f"for a {label} (max {_fmt(hi)})"],
                })

    return combine(*verdicts)


def _fmt(n: int) -> str:
    if n >= GB:
        return f"{n / GB:.1f} GB"
    return f"{n / MB:.0f} MB"
