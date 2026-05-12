import asyncio
import re
import httpx
from config import settings

BASE = settings.prowlarr_url
HEADERS = {"X-Api-Key": settings.prowlarr_api_key}

def _format(results: list) -> list:
    results = [t for t in results if t.get("seeders", 0) > 0]
    results.sort(key=lambda x: x.get("seeders", 0), reverse=True)
    return [
        {
            "title": t.get("title"),
            "size": t.get("size"),
            "seeders": t.get("seeders"),
            "leechers": t.get("leechers"),
            "quality": t.get("quality"),
            "indexer": t.get("indexer"),
            "magnet": t.get("magnetUrl") or t.get("downloadUrl"),
            "info_hash": t.get("infoHash"),
        }
        for t in results
    ]


async def search_torrents(query: str, limit: int = 20) -> list:
    """Search all configured indexers in Prowlarr for a movie."""
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{BASE}/api/v1/search",
            headers=HEADERS,
            params={"query": query, "type": "movie", "limit": limit},
            timeout=30.0,
        )
        r.raise_for_status()
        return _format(r.json())


def _matches_episode(title: str, season: int, episode: int) -> bool:
    """True if the torrent title likely contains the requested S/E.
    Handles common release naming: S03E01, S3E1, 3x01, 03x01, S03.E01, etc."""
    if not title:
        return False
    norm = re.sub(r"[^A-Z0-9]", "", title.upper())
    patterns = {
        f"S{season:02d}E{episode:02d}",
        f"S{season}E{episode:02d}",
        f"S{season:02d}E{episode}",
        f"S{season}E{episode}",
        f"{season:02d}X{episode:02d}",
        f"{season}X{episode:02d}",
        f"{season:02d}X{episode}",
        f"{season}X{episode}",
    }
    return any(p in norm for p in patterns)


async def _single_search(params: dict) -> list:
    """Single Prowlarr search request. Returns raw results list, [] on failure."""
    async with httpx.AsyncClient() as client:
        try:
            r = await client.get(
                f"{BASE}/api/v1/search", headers=HEADERS, params=params, timeout=30.0,
            )
            r.raise_for_status()
            return r.json()
        except (httpx.RequestError, httpx.HTTPStatusError) as e:
            print(f"[prowlarr] query failed {params}: {e}", flush=True)
            return []


def _matches_season(title: str, season: int) -> bool:
    """True if a torrent title is relevant to the requested season.
    Drops other-season episodes and other-season packs (e.g. S01 results
    when user asked for S03). Allows titles with no season marker through
    since those may be complete-series packs."""
    if not title:
        return False
    t = title.upper()
    # Episode of any season (S03E01 etc.). Word boundaries treat dots/dashes
    # as separators so "S03.E01" and "S03E01" both match.
    m = re.search(r"\bS(\d{1,2})E\d{1,3}\b", t)
    if m:
        return int(m.group(1)) == season
    # Standalone season marker (S03 not followed by E\d). \b on both sides
    # so "S01.2160p" yields S01 (the period is a word boundary).
    seasons_found = re.findall(r"\bS(\d{1,2})\b", t)
    if seasons_found:
        return any(int(s) == season for s in seasons_found)
    # No season marker at all — could be a complete-series pack. Keep.
    return True


async def search_anime_torrents(query: str, season: int | None = None,
                                  episode: int | None = None, limit: int = 20) -> list:
    """Anime-friendly search: plain `type=search` text query rather than
    tvsearch. Anime indexers (Nyaa) and most release naming don't follow the
    S##E## convention reliably — they use formats like 'Show - 05'."""
    parts = [query.strip()]
    if season is not None:
        parts.append(f"S{int(season):02d}")
    if episode is not None:
        # "Show - 05" is the common anime format; including "E05" too for indexers that look for it.
        parts.append(f"{int(episode):02d}")
    formatted = " ".join(parts)

    print(f"[prowlarr anime search] query={formatted!r}", flush=True)
    params = {"query": formatted, "type": "search", "limit": limit}
    raw = await _single_search(params)
    formatted_results = _format(raw)
    print(f"[prowlarr anime search] raw={len(raw)} seeded={len(formatted_results)}", flush=True)
    return formatted_results


async def search_tv_torrents(query: str, season: int | None = None,
                              episode: int | None = None, limit: int = 20) -> list:
    """Search Prowlarr for a TV show with strategy varying by what's specified.

    - Episode (season + episode): tvsearch + post-filter on title S/E pattern.
    - Season (season only): tvsearch + 3 text fallbacks in parallel, dedupe
      by info_hash, filter to results matching the requested season.
    - General (neither): plain tvsearch."""

    # ─── Episode-specific search ──────────────────────────────────────
    if episode is not None and season is not None:
        params = {"query": query, "type": "tvsearch", "season": season,
                  "episode": episode, "limit": limit}
        print(f"[prowlarr tv search] EPISODE query={query!r} S{season}E{episode}", flush=True)
        raw = await _single_search(params)
        formatted = _format(raw)
        print(f"[prowlarr tv search] raw={len(raw)} seeded={len(formatted)}", flush=True)
        narrowed = [t for t in formatted if _matches_episode(t["title"], season, episode)]
        print(f"[prowlarr tv search] episode-narrowed: {len(narrowed)}", flush=True)
        return narrowed if narrowed else formatted

    # ─── Season-pack search: multi-query strategy ─────────────────────
    if season is not None:
        param_sets = [
            {"query": query, "type": "tvsearch", "season": season, "limit": limit},
            {"query": f"{query} S{season:02d}", "type": "search", "limit": limit},
            {"query": f"{query} Season {season}", "type": "search", "limit": limit},
            {"query": f"{query} Complete Season {season}", "type": "search", "limit": limit},
        ]
        print(f"[prowlarr tv search] SEASON query={query!r} season={season} — running {len(param_sets)} strategies in parallel", flush=True)
        results_lists = await asyncio.gather(*[_single_search(p) for p in param_sets])

        # Merge & dedupe by info_hash (falls back to title)
        seen, merged = set(), []
        for i, results in enumerate(results_lists):
            print(f"[prowlarr tv search]   strategy {i+1}: {len(results)} raw", flush=True)
            for r in results:
                key = (r.get("infoHash") or r.get("title") or "").lower()
                if not key or key in seen:
                    continue
                seen.add(key)
                merged.append(r)
        print(f"[prowlarr tv search] merged unique: {len(merged)}", flush=True)

        # Filter to results that actually pertain to this season
        relevant = [r for r in merged if _matches_season(r.get("title", ""), season)]
        print(f"[prowlarr tv search] season-relevant: {len(relevant)} (dropped {len(merged) - len(relevant)} other-season)", flush=True)
        return _format(relevant)

    # ─── General (no season/episode) ───────────────────────────────────
    params = {"query": query, "type": "tvsearch", "limit": limit}
    print(f"[prowlarr tv search] GENERAL query={query!r}", flush=True)
    raw = await _single_search(params)
    return _format(raw)
