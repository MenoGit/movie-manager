"""Integration tests for services.plex library-index logic against a mocked
Plex API, plus the router-level in_library annotation that consumes it.
Every test uses clear_plex_cache — plex.py caches at module level for 5
minutes, which would otherwise leak state across tests."""

import asyncio

import pytest

from services import plex
from routers.movies import _annotate


def _sections(*dirs):
    return {"MediaContainer": {"Directory": list(dirs)}}


def _movie_section():
    return {"key": "1", "type": "movie", "title": "Movies"}


def _tv_section():
    return {"key": "2", "type": "show", "title": "TV Shows"}


def _metadata(items):
    return {"MediaContainer": {"Metadata": items}}


def _item(title, year=2000, tmdb_id=None, rating_key=None, extra_guids=()):
    guids = [{"id": g} for g in extra_guids]
    if tmdb_id is not None:
        guids.append({"id": f"tmdb://{tmdb_id}"})
    out = {"title": title, "year": year, "Guid": guids}
    if rating_key is not None:
        out["ratingKey"] = rating_key
    return out


# ─── Section discovery ──────────────────────────────────────────────────────

class TestSectionKeys:
    def test_movie_key_found(self, mock_http, clear_plex_cache):
        mock_http.add("GET", "/library/sections", json=_sections(_tv_section(), _movie_section()))
        assert asyncio.run(plex.get_movies_section_key()) == "1"
        assert mock_http.requests[0].headers["X-Plex-Token"] == "test-plex-token"

    def test_no_movie_section_returns_none(self, mock_http, clear_plex_cache):
        mock_http.add("GET", "/library/sections", json=_sections(_tv_section()))
        assert asyncio.run(plex.get_movies_section_key()) is None

    def test_refresh_hits_section_refresh(self, mock_http, clear_plex_cache):
        mock_http.add("GET", "/library/sections/1/refresh", json={})
        mock_http.add("GET", "/library/sections", json=_sections(_movie_section()))
        result = asyncio.run(plex.refresh_library())
        assert result == {"status": "refresh triggered", "section": "1"}
        assert len(mock_http.requests_to("/sections/1/refresh")) == 1

    def test_refresh_without_library_returns_error(self, mock_http, clear_plex_cache):
        mock_http.add("GET", "/library/sections", json=_sections())
        result = asyncio.run(plex.refresh_library())
        assert result == {"error": "No movie library found in Plex"}


# ─── Library items + guid parsing ───────────────────────────────────────────

class TestLibraryItems:
    def _wire(self, mock_http, items):
        mock_http.add("GET", "/library/sections/1/all", json=_metadata(items))
        mock_http.add("GET", "/library/sections", json=_sections(_movie_section()))

    def test_tmdb_guid_extracted(self, mock_http, clear_plex_cache):
        self._wire(mock_http, [
            _item("The Matrix", 1999, tmdb_id=603,
                  extra_guids=("imdb://tt0133093",)),
        ])
        items = asyncio.run(plex.get_library_items_with_tmdb())
        assert items == [{"title": "The Matrix", "year": 1999, "tmdb_id": 603}]

    def test_malformed_tmdb_guid_yields_none(self, mock_http, clear_plex_cache):
        self._wire(mock_http, [
            _item("Broken", extra_guids=("tmdb://not-a-number",)),
        ])
        items = asyncio.run(plex.get_library_items_with_tmdb())
        assert items[0]["tmdb_id"] is None

    def test_no_guids_at_all(self, mock_http, clear_plex_cache):
        self._wire(mock_http, [{"title": "Old Rip", "year": 1985}])
        items = asyncio.run(plex.get_library_items_with_tmdb())
        assert items == [{"title": "Old Rip", "year": 1985, "tmdb_id": None}]

    def test_second_call_served_from_cache(self, mock_http, clear_plex_cache):
        self._wire(mock_http, [_item("The Matrix", tmdb_id=603)])
        asyncio.run(plex.get_library_items_with_tmdb())
        first_count = len(mock_http.requests)
        again = asyncio.run(plex.get_library_items_with_tmdb())
        assert len(mock_http.requests) == first_count  # no new HTTP traffic
        assert again[0]["tmdb_id"] == 603

    def test_no_movie_section_caches_empty(self, mock_http, clear_plex_cache):
        mock_http.add("GET", "/library/sections", json=_sections())
        assert asyncio.run(plex.get_library_items_with_tmdb()) == []
        first_count = len(mock_http.requests)
        assert asyncio.run(plex.get_library_items_with_tmdb()) == []
        assert len(mock_http.requests) == first_count


# ─── get_library_index ──────────────────────────────────────────────────────

