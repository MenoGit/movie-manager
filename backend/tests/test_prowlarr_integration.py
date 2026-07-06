"""Integration tests for services.prowlarr search paths against a mocked
Prowlarr API. Characterization: locks in current behavior — request shape
(params/headers), result formatting, filtering, and error handling. No real
network; everything goes through conftest's mock_http transport."""

import asyncio

import httpx

from services import prowlarr


def _raw(title, seeders=10, **extra):
    return {
        "title": title,
        "size": 1_000_000_000,
        "seeders": seeders,
        "leechers": 3,
        "quality": None,
        "indexer": "MockIndexer",
        "magnetUrl": f"magnet:?xt=urn:btih:{abs(hash(title)):x}",
        "infoHash": f"{abs(hash(title)):040x}"[:40],
        **extra,
    }


# ─── Movie search: search_torrents ──────────────────────────────────────────

class TestMovieSearch:
    def test_request_shape(self, mock_http):
        mock_http.add("GET", "/api/v1/search", json=[])
        asyncio.run(prowlarr.search_torrents("Heat", limit=25, year=1995))

        assert len(mock_http.requests) == 1
        req = mock_http.requests[0]
        assert req.url.host == "prowlarr.test"
        assert req.url.params["query"] == "Heat"
        assert req.url.params["type"] == "movie"
        assert req.url.params["limit"] == "25"
        assert req.headers["X-Api-Key"] == "test-prowlarr-key"

    def test_formats_and_year_tags(self, mock_http):
        mock_http.add("GET", "/api/v1/search", json=[
            _raw("Heat 1995 1080p BluRay", seeders=50),
            _raw("Heat 2024 Remake 2160p", seeders=200),
            _raw("Heat Directors Cut", seeders=5),
        ])
        results = asyncio.run(prowlarr.search_torrents("Heat", year=1995))

        # year_match first despite fewer seeders, then no_year, then other_year
        assert [r["_match"] for r in results] == ["year_match", "no_year", "other_year"]
        assert results[0]["title"] == "Heat 1995 1080p BluRay"
        # _format output shape
        assert set(results[0]) == {
            "title", "size", "seeders", "leechers", "quality",
            "indexer", "magnet", "info_hash", "_match",
        }

    def test_zero_seeders_dropped(self, mock_http):
        mock_http.add("GET", "/api/v1/search", json=[
            _raw("Dead Torrent", seeders=0),
            _raw("Alive Torrent", seeders=1),
        ])
        results = asyncio.run(prowlarr.search_torrents("x"))
        assert [r["title"] for r in results] == ["Alive Torrent"]

    def test_magnet_falls_back_to_download_url(self, mock_http):
        raw = _raw("No Magnet Here")
        raw["magnetUrl"] = None
        raw["downloadUrl"] = "http://prowlarr.test:9696/download/1"
        mock_http.add("GET", "/api/v1/search", json=[raw])
        results = asyncio.run(prowlarr.search_torrents("x"))
        assert results[0]["magnet"] == "http://prowlarr.test:9696/download/1"

    def test_http_error_propagates(self, mock_http):
        # search_torrents (movie path) has no try/except — a Prowlarr 500
        # raises out to the router. Characterization of current behavior.
        mock_http.add("GET", "/api/v1/search", json={"error": "boom"}, status=500)
        try:
            asyncio.run(prowlarr.search_torrents("x"))
        except httpx.HTTPStatusError:
            pass
        else:
            raise AssertionError("expected HTTPStatusError to propagate")


# ─── TV search: episode path ────────────────────────────────────────────────

class TestTvEpisodeSearch:
    def test_request_shape_and_strict_filter(self, mock_http):
        mock_http.add("GET", "/api/v1/search", json=[
            _raw("Show.S03E01.1080p.WEB", seeders=40),
            _raw("Show.S03E10.1080p.WEB", seeders=90),   # wrong episode
            _raw("Show.S03.Complete", seeders=100),      # season pack, no E marker
        ])
        results = asyncio.run(prowlarr.search_tv_torrents("Show", season=3, episode=1))

        req = mock_http.requests[0]
        assert req.url.params["type"] == "tvsearch"
        assert req.url.params["season"] == "3"
        assert req.url.params["episode"] == "1"
        assert [r["title"] for r in results] == ["Show.S03E01.1080p.WEB"]

    def test_no_fallback_on_zero_matches(self, mock_http):
        # If the strict filter kills everything, we return [] rather than
        # leak the unfiltered list (deliberate: no fake results).
        mock_http.add("GET", "/api/v1/search", json=[
            _raw("Other.Show.S05E09", seeders=100),
        ])
        results = asyncio.run(prowlarr.search_tv_torrents("Show", season=3, episode=1))
        assert results == []

    def test_dot_separated_episode_matches(self, mock_http):
        # Regression guard for the S03.E01 fix at the integration level.
        mock_http.add("GET", "/api/v1/search", json=[
            _raw("Show.S03.E01.2160p", seeders=12),
        ])
        results = asyncio.run(prowlarr.search_tv_torrents("Show", season=3, episode=1))
        assert [r["title"] for r in results] == ["Show.S03.E01.2160p"]

    def test_request_error_returns_empty(self, mock_http):
        mock_http.add("GET", "/api/v1/search",
                      exc=httpx.ConnectError("connection refused"))
        results = asyncio.run(prowlarr.search_tv_torrents("Show", season=3, episode=1))
        assert results == []

    def test_http_500_returns_empty(self, mock_http):
        mock_http.add("GET", "/api/v1/search", json={}, status=500)
        results = asyncio.run(prowlarr.search_tv_torrents("Show", season=3, episode=1))
        assert results == []


