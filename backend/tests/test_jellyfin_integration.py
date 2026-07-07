"""Integration tests for services.jellyfin library logic against a mocked
Jellyfin API, plus the router-level in_library annotation that consumes it.
Mirrors the plex integration suite (same contract, Jellyfin payload shapes).
Every test uses clear_jellyfin_cache — the module caches for 5 minutes."""

import asyncio

import pytest

from services import jellyfin
from routers.movies import _annotate


def _items(items):
    return {"Items": items, "TotalRecordCount": len(items)}


def _movie(name, year=2000, tmdb=None, item_id="abc123", provider_ids=None):
    out = {"Name": name, "ProductionYear": year, "Id": item_id}
    if provider_ids is not None:
        out["ProviderIds"] = provider_ids
    elif tmdb is not None:
        out["ProviderIds"] = {"Imdb": "tt0000000", "Tmdb": str(tmdb)}
    return out


def _episode(season, ep):
    return {"ParentIndexNumber": season, "IndexNumber": ep, "Type": "Episode"}


# ─── Library items + ProviderIds parsing ────────────────────────────────────

class TestLibraryItems:
    def test_request_shape(self, mock_http, clear_jellyfin_cache):
        mock_http.add("GET", "/Items", json=_items([]))
        asyncio.run(jellyfin.get_library_items_with_tmdb())

        req = mock_http.requests[0]
        assert req.url.host == "jellyfin.test"
        assert req.url.params["IncludeItemTypes"] == "Movie"
        assert req.url.params["Recursive"] == "true"
        assert "ProviderIds" in req.url.params["Fields"]
        assert 'Token="test-jellyfin-key"' in req.headers["Authorization"]

    def test_tmdb_id_extracted(self, mock_http, clear_jellyfin_cache):
        mock_http.add("GET", "/Items", json=_items([_movie("The Matrix", 1999, tmdb=603)]))
        items = asyncio.run(jellyfin.get_library_items_with_tmdb())
        assert items == [{"title": "The Matrix", "year": 1999, "tmdb_id": 603}]

    def test_provider_key_case_insensitive(self, mock_http, clear_jellyfin_cache):
        mock_http.add("GET", "/Items", json=_items([
            _movie("Lowercase Keys", provider_ids={"tmdb": "42"}),
        ]))
        items = asyncio.run(jellyfin.get_library_items_with_tmdb())
        assert items[0]["tmdb_id"] == 42

    def test_junk_tmdb_value_yields_none(self, mock_http, clear_jellyfin_cache):
        mock_http.add("GET", "/Items", json=_items([
            _movie("Broken", provider_ids={"Tmdb": "not-a-number"}),
        ]))
        items = asyncio.run(jellyfin.get_library_items_with_tmdb())
        assert items[0]["tmdb_id"] is None

    def test_no_provider_ids_at_all(self, mock_http, clear_jellyfin_cache):
        mock_http.add("GET", "/Items", json=_items([{"Name": "Old Rip", "ProductionYear": 1985}]))
        items = asyncio.run(jellyfin.get_library_items_with_tmdb())
        assert items == [{"title": "Old Rip", "year": 1985, "tmdb_id": None}]

    def test_second_call_served_from_cache(self, mock_http, clear_jellyfin_cache):
        mock_http.add("GET", "/Items", json=_items([_movie("The Matrix", tmdb=603)]))
        asyncio.run(jellyfin.get_library_items_with_tmdb())
        first_count = len(mock_http.requests)
        again = asyncio.run(jellyfin.get_library_items_with_tmdb())
        assert len(mock_http.requests) == first_count  # no new HTTP traffic
        assert again[0]["tmdb_id"] == 603


# ─── get_library_index ──────────────────────────────────────────────────────

class TestLibraryIndex:
    def test_split_between_ids_and_fallback_titles(self, mock_http, clear_jellyfin_cache):
        mock_http.add("GET", "/Items", json=_items([
            _movie("The Matrix", tmdb=603),
            _movie("Some Unmatched Home Video"),
        ]))
        index = asyncio.run(jellyfin.get_library_index())
        assert index["tmdb_ids"] == {603}
        assert index["fallback_titles"] == {"someunmatchedhomevideo"}
        # crucially: the TMDb-matched title is NOT in the fallback set
        assert "matrix" not in index["fallback_titles"]


# ─── Refresh + recently added + poster ──────────────────────────────────────

class TestRefreshAndExtras:
    def test_refresh_posts_library_refresh(self, mock_http):
        mock_http.add("POST", "/Library/Refresh", status=204)
        result = asyncio.run(jellyfin.refresh_library())
        assert result == {"status": "refresh triggered"}
        assert len(mock_http.requests_to("/Library/Refresh")) == 1

    def test_tv_refresh_same_endpoint(self, mock_http):
        mock_http.add("POST", "/Library/Refresh", status=204)
        result = asyncio.run(jellyfin.refresh_tv_library())
        assert result == {"status": "refresh triggered"}

    def test_recently_added_normalized_shape(self, mock_http, clear_jellyfin_cache):
        item = _movie("Inside Out 2", 2024, tmdb=1022789, item_id="ff01")
        item["CommunityRating"] = 7.6
        mock_http.add("GET", "/Items", json=_items([item]))
        recent = asyncio.run(jellyfin.get_recently_added(limit=5))

        req = mock_http.requests[0]
        assert req.url.params["SortBy"] == "DateCreated"
        assert req.url.params["SortOrder"] == "Descending"
        assert req.url.params["Limit"] == "5"
        assert recent == [{"title": "Inside Out 2", "year": 2024, "rating": 7.6,
                           "tmdb_id": 1022789, "item_id": "ff01"}]

    def test_poster_image_bytes_and_type(self, mock_http):
        mock_http.add("GET", "/Items/ff01/Images/Primary", text="\x89fakejpeg")
        content, ctype = asyncio.run(jellyfin.get_poster_image("ff01", max_width=300))
        assert content == "\x89fakejpeg".encode()
        req = mock_http.requests[0]
        assert req.url.params["maxWidth"] == "300"


