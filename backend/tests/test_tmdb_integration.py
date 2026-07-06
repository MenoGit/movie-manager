"""Integration tests for services.tmdb detail fetch + the pure helpers it
feeds. get_movie_detail runs against a mocked TMDb API; the theatrical-only
heuristic is tested directly with dates computed relative to today (the
heuristic compares against date.today(), so fixtures must be relative)."""

import asyncio
from datetime import date, timedelta

import httpx
import pytest

from services import tmdb

TODAY = date.today()


def _detail_payload(**overrides):
    base = {
        "id": 603,
        "title": "The Matrix",
        "status": "Released",
        "release_date": (TODAY - timedelta(days=400)).isoformat(),
        "videos": {"results": []},
        "credits": {"cast": [], "crew": []},
        "watch/providers": {"results": {}},
        "release_dates": {"results": []},
    }
    base.update(overrides)
    return base


def _digital_release(region="US", rtype=4, when=None):
    when = when if when is not None else TODAY - timedelta(days=30)
    return {"iso_3166_1": region,
            "release_dates": [{"type": rtype, "release_date": f"{when.isoformat()}T00:00:00.000Z"}]}


# ─── get_movie_detail (mocked HTTP) ─────────────────────────────────────────

class TestGetMovieDetail:
    def test_request_shape(self, mock_http):
        mock_http.add("GET", "/movie/603", json=_detail_payload())
        asyncio.run(tmdb.get_movie_detail(603))

        req = mock_http.requests[0]
        assert req.url.host == "api.themoviedb.org"
        assert req.url.params["api_key"] == "test-tmdb-key"
        assert req.url.params["append_to_response"] == \
            "videos,credits,watch/providers,release_dates"

    def test_streaming_services_from_us_flatrate(self, mock_http):
        payload = _detail_payload()
        payload["watch/providers"] = {"results": {"US": {
            "flatrate": [{"provider_name": "Max"}],
            "rent": [{"provider_name": "Amazon"}],
        }}}
        mock_http.add("GET", "/movie/603", json=payload)
        data = asyncio.run(tmdb.get_movie_detail(603))
        # flatrate only — rent/buy don't count as "streaming on"
        assert data["streaming_services"] == [{"provider_name": "Max"}]

    def test_streaming_services_empty_when_no_us_data(self, mock_http):
        mock_http.add("GET", "/movie/603", json=_detail_payload())
        data = asyncio.run(tmdb.get_movie_detail(603))
        assert data["streaming_services"] == []

    def test_trailer_picks_first_youtube_trailer(self, mock_http):
        payload = _detail_payload()
        payload["videos"] = {"results": [
            {"type": "Teaser", "site": "YouTube", "key": "teaser"},
            {"type": "Trailer", "site": "Vimeo", "key": "vimeo"},
            {"type": "Trailer", "site": "YouTube", "key": "yt1"},
            {"type": "Trailer", "site": "YouTube", "key": "yt2"},
        ]}
        mock_http.add("GET", "/movie/603", json=payload)
        data = asyncio.run(tmdb.get_movie_detail(603))
        assert data["trailer"]["key"] == "yt1"

    def test_trailer_none_when_no_match(self, mock_http):
        payload = _detail_payload()
        payload["videos"] = {"results": [{"type": "Teaser", "site": "YouTube", "key": "t"}]}
        mock_http.add("GET", "/movie/603", json=payload)
        data = asyncio.run(tmdb.get_movie_detail(603))
        assert data["trailer"] is None

    def test_theatrical_only_flag_wired_in(self, mock_http):
        # Recent release, no digital anywhere → flagged (Rule A end-to-end)
        payload = _detail_payload(
            release_date=(TODAY - timedelta(days=20)).isoformat())
        mock_http.add("GET", "/movie/603", json=payload)
        data = asyncio.run(tmdb.get_movie_detail(603))
        assert data["theatrical_only"] is True

    def test_http_error_propagates(self, mock_http):
        mock_http.add("GET", "/movie/603", json={}, status=404)
        with pytest.raises(httpx.HTTPStatusError):
            asyncio.run(tmdb.get_movie_detail(603))


# ─── _detect_theatrical_only (pure, date-relative) ──────────────────────────

