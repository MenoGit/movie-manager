"""Tests for services.omdb: the popcorn calibration curve, the OMDb parse
(fixtures mirror real API responses captured 2026-07), the 24h cache, and
the router-level score attachment. All HTTP mocked — no real network."""

import asyncio

import httpx
import pytest

from services import omdb


@pytest.fixture
def clear_omdb_cache():
    omdb._CACHE.clear()
    yield
    omdb._CACHE.clear()


# Real OMDb shapes (captured live): full Ratings, no-RT, and error-as-200.
HEAT = {
    "Title": "Heat",
    "imdbRating": "8.3",
    "Ratings": [
        {"Source": "Internet Movie Database", "Value": "8.3/10"},
        {"Source": "Rotten Tomatoes", "Value": "84%"},
        {"Source": "Metacritic", "Value": "76/100"},
    ],
    "Response": "True",
}
NO_RT = {
    "Title": "Carmencita",
    "imdbRating": "5.7",
    "Ratings": [{"Source": "Internet Movie Database", "Value": "5.7/10"}],
    "Response": "True",
}
BAD_ID = {"Response": "False", "Error": "Incorrect IMDb ID."}


# ─── Calibration curve ──────────────────────────────────────────────────────

class TestPopcornCurve:
    @pytest.mark.parametrize("avg,expected", [
        (4.0, 38),   # anchor: ~40
        (6.0, 70),   # anchor: 68-72
        (7.5, 87),   # anchor: 85-88
        (8.5, 93),   # anchor: 92-94
        (10.0, 97),  # never reaches 100
        (0.0, 4),
    ])
    def test_anchors(self, avg, expected):
        assert omdb.popcorn_pct(avg) == expected

    def test_monotonic(self):
        values = [omdb.popcorn_pct(i / 10) for i in range(0, 101)]
        assert values == sorted(values)

    def test_none_passthrough(self):
        assert omdb.popcorn_pct(None) is None


class TestBlend:
    def test_both_present_averages(self):
        assert omdb.blend(8.3, 7.9) == pytest.approx(8.1)

    def test_single_source_fallbacks(self):
        assert omdb.blend(8.3, None) == 8.3
        assert omdb.blend(None, 7.9) == 7.9

    def test_zero_treated_as_missing(self):
        # TMDb reports 0.0 for unrated titles — must not drag the blend down
        assert omdb.blend(8.0, 0.0) == 8.0

    def test_both_missing(self):
        assert omdb.blend(None, None) is None


# ─── Parsing ────────────────────────────────────────────────────────────────

class TestParsing:
    def test_rt_extracted(self):
        assert omdb._parse_rt(HEAT["Ratings"]) == 84

    def test_rt_absent(self):
        assert omdb._parse_rt(NO_RT["Ratings"]) is None

    def test_rt_malformed_value(self):
        assert omdb._parse_rt([{"Source": "Rotten Tomatoes", "Value": "N/A"}]) is None

    def test_imdb_rating(self):
        assert omdb._parse_imdb("8.3") == 8.3
        assert omdb._parse_imdb("N/A") is None
        assert omdb._parse_imdb(None) is None
        assert omdb._parse_imdb("0") is None  # zero = unrated


# ─── get_ratings (mocked HTTP + cache) ──────────────────────────────────────

class TestGetRatings:
    def test_happy_path_and_request_shape(self, mock_http, clear_omdb_cache):
        mock_http.add("GET", "omdbapi.com", json=HEAT)
        result = asyncio.run(omdb.get_ratings("tt0113277"))
        assert result == {"critic_pct": 84, "imdb_rating": 8.3}
        req = mock_http.requests[0]
        assert req.url.params["i"] == "tt0113277"
        assert req.url.params["apikey"] == "test-omdb-key"

    def test_no_rt_entry(self, mock_http, clear_omdb_cache):
        mock_http.add("GET", "omdbapi.com", json=NO_RT)
        result = asyncio.run(omdb.get_ratings("tt0000001"))
        assert result == {"critic_pct": None, "imdb_rating": 5.7}

    def test_error_response_yields_empty(self, mock_http, clear_omdb_cache):
        # OMDb reports errors as HTTP 200 with Response: "False"
        mock_http.add("GET", "omdbapi.com", json=BAD_ID)
        result = asyncio.run(omdb.get_ratings("tt9999999999"))
        assert result == {"critic_pct": None, "imdb_rating": None}

    def test_network_error_cached_no_hammering(self, mock_http, clear_omdb_cache):
        mock_http.add("GET", "omdbapi.com", exc=httpx.ConnectError("down"))
        assert asyncio.run(omdb.get_ratings("tt0113277")) == \
            {"critic_pct": None, "imdb_rating": None}
        first_count = len(mock_http.requests)
        asyncio.run(omdb.get_ratings("tt0113277"))
        assert len(mock_http.requests) == first_count  # served from cache

    def test_second_call_served_from_cache(self, mock_http, clear_omdb_cache):
        mock_http.add("GET", "omdbapi.com", json=HEAT)
        asyncio.run(omdb.get_ratings("tt0113277"))
        first_count = len(mock_http.requests)
        again = asyncio.run(omdb.get_ratings("tt0113277"))
        assert len(mock_http.requests) == first_count
        assert again["critic_pct"] == 84

    def test_no_imdb_id_no_request(self, mock_http, clear_omdb_cache):
        assert asyncio.run(omdb.get_ratings(None)) == \
            {"critic_pct": None, "imdb_rating": None}
        assert mock_http.requests == []

    def test_disabled_without_key(self, mock_http, clear_omdb_cache, monkeypatch):
        from config import settings
        monkeypatch.setattr(settings, "omdb_api_key", "")
        assert asyncio.run(omdb.get_ratings("tt0113277")) == \
            {"critic_pct": None, "imdb_rating": None}
        assert mock_http.requests == []


# ─── Router integration: movie detail carries both scores ──────────────────

class TestMovieDetailScores:
    def test_scores_attached(self, mock_http, clear_omdb_cache, clear_jellyfin_cache):
        from routers.movies import movie_detail
        mock_http.add("GET", "omdbapi.com", json=HEAT)
        mock_http.add("GET", "/movie/949", json={
            "id": 949, "title": "Heat", "imdb_id": "tt0113277",
            "vote_average": 7.9, "status": "Released",
            "release_date": "1995-12-15",
            "videos": {"results": []}, "credits": {},
            "watch/providers": {"results": {}},
            "release_dates": {"results": []},
        })
        mock_http.add("GET", "/Items", json={"Items": []})
        detail = asyncio.run(movie_detail(949))

        assert detail["critic_score"] == 84
        # blend(8.3, 7.9) = 8.1 → popcorn 91
        assert detail["audience_score"] == 91

    def test_missing_everything_hides_both(self, mock_http, clear_omdb_cache,
                                           clear_jellyfin_cache):
        from routers.movies import movie_detail
        mock_http.add("GET", "omdbapi.com", json=BAD_ID)
        mock_http.add("GET", "/movie/1", json={
            "id": 1, "title": "Obscurity", "imdb_id": "tt0000000",
            "vote_average": 0.0, "status": "Released",
            "release_date": "1970-01-01",
            "videos": {"results": []}, "credits": {},
            "watch/providers": {"results": {}},
            "release_dates": {"results": []},
        })
        mock_http.add("GET", "/Items", json={"Items": []})
        detail = asyncio.run(movie_detail(1))

        assert detail["critic_score"] is None
        assert detail["audience_score"] is None
