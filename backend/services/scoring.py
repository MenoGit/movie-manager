"""Python port of frontend/src/torrentScoring.js — used by the auto-downloader
service to evaluate torrent quality without involving the frontend.

Keep parsing rules + tier brackets in sync with the JS module.
"""

import math
import re

GB = 1024 ** 3


def parse_release(title: str) -> dict:
    s = (title or "").upper()

    if re.search(r"2160P|\b4K\b|\bUHD\b", s):
        resolution = "4K"
    elif re.search(r"1080P", s):
        resolution = "1080p"
    elif re.search(r"720P", s):
        resolution = "720p"
    elif re.search(r"480P", s):
        resolution = "480p"
    else:
        resolution = "other"

    is_remux = bool(re.search(r"\bREMUX\b", s))
    if re.search(r"\bHDCAM\b|\bCAM(?:RIP)?\b", s):
        source = "CAM"
    elif re.search(r"\b(?:TELESYNC|HDTS)\b|\bTS\b", s):
        source = "TS"
    elif re.search(r"BLU.?RAY|\bBDRIP\b|\bBRRIP\b|\bBDR\b|\bREMUX\b", s):
        source = "BluRay"
    elif re.search(r"\bWEB[-.]?DL\b|\bWEBDL\b", s):
        source = "WEB-DL"
    elif re.search(r"\bWEB.?RIP\b", s):
        source = "WEBRip"
    elif re.search(r"\bHDTV\b|\bPDTV\b|\bDVB\b", s):
        source = "HDTV"
    else:
        source = "Unknown"

    if re.search(r"\bATMOS\b", s):
        audio = "Atmos"
    elif re.search(r"DTS[-.]?HD|DTS[-.]?MA|TRUEHD", s):
        audio = "DTS-HD/TrueHD"
    elif re.search(r"DDP5\.?1|DD\+|EAC3", s):
        audio = "DDP5.1"
    elif re.search(r"\bDTS\b", s):
        audio = "DTS"
    elif re.search(r"AAC5\.?1|AAC\.?5\.?1", s):
        audio = "AAC5.1"
    elif re.search(r"\bAAC\b", s):
        audio = "AAC"
    else:
        audio = "Stereo"

    if re.search(r"DOLBY[\s.-]?VISION|\bDV\b|\bDOVI\b", s):
        hdr = "DV"
    elif re.search(r"HDR10\+|HDR10PLUS", s):
        hdr = "HDR10+"
    elif re.search(r"\bHDR\b|HDR10", s):
        hdr = "HDR10"
    else:
        hdr = "SDR"

    if re.search(r"\bAV1\b", s):
        codec = "AV1"
    elif re.search(r"X265|HEVC|H[\s.]?265", s):
        codec = "x265"
    elif re.search(r"X264|H[\s.]?264", s):
        codec = "x264"
    elif re.search(r"MPEG[-.]?[24]|\bXVID\b|\bDIVX\b", s):
        codec = "MPEG"
    else:
        codec = "unknown"

    is_yts = bool(re.search(r"\bYTS(\.MX|\.AG)?\b", s))

    return {
        "resolution": resolution, "source": source, "audio": audio,
        "hdr": hdr, "codec": codec, "is_remux": is_remux, "is_yts": is_yts,
    }


def is_season_pack(title: str) -> bool:
    if not title:
        return False
    t = title.upper()
    if re.search(r"S\d{1,2}E\d{1,3}", t):
        return False
    if re.search(r"\d{1,2}X\d{1,3}", t):
        return False
    if re.search(r"COMPLETE|SEASON.?PACK|FULL[\s.]+SEASON|\bBATCH\b|COLLECTION", t):
        return True
    if re.search(r"\bS\d{1,2}\b", t):
        return True
    return False


SCORE_WEIGHTS = {
    "resolution": {"4K": 10, "1080p": 8, "720p": 5, "480p": 2, "other": 2},
    "source":     {"BluRay": 10, "WEB-DL": 9, "WEBRip": 7, "HDTV": 5, "TS": 1, "CAM": 0, "Unknown": 4},
    "audio":      {"Atmos": 10, "DTS-HD/TrueHD": 9, "DDP5.1": 8, "DTS": 7, "AAC5.1": 6, "AAC": 4, "Stereo": 3},
    "hdr":        {"DV": 10, "HDR10+": 9, "HDR10": 8, "SDR": 3},
    "codec":      {"AV1": 10, "x265": 8, "x264": 5, "MPEG": 2, "unknown": 3},
}

# Movie tiers: hard cap at 25 GB on quality so 40-60 GB remuxes are excluded
MOVIE_TIERS = {
    "quality": {"min": 12, "max": 25},
    "value":   {"min": 4,  "max": 12},
    "budget":  {"min": 0.7, "max": 4},
}

