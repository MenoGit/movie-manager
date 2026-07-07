"""OMDb ratings client + the popcorn calibration curve.

Feeds the 🍅/🍿 badges in the detail modals: the Rotten Tomatoes critic
percentage comes straight from OMDb's Ratings array; the audience
("popcorn") percentage is a calibrated blend of the IMDb rating (also from
OMDb) and TMDb's vote_average.

Only detail views call this (never grid cards) and results are cached for
24h per imdb_id — OMDb's free tier is 1000 requests/day. Failures cache an
empty result so a flaky OMDb neither hammers the quota nor slows the modal.
An empty OMDB_API_KEY disables the feature entirely."""

import math
import time
import httpx
from config import settings

BASE = "http://www.omdbapi.com/"
_CACHE: dict[str, dict] = {}  # {imdb_id: {"data": {...}, "ts": float}}
_TTL = 86400  # 24 hours

_EMPTY = {"critic_pct": None, "imdb_rating": None}


def enabled() -> bool:
    return bool(settings.omdb_api_key)


def popcorn_pct(avg10: float | None) -> int | None:
    """Map a blended 0-10 rating average to an RT-style audience percentage.

    RT's popcorn score is the share of users rating >= 3.5/5 — a tail area
    above a threshold, not a mean — so the mapping is a logistic curve (the
    CDF of a ~1.5-point rating spread), fit to the observed IMDb<->RT
    relationship: 4.0 -> 38%, 6.0 -> 70%, 7.5 -> 87%, 8.5 -> 93%. Monotonic,
    never reaches 100."""
    if avg10 is None:
        return None
    return round(100 / (1 + math.exp(-(avg10 - 4.71) / 1.5)))


def blend(imdb_rating: float | None, tmdb_vote: float | None) -> float | None:
    """Mean of the two 0-10 scores; either alone if the other is missing.
    Zero is treated as missing — TMDb reports 0.0 for unrated titles."""
    vals = [v for v in (imdb_rating, tmdb_vote) if v]
    if not vals:
        return None
    return sum(vals) / len(vals)


def _parse_rt(ratings: list) -> int | None:
    """Rotten Tomatoes percentage out of OMDb's Ratings array ("84%" -> 84).
    The entry is frequently absent (small/old/foreign films) -> None."""
    for entry in ratings:
        if entry.get("Source") == "Rotten Tomatoes":
            try:
                return int((entry.get("Value") or "").strip().rstrip("%"))
            except ValueError:
                return None
    return None


def _parse_imdb(value) -> float | None:
    """imdbRating field ("8.3" or "N/A") -> float in (0, 10] or None."""
    try:
        rating = float(value)
    except (TypeError, ValueError):
        return None
    return rating if 0 < rating <= 10 else None


async def get_ratings(imdb_id: str | None) -> dict:
    """{'critic_pct': int|None, 'imdb_rating': float|None} for an IMDb id.
    Cached 24h. OMDb reports errors as HTTP 200 with Response: "False"."""
    if not imdb_id or not enabled():
        return dict(_EMPTY)
    now = time.time()
    cached = _CACHE.get(imdb_id)
    if cached and now - cached["ts"] < _TTL:
        return cached["data"]

    result = dict(_EMPTY)
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(
                BASE,
                params={"i": imdb_id, "apikey": settings.omdb_api_key},
                timeout=6,
            )
            r.raise_for_status()
            data = r.json()
        if data.get("Response") == "True":
            result["critic_pct"] = _parse_rt(data.get("Ratings") or [])
            result["imdb_rating"] = _parse_imdb(data.get("imdbRating"))
    except (httpx.RequestError, httpx.HTTPStatusError, ValueError):
        pass  # cache the empty result — don't retry-hammer a flaky OMDb
    _CACHE[imdb_id] = {"data": result, "ts": now}
    return result


async def attach_scores(detail: dict, imdb_id: str | None):
    """Stamp critic_score / audience_score onto a TMDb detail dict.
    Missing data -> None -> the frontend hides that badge."""
    ratings = await get_ratings(imdb_id)
    detail["critic_score"] = ratings["critic_pct"]
    detail["audience_score"] = popcorn_pct(
        blend(ratings["imdb_rating"], detail.get("vote_average"))
    )
