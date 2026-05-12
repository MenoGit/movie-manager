import asyncio
from fastapi import APIRouter, Query
from services import tmdb_tv, plex

router = APIRouter(prefix="/tv", tags=["tv"])


async def _summary_progress(show_name: str, tmdb_id: int | None = None) -> dict | None:
    """Cheap shape for list cards: seasons present + episode count, derived
    entirely from cached Plex data (no TMDb call)."""
    eps = await plex.get_tv_show_episodes(show_name, tmdb_id=tmdb_id)
    if not eps:
        return None
    seasons = sorted(int(s) for s in eps.keys())
    total_have = sum(len(v) for v in eps.values())
    return {
        "seasons_in_library": seasons,
        "episodes_in_library_count": total_have,
    }


def _compute_full_progress(detail: dict, plex_eps: dict) -> dict:
    """Rich progress shape for the modal: compares TMDb's per-season episode
    counts against what's in Plex. Season 0 (Specials) excluded."""
    seasons_complete = []
    seasons_partial: dict[str, dict] = {}
    total_have = 0
    total = 0
    for s in detail.get("seasons", []):
        sn = s.get("season_number")
        ep_count = s.get("episode_count") or 0
        if sn is None or sn <= 0:
            continue
        total += ep_count
        # plex_eps keys may be ints (from cache) or strings (from JSON); try both
        have_list = plex_eps.get(sn) or plex_eps.get(str(sn)) or []
        have = len(have_list)
        # Don't count "extras" beyond what TMDb knows about
        total_have += min(have, ep_count) if ep_count else have
        if ep_count > 0 and have >= ep_count:
            seasons_complete.append(sn)
        elif have > 0:
            seasons_partial[str(sn)] = {"have": have, "total": ep_count}
    seasons_in_lib = sorted({int(s) for s in plex_eps.keys() if int(s) > 0})
    return {
        "seasons_in_library": seasons_in_lib,
        "episodes_in_library_count": total_have,
        "seasons_complete": sorted(seasons_complete),
        "seasons_partial": seasons_partial,
        "total_episodes": total,
        "complete": total > 0 and total_have >= total,
    }


async def _annotate(shows):
    """Stamp each show with in_library + poster_url. For in-library shows,
    also attach a cheap plex_progress with what's in Plex (no TMDb call)."""
    index = await plex.get_tv_library_index()
    tmdb_ids = index["tmdb_ids"]
    fallback_titles = index["fallback_titles"]

    for s in shows:
        sid = s.get("id")
        in_lib = bool(sid and sid in tmdb_ids)
        if not in_lib and fallback_titles:
            in_lib = plex.normalize_title(s.get("name", "")) in fallback_titles
        s["in_library"] = in_lib
        s["poster_url"] = tmdb_tv.poster_url(s.get("poster_path"))

    in_lib_shows = [s for s in shows if s["in_library"]]
    if in_lib_shows:
        summaries = await asyncio.gather(
            *[_summary_progress(s.get("name", ""), s.get("id")) for s in in_lib_shows]
        )
        for s, summary in zip(in_lib_shows, summaries):
            if summary:
                s["plex_progress"] = summary
    return shows


@router.get("/trending")
async def trending(window: str = "week", page: int = 1):
    return await _annotate(await tmdb_tv.get_trending_tv(window, page))


@router.get("/popular")
async def popular(page: int = 1):
    return await _annotate(await tmdb_tv.get_popular_tv(page))


@router.get("/top-rated")
async def top_rated(page: int = 1):
    return await _annotate(await tmdb_tv.get_top_rated_tv(page))


@router.get("/on-the-air")
async def on_the_air(page: int = 1):
    return await _annotate(await tmdb_tv.get_on_the_air(page))


@router.get("/airing-today")
async def airing_today(page: int = 1):
    return await _annotate(await tmdb_tv.get_airing_today(page))


@router.get("/genres")
async def genres():
    return await tmdb_tv.get_tv_genres()


@router.get("/search")
async def search(q: str = Query(..., min_length=1)):
    return await _annotate(await tmdb_tv.search_tv(q))


@router.get("/all-time-best")
async def all_time_best(page: int = 1):
    return await _annotate(await tmdb_tv.get_all_time_best_tv(page))


@router.get("/hidden-gems")
async def hidden_gems(page: int = 1):
    return await _annotate(await tmdb_tv.get_hidden_gems_tv(page))


@router.get("/decade/{decade}")
async def by_decade(decade: str, page: int = 1):
    return await _annotate(await tmdb_tv.get_tv_by_decade(decade, page))


@router.get("/genre/{genre_id}")
async def by_genre(genre_id: int, page: int = 1):
    return await _annotate(await tmdb_tv.get_tv_by_genre(genre_id, page))


@router.get("/network/{network_id}")
async def by_network(network_id: int, page: int = 1):
    return await _annotate(await tmdb_tv.get_tv_by_network(network_id, page))


@router.get("/{tv_id}/season/{season_number}")
async def tv_season(tv_id: int, season_number: int):
    """Episode list for a season + which of those episodes the user already has in Plex."""
    season = await tmdb_tv.get_tv_season(tv_id, season_number)
    show_detail = await tmdb_tv.get_tv_detail(tv_id)
    have_map = await plex.get_tv_show_episodes(show_detail.get("name", ""), tmdb_id=tv_id)
    have_eps = set(have_map.get(season_number, []))
    for ep in season.get("episodes", []):
        ep["in_library"] = ep.get("episode_number") in have_eps
        ep["still_url"] = tmdb_tv.poster_url(ep.get("still_path"))
    return season


@router.get("/{tv_id}")
async def tv_detail(tv_id: int):
    detail = await tmdb_tv.get_tv_detail(tv_id)
    index = await plex.get_tv_library_index()
    in_lib = tv_id in index["tmdb_ids"]
    if not in_lib and index["fallback_titles"]:
        in_lib = plex.normalize_title(detail.get("name", "")) in index["fallback_titles"]
    detail["in_library"] = in_lib
    detail["poster_url"] = tmdb_tv.poster_url(detail.get("poster_path"))
    if in_lib:
        plex_eps = await plex.get_tv_show_episodes(detail.get("name", ""), tmdb_id=tv_id)
        detail["plex_episodes"] = plex_eps
        detail["plex_progress"] = _compute_full_progress(detail, plex_eps)
    return detail