# Per-episode brackets keyed by runtime bucket
EP_BRACKETS = {
    "short":     {"quality": {"min": 1.5, "maxIdeal": 5},  "value": {"min": 0.5, "max": 1.5}, "budget": {"min": 0.08, "max": 0.5}},
    "standard":  {"quality": {"min": 2.5, "maxIdeal": 8},  "value": {"min": 0.8, "max": 2.5}, "budget": {"min": 0.12, "max": 0.8}},
    "long":      {"quality": {"min": 4,   "maxIdeal": 12}, "value": {"min": 1.5, "max": 4},   "budget": {"min": 0.2,  "max": 1.5}},
    "extraLong": {"quality": {"min": 6,   "maxIdeal": 18}, "value": {"min": 2,   "max": 6},   "budget": {"min": 0.3,  "max": 2}},
}


def runtime_bucket(runtime_min: int) -> str:
    if runtime_min < 30: return "short"
    if runtime_min <= 45: return "standard"
    if runtime_min <= 75: return "long"
    return "extraLong"


def _multiply(tiers: dict, factor: int) -> dict:
    out = {}
    for k, b in tiers.items():
        out[k] = {kk: v * factor for kk, v in b.items()}
    return out


def _tiers_for_torrent(t: dict, ctx: dict) -> dict:
    if ctx.get("mode") == "movie":
        return MOVIE_TIERS
    base = EP_BRACKETS[runtime_bucket(ctx.get("runtime_min", 45))]
    treat_pack = ctx.get("is_season_search") or is_season_pack(t.get("title", ""))
    if treat_pack:
        return _multiply(base, max(1, ctx.get("episode_count", 1)))
    return base


def _tier_for(size_gb: float, tiers: dict):
    q = tiers["quality"]
    if size_gb >= q["min"] and (q.get("max") is None or size_gb <= q["max"]):
        return "quality"
    v = tiers["value"]
    if size_gb >= v["min"] and size_gb <= v["max"]:
        return "value"
    b = tiers["budget"]
    if size_gb >= b["min"] and size_gb <= b["max"]:
        return "budget"
    return None


def _size_fit_bonus(size_gb: float, tiers: dict, tier: str) -> float:
    bracket = tiers.get(tier)
    if not bracket:
        return 0
    lo = bracket["min"]
    hi = bracket.get("max") or bracket.get("maxIdeal")
    if hi is None:
        return 0
    if size_gb > hi or size_gb < lo:
        return -4
    mid = (lo + hi) / 2
    half = (hi - lo) / 2 or 1
    dist = abs(size_gb - mid) / half
    return 2 * (1 - dist)


def score_torrent(t: dict, ctx: dict) -> dict:
    """Returns {score, parsed, size_gb, tier, eligible, seeds}."""
    parsed = parse_release(t.get("title") or "")
    tiers = _tiers_for_torrent(t, ctx)
    size_gb = (t.get("size") or 0) / GB

    seeds = t.get("seeders") or 0
    peers = t.get("leechers") or 0
    ratio = float("inf") if peers == 0 and seeds > 0 else (seeds / peers if peers > 0 else 0)
    is_bad_source = parsed["source"] in ("CAM", "TS")
    eligible = seeds >= 3 and not is_bad_source

    score = (
        SCORE_WEIGHTS["resolution"].get(parsed["resolution"], 0)
        + SCORE_WEIGHTS["source"].get(parsed["source"], 0)
        + SCORE_WEIGHTS["audio"].get(parsed["audio"], 0)
        + SCORE_WEIGHTS["hdr"].get(parsed["hdr"], 0)
        + SCORE_WEIGHTS["codec"].get(parsed["codec"], 0)
    )
    if seeds > 0:
        score += min(math.log2(seeds + 1), 5)
    if ratio > 2:
        score += 2
    if parsed["is_yts"]:
        score += 1
    tier = _tier_for(size_gb, tiers)
    if tier:
        score += _size_fit_bonus(size_gb, tiers, tier)

    return {
        "score": round(score * 10) / 10,
        "parsed": parsed,
        "size_gb": size_gb,
        "tier": tier,
        "eligible": eligible,
        "seeds": seeds,
    }


def pick_best_three(scored: list, ctx: dict) -> dict:
    """Returns {"quality", "value", "budget"} — best eligible torrent in
    each tier (or None). For season searches, only season packs are
    eligible for badges; mirrors the JS frontend logic."""
    restrict_to_packs = ctx.get("is_season_search") is True

    def pick_in(tier: str):
        candidates = [t for t in scored if t["_score"]["eligible"] and t["_score"]["tier"] == tier]
        if restrict_to_packs:
            candidates = [t for t in candidates if is_season_pack(t.get("title", ""))]
        if not candidates:
            return None
        candidates.sort(key=lambda t: t["_score"]["score"], reverse=True)
        return candidates[0]

    return {"quality": pick_in("quality"), "value": pick_in("value"), "budget": pick_in("budget")}