class TestDetectTheatricalOnly:
    def test_rule_a_recent_no_digital(self):
        data = _detail_payload(release_date=(TODAY - timedelta(days=30)).isoformat())
        assert tmdb._detect_theatrical_only(data) is True

    def test_recent_with_us_digital_passes(self):
        data = _detail_payload(release_date=(TODAY - timedelta(days=30)).isoformat())
        data["release_dates"] = {"results": [_digital_release("US", 4, TODAY - timedelta(days=2))]}
        assert tmdb._detect_theatrical_only(data) is False

    def test_recent_with_gb_digital_passes(self):
        # Fallback regions count — a GB digital release clears the flag
        data = _detail_payload(release_date=(TODAY - timedelta(days=30)).isoformat())
        data["release_dates"] = {"results": [_digital_release("GB", 5, TODAY - timedelta(days=2))]}
        assert tmdb._detect_theatrical_only(data) is False

    def test_future_digital_release_does_not_count(self):
        data = _detail_payload(release_date=(TODAY - timedelta(days=30)).isoformat())
        data["release_dates"] = {"results": [_digital_release("US", 4, TODAY + timedelta(days=14))]}
        assert tmdb._detect_theatrical_only(data) is True

    def test_theatrical_type3_does_not_count_as_digital(self):
        data = _detail_payload(release_date=(TODAY - timedelta(days=30)).isoformat())
        data["release_dates"] = {"results": [_digital_release("US", 3, TODAY - timedelta(days=20))]}
        assert tmdb._detect_theatrical_only(data) is True

    def test_old_release_with_streaming_passes(self):
        data = _detail_payload()  # 400 days old
        data["watch/providers"] = {"results": {"US": {"flatrate": [{"provider_name": "Max"}]}}}
        assert tmdb._detect_theatrical_only(data) is False

    def test_rule_c_old_release_no_streaming_no_digital(self):
        # >90 days old so Rule A can't fire; Released + nothing anywhere → flag
        data = _detail_payload()
        assert tmdb._detect_theatrical_only(data) is True

    def test_old_release_with_digital_but_no_streaming_passes(self):
        data = _detail_payload()
        data["release_dates"] = {"results": [_digital_release("US", 4)]}
        assert tmdb._detect_theatrical_only(data) is False

    def test_unreleased_status_old_date_no_flag_without_rule_c(self):
        # status != Released and not recent → no rule fires
        data = _detail_payload(status="Post Production",
                               release_date=(TODAY + timedelta(days=200)).isoformat())
        assert tmdb._detect_theatrical_only(data) is False


# ─── _has_occurred_digital_release (pure) ───────────────────────────────────

class TestHasOccurredDigitalRelease:
    def test_past_types_collected(self):
        entries = [
            {"type": 4, "release_date": f"{(TODAY - timedelta(days=1)).isoformat()}T00:00:00Z"},
            {"type": 6, "release_date": f"{(TODAY - timedelta(days=5)).isoformat()}T00:00:00Z"},
            {"type": 3, "release_date": f"{(TODAY - timedelta(days=90)).isoformat()}T00:00:00Z"},
        ]
        assert tmdb._has_occurred_digital_release(entries, TODAY) == {4, 6}

    def test_today_is_not_yet_occurred(self):
        # strictly-before comparison: releasing today doesn't count
        entries = [{"type": 4, "release_date": f"{TODAY.isoformat()}T00:00:00Z"}]
        assert tmdb._has_occurred_digital_release(entries, TODAY) == set()

    def test_missing_date_counts_conservatively(self):
        assert tmdb._has_occurred_digital_release([{"type": 5}], TODAY) == {5}

    def test_malformed_date_counts_conservatively(self):
        entries = [{"type": 4, "release_date": "not-a-date"}]
        assert tmdb._has_occurred_digital_release(entries, TODAY) == {4}


# ─── _apply_filters (pure) ──────────────────────────────────────────────────

class TestApplyFilters:
    def test_min_rating(self):
        out = tmdb._apply_filters({"sort_by": "popularity.desc"}, min_rating=7.0)
        assert out["vote_average.gte"] == 7.0

    def test_min_rating_zero_ignored(self):
        out = tmdb._apply_filters({}, min_rating=0)
        assert "vote_average.gte" not in out

    def test_year_range_intersects_tighter_wins(self):
        base = {"primary_release_date.gte": "1990-01-01",
                "primary_release_date.lte": "1999-12-31"}
        out = tmdb._apply_filters(base, year_from=1985, year_to=1995)
        assert out["primary_release_date.gte"] == "1990-01-01"  # base tighter
        assert out["primary_release_date.lte"] == "1995-12-31"  # filter tighter

    def test_sort_by_overrides_base(self):
        out = tmdb._apply_filters({"sort_by": "popularity.desc"},
                                  sort_by="vote_average.desc")
        assert out["sort_by"] == "vote_average.desc"

    def test_include_adult_only_when_true(self):
        assert "include_adult" not in tmdb._apply_filters({}, include_adult=False)
        assert tmdb._apply_filters({}, include_adult=True)["include_adult"] == "true"

    def test_base_not_mutated(self):
        base = {"sort_by": "popularity.desc"}
        tmdb._apply_filters(base, min_rating=8)
        assert base == {"sort_by": "popularity.desc"}


# ─── search + poster helpers ────────────────────────────────────────────────

class TestSearchAndHelpers:
    def test_search_movies(self, mock_http):
        mock_http.add("GET", "/search/movie", json={"results": [{"id": 1, "title": "Heat"}]})
        results = asyncio.run(tmdb.search_movies("heat"))
        assert results == [{"id": 1, "title": "Heat"}]
        assert mock_http.requests[0].url.params["query"] == "heat"

    def test_poster_url(self):
        assert tmdb.poster_url("/abc.jpg") == "https://image.tmdb.org/t/p/w500/abc.jpg"
        assert tmdb.poster_url(None) is None
        assert tmdb.poster_url("") is None