class TestLibraryIndex:
    def test_split_between_ids_and_fallback_titles(self, mock_http, clear_plex_cache):
        mock_http.add("GET", "/library/sections/1/all", json=_metadata([
            _item("The Matrix", tmdb_id=603),
            _item("Some Unmatched Home Video"),
        ]))
        mock_http.add("GET", "/library/sections", json=_sections(_movie_section()))
        index = asyncio.run(plex.get_library_index())
        assert index["tmdb_ids"] == {603}
        # normalized: article + punctuation/case stripped
        assert index["fallback_titles"] == {"someunmatchedhomevideo"}
        # crucially: the TMDb-matched title is NOT in the fallback set
        assert "matrix" not in index["fallback_titles"]


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
        assert plex.normalize_title(raw) == expected


# ─── TV episodes lookup ─────────────────────────────────────────────────────

class TestTvEpisodes:
    def _wire_show(self, mock_http, show_items):
        mock_http.add("GET", "/library/sections/2/all", json=_metadata(show_items))
        mock_http.add("GET", "/library/sections", json=_sections(_movie_section(), _tv_section()))

    def test_episode_tree_by_tmdb_id(self, mock_http, clear_plex_cache):
        self._wire_show(mock_http, [_item("Severance", 2022, tmdb_id=95396, rating_key="100")])
        mock_http.add("GET", "/library/metadata/100/children", json=_metadata([
            {"index": None, "ratingKey": "199", "title": "All episodes"},  # pseudo-season
            {"index": 1, "ratingKey": "101"},
        ]))
        mock_http.add("GET", "/library/metadata/101/children", json=_metadata([
            {"index": 2}, {"index": 1}, {"index": None}, {"index": 3},
        ]))
        result = asyncio.run(plex.get_tv_show_episodes("Severance", tmdb_id=95396))
        # pseudo-season skipped; episode indices sorted; index-less episode dropped
        assert result == {1: [1, 2, 3]}

    def test_title_fallback_with_plex_suffix_mismatch(self, mock_http, clear_plex_cache):
        # Plex title has a disambiguation suffix — normalized title differs,
        # so a title-only lookup finds nothing. Characterization: this is why
        # tmdb_id matching exists.
        self._wire_show(mock_http, [_item("Shameless (US)", 2011, rating_key="200")])
        result = asyncio.run(plex.get_tv_show_episodes("Shameless"))
        assert result == {}

    def test_title_fallback_normalized_match(self, mock_http, clear_plex_cache):
        self._wire_show(mock_http, [_item("The Bear", 2022, rating_key="300")])
        mock_http.add("GET", "/library/metadata/300/children", json=_metadata([
            {"index": 1, "ratingKey": "301"},
        ]))
        mock_http.add("GET", "/library/metadata/301/children", json=_metadata([
            {"index": 1},
        ]))
        result = asyncio.run(plex.get_tv_show_episodes("bear"))
        assert result == {1: [1]}

    def test_unknown_show_cached_as_empty(self, mock_http, clear_plex_cache):
        self._wire_show(mock_http, [])
        assert asyncio.run(plex.get_tv_show_episodes("Ghost Show")) == {}
        first_count = len(mock_http.requests)
        assert asyncio.run(plex.get_tv_show_episodes("Ghost Show")) == {}
        assert len(mock_http.requests) == first_count


# ─── Router-level in_library annotation ─────────────────────────────────────

class TestAnnotate:
    def _wire(self, mock_http, items):
        mock_http.add("GET", "/library/sections/1/all", json=_metadata(items))
        mock_http.add("GET", "/library/sections", json=_sections(_movie_section()))

    def test_tmdb_id_match_authoritative(self, mock_http, clear_plex_cache):
        self._wire(mock_http, [_item("The Matrix", tmdb_id=603)])
        movies = asyncio.run(_annotate([
            {"id": 603, "title": "The Matrix", "poster_path": "/m.jpg"},
            {"id": 604, "title": "The Matrix Reloaded", "poster_path": None},
        ]))
        assert movies[0]["in_library"] is True
        assert movies[1]["in_library"] is False
        assert movies[0]["poster_url"] == "https://image.tmdb.org/t/p/w500/m.jpg"
        assert movies[1]["poster_url"] is None

    def test_same_title_does_not_false_flag_via_fallback(self, mock_http, clear_plex_cache):
        # Library's "Heat" is TMDb-mapped (id 949, the 1995 film). The 1972
        # "Heat" (different id) shares the title but must NOT match — mapped
        # items are excluded from the fallback title set by design.
        self._wire(mock_http, [_item("Heat", 1995, tmdb_id=949)])
        movies = asyncio.run(_annotate([{"id": 28904, "title": "Heat"}]))
        assert movies[0]["in_library"] is False

    def test_fallback_title_match_for_unmapped_item(self, mock_http, clear_plex_cache):
        self._wire(mock_http, [_item("The Home Movie")])  # no tmdb guid
        movies = asyncio.run(_annotate([{"id": 1, "title": "Home Movie"}]))
        assert movies[0]["in_library"] is True
