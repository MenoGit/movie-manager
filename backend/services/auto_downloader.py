"""Background auto-downloader. Polls the auto-watchlist, evaluates new
torrents using the shared scoring engine, and adds eligible ones to qBit
automatically.

Smart scheduling per item:
- Movies < 30 days old: probably still theatrical, check ~once every 12h
- Movies 30-90 days old: sweet spot for new rips, check every cycle (6h)
- Movies > 90 days old: niche or low-popularity, check once a day
- TV: airing (any recent air_date) every cycle; completed once a day
"""

import asyncio
from datetime import datetime, timezone, timedelta

from services import (
    prowlarr, qbittorrent, scoring,
    auto_watchlist, history, plex,
    tmdb_tv,
)

# Globals (set by main.py via lifespan)
_TASK = None


def _parse_iso(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _should_check(item: dict) -> bool:
    """Decide whether enough time has passed to re-check this item."""
    last = _parse_iso(item.get("last_checked"))
    now = _now()
    if last is None:
        return True  # never checked

    elapsed = now - last
    rd = _parse_iso(item.get("release_date") + "T00:00:00Z" if item.get("release_date") and "T" not in item.get("release_date") else item.get("release_date"))
    if rd is None and item.get("release_date"):
        # release_date is a date-only string; convert to datetime at noon UTC
        try:
            rd_only = datetime.strptime(item["release_date"][:10], "%Y-%m-%d")
            rd = rd_only.replace(tzinfo=timezone.utc)
        except ValueError:
            rd = None

    if rd:
        days_since_release = (now - rd).days
        if days_since_release < 30:
            return elapsed > timedelta(hours=12)   # theatrical window
        if 30 <= days_since_release <= 90:
            return elapsed > timedelta(hours=6)    # sweet spot
        return elapsed > timedelta(hours=24)       # niche/old
    return elapsed > timedelta(hours=6)  # no release date info, use default cycle


# ─── Per-type check logic ────────────────────────────────────────────────

async def _check_movie(item: dict) -> dict | None:
    """Search Prowlarr for the movie, return best torrent in preferred tier
    that satisfies min_seeds AND isn't CAM/TS, or None if nothing eligible."""
    title = item.get("title", "")
    year = None
    if item.get("release_date"):
        try:
            year = int(item["release_date"][:4])
        except (ValueError, TypeError):
            pass
    results = await prowlarr.search_torrents(title, year=year)
    if not results:
        return None
    ctx = {"mode": "movie"}
    scored = [{**t, "_score": scoring.score_torrent(t, ctx)} for t in results]
    picks = scoring.pick_best_three(scored, ctx)
    preset = item.get("quality_preset", "value")
    pick = picks.get(preset)
    if not pick:
        return None
    if pick.get("seeders", 0) < item.get("min_seeds", 20):
        return None
    parsed = pick["_score"]["parsed"]
    if parsed["source"] in ("CAM", "TS"):
        return None
    return pick


async def _check_tv(item: dict) -> dict | None:
    """For TV: figure out missing seasons (TMDb total vs Plex have-list),
    pick the lowest missing season number, search for a pack of that season,
    return best eligible pack."""
    tv_id = item.get("id")
    title = item.get("title", "")
    try:
        detail = await tmdb_tv.get_tv_detail(tv_id)
    except Exception:
        return None

    plex_eps = await plex.get_tv_show_episodes(title, tmdb_id=tv_id)
    target_season = None
    for s in (detail.get("seasons") or []):
        sn = s.get("season_number")
        ep_count = s.get("episode_count") or 0
        if sn is None or sn <= 0 or ep_count == 0:
            continue
        have = plex_eps.get(sn) or plex_eps.get(str(sn)) or []
        if len(have) < ep_count:
            target_season = sn
            break

    if target_season is None:
        return None  # all seasons complete

    year = None
    fad = detail.get("first_air_date")
    if fad:
        try:
            year = int(fad[:4])
        except (ValueError, TypeError):
            pass
    results = await prowlarr.search_tv_torrents(title, season=target_season, year=year)
    if not results:
        return None

    runtime_min = (detail.get("episode_run_time") or [45])[0] or 45
    season_info = next((s for s in detail.get("seasons", []) if s.get("season_number") == target_season), None)
    episode_count = season_info.get("episode_count") if season_info else 10

    ctx = {
        "mode": "tv",
        "runtime_min": runtime_min,
        "episode_count": episode_count,
        "is_season_search": True,
    }
    scored = [{**t, "_score": scoring.score_torrent(t, ctx)} for t in results]
    picks = scoring.pick_best_three(scored, ctx)
    preset = item.get("quality_preset", "value")
    pick = picks.get(preset)
    if not pick or pick.get("seeders", 0) < item.get("min_seeds", 20):
        return None
    return {**pick, "_target_season": target_season}


# ─── Main check loop ───────────────────────────────────────────────────────

async def check_watchlist() -> dict:
    """Run a single sweep of the watchlist. Returns a small summary dict.
    Each waiting item is evaluated per its scheduling rule; eligible
    matches are added to qBit and the entry is marked downloaded."""
    items = await auto_watchlist.read_all()
    summary = {"checked": 0, "downloaded": 0, "skipped": 0, "errors": 0}

    for item in items:
        if item.get("status") != "waiting":
            continue
        if not _should_check(item):
            summary["skipped"] += 1
            continue

        summary["checked"] += 1
        try:
            pick = None
            if item["type"] == "movie":
                pick = await _check_movie(item)
                if pick:
                    await qbittorrent.add_torrent(pick["magnet"], item["title"])
                    await auto_watchlist.update(item["id"], item["type"], {
                        "status": "downloaded",
                        "downloaded_title": pick["title"],
                        "downloaded_at": auto_watchlist.now_iso(),
                        "last_checked": auto_watchlist.now_iso(),
                        "found_seeders": pick.get("seeders"),
                        "found_score": pick["_score"]["score"],
                        "found_tier": pick["_score"]["tier"],
                    })
                    await history.append({
                        "type": "movie",
                        "name": pick["title"],
                        "source": "auto",
                        "score": pick["_score"]["score"],
                    })
                    print(f"[auto-downloader] DOWNLOADED movie {item['title']!r} → {pick['title']}", flush=True)
                    summary["downloaded"] += 1
                else:
                    await auto_watchlist.update(item["id"], item["type"], {"last_checked": auto_watchlist.now_iso()})

            elif item["type"] in ("tv", "anime"):
                pick = await _check_tv(item)
                if pick:
                    season = pick.pop("_target_season", 1)
                    await qbittorrent.add_tv_torrent(pick["magnet"], item["title"], season)
                    await auto_watchlist.update(item["id"], item["type"], {
                        "last_checked": auto_watchlist.now_iso(),
                        "last_downloaded_season": season,
                        "last_downloaded_title": pick["title"],
                        "last_downloaded_at": auto_watchlist.now_iso(),
                        # Stay in "waiting" so we keep checking for future seasons
                    })
                    await history.append({
                        "type": item["type"],
                        "name": pick["title"],
                        "source": "auto",
                        "score": pick["_score"]["score"],
                    })
                    print(f"[auto-downloader] DOWNLOADED {item['type']} {item['title']!r} S{season:02d} → {pick['title']}", flush=True)
                    summary["downloaded"] += 1
                else:
                    await auto_watchlist.update(item["id"], item["type"], {"last_checked": auto_watchlist.now_iso()})
        except Exception as e:
            summary["errors"] += 1
            print(f"[auto-downloader] error checking {item.get('title')!r}: {e}", flush=True)
            try:
                await auto_watchlist.update(item["id"], item["type"], {
                    "last_checked": auto_watchlist.now_iso(),
                    "last_error": str(e)[:200],
                })
            except Exception:
                pass

    if summary["checked"] or summary["downloaded"]:
        print(f"[auto-downloader] sweep: {summary}", flush=True)
    return summary


# ─── Background task ───────────────────────────────────────────────────────

async def background_loop():
    """Run check_watchlist forever on a 6-hour cycle, with a short initial
    delay so the app finishes starting before the first check fires."""
    await asyncio.sleep(60)
    while True:
        try:
            await check_watchlist()
        except Exception as e:
            print(f"[auto-downloader] background_loop crashed: {e}", flush=True)
        await asyncio.sleep(6 * 3600)


def start_background_task():
    global _TASK
    if _TASK is None or _TASK.done():
        _TASK = asyncio.create_task(background_loop())
        print("[auto-downloader] background task started", flush=True)
    return _TASK


def stop_background_task():
    global _TASK
    if _TASK and not _TASK.done():
        _TASK.cancel()
        print("[auto-downloader] background task stopped", flush=True)
    _TASK = None