# ─── TV search: season-pack path ────────────────────────────────────────────

class TestTvSeasonSearch:
    def test_runs_four_strategies(self, mock_http):
        mock_http.add("GET", "/api/v1/search", json=[])
        asyncio.run(prowlarr.search_tv_torrents("Severance", season=2))

        assert len(mock_http.requests) == 4
        queries = sorted(r.url.params.get("query") for r in mock_http.requests)
        assert queries == sorted([
            "Severance",                       # tvsearch with season param
            "Severance S02",
            "Severance Season 2",
            "Severance Complete Season 2",
        ])
        tv = [r for r in mock_http.requests if r.url.params["type"] == "tvsearch"]
        assert len(tv) == 1 and tv[0].url.params["season"] == "2"

    def test_dedupes_by_infohash_and_filters_season(self, mock_http):
        dup = _raw("Severance S02 1080p", seeders=80, infoHash="a" * 40)
        mock_http.add("GET", "/api/v1/search", json=[
            dup,
            _raw("Severance S01 1080p", seeders=90, infoHash="b" * 40),  # other season
            _raw("Severance Complete Series", seeders=10, infoHash="c" * 40),  # kept: no marker
        ])
        results = asyncio.run(prowlarr.search_tv_torrents("Severance", season=2))

        # dup arrives once per strategy (4x) but survives once
        titles = [r["title"] for r in results]
        assert titles.count("Severance S02 1080p") == 1
        assert "Severance S01 1080p" not in titles
        assert "Severance Complete Series" in titles

    def test_one_failed_strategy_does_not_kill_search(self, mock_http):
        # First registered route wins per request; register the failure for
        # the "Complete Season" strategy only, others return a result.
        mock_http.add("GET", "Complete+Season",
                      exc=httpx.ConnectError("indexer timeout"))
        mock_http.add("GET", "/api/v1/search", json=[
            _raw("Severance S02 REPACK", seeders=33),
        ])
        results = asyncio.run(prowlarr.search_tv_torrents("Severance", season=2))
        assert [r["title"] for r in results] == ["Severance S02 REPACK"]


# ─── TV search: general path ────────────────────────────────────────────────

class TestTvGeneralSearch:
    def test_plain_tvsearch(self, mock_http):
        mock_http.add("GET", "/api/v1/search", json=[
            _raw("Show 2019 Complete", seeders=5),
            _raw("Show Pack", seeders=50),
        ])
        results = asyncio.run(prowlarr.search_tv_torrents("Show", year=2019))

        assert len(mock_http.requests) == 1
        req = mock_http.requests[0]
        assert req.url.params["type"] == "tvsearch"
        assert "season" not in req.url.params
        # year-containing title sorted first despite fewer seeders
        assert [r["title"] for r in results] == ["Show 2019 Complete", "Show Pack"]


# ─── Anime search ───────────────────────────────────────────────────────────

class TestAnimeSearch:
    def test_query_building_and_type(self, mock_http):
        mock_http.add("GET", "/api/v1/search", json=[])
        asyncio.run(prowlarr.search_anime_torrents("Frieren", season=1, episode=5))

        req = mock_http.requests[0]
        assert req.url.params["query"] == "Frieren S01 05"
        assert req.url.params["type"] == "search"

    def test_season_only_query(self, mock_http):
        mock_http.add("GET", "/api/v1/search", json=[])
        asyncio.run(prowlarr.search_anime_torrents("Frieren", season=2))
        assert mock_http.requests[0].url.params["query"] == "Frieren S02"

    def test_year_sort_and_seeder_filter(self, mock_http):
        mock_http.add("GET", "/api/v1/search", json=[
            _raw("[Sub] Frieren - 05", seeders=100),
            _raw("[Sub] Frieren (2023) - 05", seeders=20),
            _raw("[Sub] Frieren - 05 v2", seeders=0),
        ])
        results = asyncio.run(
            prowlarr.search_anime_torrents("Frieren", episode=5, year=2023))
        assert [r["title"] for r in results] == [
            "[Sub] Frieren (2023) - 05",  # year match first
            "[Sub] Frieren - 05",
        ]
