"""Anime is a subset of TV — same Plex library, same in-library check.
Routes mirror TV but with an anime-filtered discover under the hood."""

import asyncio
from fastapi import APIRouter, Query
from services import tmdb_anime, tmdb_tv, plex

router = APIRouter(prefix="/anime", tags=["anime"])


async def _summary_progress(show_name: str, tmdb_id: int | None = None) -> dict | None:
    eps = await plex.get_tv_show_episodes(show_name, tmdb_id=tmdb_id)
    if not eps:
        return None
    seasons = sorted(int(s) for s in eps.keys())
    total_have = sum(len(v) for v in eps.values())
    return {"seasons_in_library": seasons, "episodes_in_library_count": total_have}


def _compute_full_progress(detail: dict, plex_eps: dict) -> dict:
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
        have_list = plex_eps.get(sn) or plex_eps.get(str(sn)) or []
        have = len(have_list)
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
    """Add in_library + poster_url. Anime lives in the TV library so we use
    the TV index. Async-gather summary progress for in-library entries."""
    index = await plex.get_tv_library_index()
    tmdb_ids, fallback_titles = index["tmdb_ids"], index["fallback_titles"]
    for s in shows:
        sid = s.get("id")
        in_lib = bool(sid and sid in tmdb_ids)
        if not in_lib and fallback_titles:
            in_lib = plex.normalize_title(s.get("name", "")) in fallback_titles
        s["in_library"] = in_lib
        s["poster_url"] = tmdb_anime.poster_url(s.get("poster_path"))
        s["media_type"] = "tv"

    in_lib_shows = [s for s in shows if s["in_library"]]
    if in_lib_shows:
        summaries = await asyncio.gather(
            *[_summary_progress(s.get("name", ""), s.get("id")) for s in in_lib_shows]
        )
        for s, summary in zip(in_lib_shows, summaries):
            if summary:
                s["plex_progress"] = summary
    return shows


async def _annotate_movies(movies):
    """Anime films are movies, not TV — they don't live in the Plex TV
    library. Just mark poster_url; in_library against the movie library
    is checked the same way regular movies are."""
    library = await plex.get_library_index()
    tmdb_ids, fallback_titles = library["tmdb_ids"], library["fallback_titles"]
    for m in movies:
        mid = m.get("id")
        in_lib = bool(mid and mid in tmdb_ids)
        if not in_lib and fallback_titles:
            in_lib = plex.normalize_title(m.get("title", "")) in fallback_titles
        m["in_library"] = in_lib
        m["poster_url"] = tmdb_anime.poster_url(m.get("poster_path"))
        m["media_type"] = "movie"
    return movies


@router.get("/trending")
async def trending(page: int = 1):
    return await _annotate(await tmdb_anime.get_trending_anime(page))


@router.get("/popular")
async def popular(page: int = 1):
    return await _annotate(await tmdb_anime.get_popular_anime(page))


@router.get("/top-rated")
async def top_rated(page: int = 1):
    return await _annotate(await tmdb_anime.get_top_rated_anime(page))


@router.get("/airing")
async def airing(page: int = 1):
    return await _annotate(await tmdb_anime.get_airing_anime(page))


@router.get("/movies")
async def anime_movies(page: int = 1):
    return await _annotate_movies(await tmdb_anime.get_anime_movies(page))


@router.get("/genres")
async def genres():
    return await tmdb_anime.get_anime_genres()


@router.get("/genre/{subgenre_id}")
async def by_subgenre(subgenre_id: int, kind: str = Query("genre"), page: int = 1):
    return await _annotate(await tmdb_anime.get_anime_by_subgenre(subgenre_id, kind, page))


@router.get("/search")
async def search(q: str = Query(..., min_length=1)):
    return await _annotate(await tmdb_anime.search_anime(q))


@router.get("/{tv_id}/season/{season_number}")
async def anime_season(tv_id: int, season_number: int):
    season = await tmdb_anime.get_anime_season(tv_id, season_number)
    detail = await tmdb_anime.get_anime_detail(tv_id)
    have_map = await plex.get_tv_show_episodes(detail.get("name", ""), tmdb_id=tv_id)
    have_eps = set(have_map.get(season_number, []))
    for ep in season.get("episodes", []):
        ep["in_library"] = ep.get("episode_number") in have_eps
        ep["still_url"] = tmdb_anime.poster_url(ep.get("still_path"))
    return season


@router.get("/{tv_id}")
async def anime_detail(tv_id: int):
    detail = await tmdb_anime.get_anime_detail(tv_id)
    index = await plex.get_tv_library_index()
    in_lib = tv_id in index["tmdb_ids"]
    if not in_lib and index["fallback_titles"]:
        in_lib = plex.normalize_title(detail.get("name", "")) in index["fallback_titles"]
    detail["in_library"] = in_lib
    detail["poster_url"] = tmdb_anime.poster_url(detail.get("poster_path"))
    if in_lib:
        plex_eps = await plex.get_tv_show_episodes(detail.get("name", ""), tmdb_id=tv_id)
        detail["plex_episodes"] = plex_eps
        detail["plex_progress"] = _compute_full_progress(detail, plex_eps)
    return detail