# ─── normalize_title (pure) ─────────────────────────────────────────────────

class TestNormalizeTitle:
    @pytest.mark.parametrize("raw,expected", [
        ("The Matrix", "matrix"),
        ("A Bug's Life", "bugslife"),
        ("An American Tail", "americantail"),
        ("Se7en!", "se7en"),
        ("Léon: The Professional", "lontheprofessional"),  # non-ascii dropped
        ("the the", "the"),  # only the first article is stripped
        ("", ""),
        (None, ""),
    ])
    def test_normalization(self, raw, expected):
        assert jellyfin.normalize_title(raw) == expected


# ─── TV episodes lookup ─────────────────────────────────────────────────────

class TestTvEpisodes:
    def _wire_series(self, mock_http, series_items):
        # Series query and episodes are both under /Items|/Shows; register the
        # more specific /Shows route first when needed by the test itself.
        mock_http.add("GET", "/Items", json=_items(series_items))

    def test_episode_tree_by_tmdb_id(self, mock_http, clear_jellyfin_cache):
        mock_http.add("GET", "/Shows/s100/Episodes", json=_items([
            _episode(1, 2), _episode(1, 1),
            {"ParentIndexNumber": None, "IndexNumber": 1},   # unnumbered season
            {"ParentIndexNumber": 1, "IndexNumber": None},   # unnumbered episode
            _episode(2, 1),
        ]))
        self._wire_series(mock_http, [_movie("Severance", 2022, tmdb=95396, item_id="s100")])
        result = asyncio.run(jellyfin.get_tv_show_episodes("Severance", tmdb_id=95396))
        # episode indices sorted; entries without season or episode number dropped
        assert result == {1: [1, 2], 2: [1]}

    def test_title_fallback_normalized_match(self, mock_http, clear_jellyfin_cache):
        mock_http.add("GET", "/Shows/s300/Episodes", json=_items([_episode(1, 1)]))
        self._wire_series(mock_http, [_movie("The Bear", 2022, tmdb=None,
                                             provider_ids={}, item_id="s300")])
        result = asyncio.run(jellyfin.get_tv_show_episodes("bear"))
        assert result == {1: [1]}

    def test_tmdb_id_wins_over_same_title(self, mock_http, clear_jellyfin_cache):
        # Two shows normalize to the same title; the TMDb id picks the right one
        mock_http.add("GET", "/Shows/us1/Episodes", json=_items([_episode(1, 1)]))
        self._wire_series(mock_http, [
            _movie("Shameless", 2004, tmdb=558, item_id="uk1"),
            _movie("Shameless (US)", 2011, tmdb=34307, item_id="us1"),
        ])
        result = asyncio.run(jellyfin.get_tv_show_episodes("Shameless", tmdb_id=34307))
        assert result == {1: [1]}
        assert mock_http.requests_to("/Shows/uk1") == []

    def test_unknown_show_cached_as_empty(self, mock_http, clear_jellyfin_cache):
        self._wire_series(mock_http, [])
        assert asyncio.run(jellyfin.get_tv_show_episodes("Ghost Show")) == {}
        first_count = len(mock_http.requests)
        assert asyncio.run(jellyfin.get_tv_show_episodes("Ghost Show")) == {}
        assert len(mock_http.requests) == first_count


# ─── Router-level in_library annotation ─────────────────────────────────────

class TestAnnotate:
    def test_tmdb_id_match_authoritative(self, mock_http, clear_jellyfin_cache):
        mock_http.add("GET", "/Items", json=_items([_movie("The Matrix", tmdb=603)]))
        movies = asyncio.run(_annotate([
            {"id": 603, "title": "The Matrix", "poster_path": "/m.jpg"},
            {"id": 604, "title": "The Matrix Reloaded", "poster_path": None},
        ]))
        assert movies[0]["in_library"] is True
        assert movies[1]["in_library"] is False
        assert movies[0]["poster_url"] == "https://image.tmdb.org/t/p/w500/m.jpg"
        assert movies[1]["poster_url"] is None

    def test_same_title_does_not_false_flag_via_fallback(self, mock_http, clear_jellyfin_cache):
        # Library's "Heat" is TMDb-mapped (id 949, the 1995 film). The 1972
        # "Heat" (different id) shares the title but must NOT match — mapped
        # items are excluded from the fallback title set by design.
        mock_http.add("GET", "/Items", json=_items([_movie("Heat", 1995, tmdb=949)]))
        movies = asyncio.run(_annotate([{"id": 28904, "title": "Heat"}]))
        assert movies[0]["in_library"] is False

    def test_fallback_title_match_for_unmapped_item(self, mock_http, clear_jellyfin_cache):
        mock_http.add("GET", "/Items", json=_items([_movie("The Home Movie")]))
        movies = asyncio.run(_annotate([{"id": 1, "title": "Home Movie"}]))
        assert movies[0]["in_library"] is True
