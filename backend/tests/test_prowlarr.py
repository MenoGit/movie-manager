"""Characterization tests for the pure functions in services/prowlarr.py:
_tag_by_year, _matches_episode, _format. No network — the async search
functions are not exercised."""

import pytest

from services.prowlarr import _format, _matches_episode, _tag_by_year


def _r(title, seeders=10):
    return {"title": title, "seeders": seeders}


# ─── _tag_by_year ───────────────────────────────────────────────────────────

class TestTagByYear:
    def test_three_buckets_oppenheimer(self):
        results = [
            _r("Oppenheimer.2023.1080p.BluRay", 50),
            _r("Oppenheimer.1080p.WEBRip", 80),          # no year in title
            _r("Inception.2010.1080p.BluRay", 999),      # different year
        ]
        tagged = _tag_by_year(results, 2023)
        by_title = {t["title"]: t["_match"] for t in tagged}
        assert by_title["Oppenheimer.2023.1080p.BluRay"] == "year_match"
        assert by_title["Oppenheimer.1080p.WEBRip"] == "no_year"
        assert by_title["Inception.2010.1080p.BluRay"] == "other_year"

    def test_sort_order_is_bucket_then_seeders(self):
        results = [
            _r("Other.2010.x264", 999),       # other_year, most seeders
            _r("Movie.no.year.a", 5),         # no_year
            _r("Movie.2023.low", 1),          # year_match, fewest seeders
            _r("Movie.2023.high", 70),        # year_match
            _r("Movie.no.year.b", 60),        # no_year
        ]
        tagged = _tag_by_year(results, 2023)
        assert [t["title"] for t in tagged] == [
            "Movie.2023.high", "Movie.2023.low",       # year matches first
            "Movie.no.year.b", "Movie.no.year.a",      # then unyear'd
            "Other.2010.x264",                         # other years last
        ]

    def test_matrix_franchise_disambiguation(self):
        # The motivating case: searching The Matrix (1999) must rank the
        # original above sequels carrying their own years.
        results = [
            _r("The.Matrix.Resurrections.2021.2160p", 500),
            _r("The.Matrix.1999.4K.Remaster", 40),
            _r("The.Matrix.Reloaded.2003.1080p", 300),
            _r("The.Matrix.Trilogy.Collection", 100),    # no year → benefit of doubt
        ]
        tagged = _tag_by_year(results, 1999)
        assert tagged[0]["title"] == "The.Matrix.1999.4K.Remaster"
        assert tagged[1]["title"] == "The.Matrix.Trilogy.Collection"
        assert {t["title"] for t in tagged[2:]} == {
            "The.Matrix.Resurrections.2021.2160p",
            "The.Matrix.Reloaded.2003.1080p",
        }

    def test_no_year_given_tags_everything_no_year(self):
        results = [_r("A.2023.x264", 5), _r("B.x264", 50)]
        tagged = _tag_by_year(results, None)
        assert all(t["_match"] == "no_year" for t in tagged)
        assert [t["title"] for t in tagged] == ["B.x264", "A.2023.x264"]  # seeders desc

    def test_string_year_accepted(self):
        tagged = _tag_by_year([_r("Movie.2023.x264")], "2023")
        assert tagged[0]["_match"] == "year_match"

    def test_resolution_tokens_are_not_years(self):
        # 1080/2160 must not register as 4-digit years
        tagged = _tag_by_year([_r("Movie.1080p.2160p.x264")], 2023)
        assert tagged[0]["_match"] == "no_year"

    def test_embedded_digits_need_word_boundaries(self):
        tagged = _tag_by_year([_r("Movie.x264-GRP2020")], 2023)
        assert tagged[0]["_match"] == "no_year"   # 2020 glued to GRP doesn't count

    def test_year_in_title_quirk(self):
        # Known limitation, locked in deliberately: a year-like number that is
        # part of the title ("Blade Runner 2049") reads as a different year.
        tagged = _tag_by_year([_r("Blade.Runner.2049.1080p")], 2017)
        assert tagged[0]["_match"] == "other_year"


# ─── _matches_episode ───────────────────────────────────────────────────────

class TestMatchesEpisode:
    # The fix this suite exists to protect: E1 must not match E10–E19.
    @pytest.mark.parametrize("title,expected", [
        ("Breaking.Bad.S02E01.720p.BluRay.x264", True),
        ("Breaking.Bad.S02E10.720p.BluRay.x264", False),
        ("Breaking.Bad.S02E11.720p.BluRay.x264", False),
        ("Breaking.Bad.S02E13.720p.BluRay.x264", False),
    ])
    def test_e1_does_not_match_e10_family(self, title, expected):
        assert _matches_episode(title, 2, 1) is expected

    @pytest.mark.parametrize("title,season,episode,expected", [
        ("Show.S01E05.1080p", 1, 5, True),
        ("Show.S01E50.1080p", 1, 5, False),       # symmetric: E5 ≠ E50
        ("Show.S1E5.x264", 1, 5, True),           # unpadded forms accepted
        ("Show.S01E5.x264", 1, 5, True),
        ("Show.S1E05.x264", 1, 5, True),
        ("show.s02e01.1080p", 2, 1, True),        # case-insensitive
        ("Show.3x01.720p", 3, 1, True),           # NxNN form
        ("Show.03x01.720p", 3, 1, True),
        ("Show.13x01.720p", 3, 1, False),         # 3x01 must not match inside 13x01
        ("Show.S10E05.1080p", 10, 5, True),
        ("Show.S02E01.1080p", 3, 1, False),       # wrong season
    ])
    def test_pattern_forms_and_boundaries(self, title, season, episode, expected):
        assert _matches_episode(title, season, episode) is expected

    def test_separator_before_resolution_does_not_break_match(self):
        # The case the normalization comment calls out: "S01E01 1080p" must not
        # collapse into S01E011080P and fail the trailing-digit guard.
        assert _matches_episode("Show S01E01 1080p WEB-DL", 1, 1) is True
        assert _matches_episode("Show.S01E01.1080p.WEB-DL", 1, 1) is True

    def test_multi_episode_range_matches_first_episode(self):
        # S02E01-E13 style ranges match a search for E01 (current behavior)
        assert _matches_episode("Show.S02E01-E13.Complete.1080p", 2, 1) is True

    def test_empty_and_none_titles(self):
        assert _matches_episode("", 1, 1) is False
        assert _matches_episode(None, 1, 1) is False

    def test_dot_separated_se_marker_matches(self):
        # Regression fix: "S03.E01" normalizes to "S03 E01"; the optional space
        # between season/episode tokens lets it match S03E01 again.
        assert _matches_episode("Show.S03.E01.1080p", 3, 1) is True
        assert _matches_episode("Show S03 E01 1080p", 3, 1) is True

    def test_dot_separated_does_not_loosen_episode_boundary(self):
        # The space allowance must not reopen the E1/E10 hole.
        assert _matches_episode("Show.S03.E10.1080p", 3, 1) is False
        assert _matches_episode("Show.S03.E01.1080p", 3, 10) is False


# ─── _format ────────────────────────────────────────────────────────────────

class TestFormat:
    def test_drops_zero_and_missing_seeders(self):
        out = _format([
            {"title": "ok", "seeders": 3},
            {"title": "dead", "seeders": 0},
            {"title": "absent"},
        ])
        assert [t["title"] for t in out] == ["ok"]

    def test_sorts_by_seeders_descending(self):
        out = _format([
            {"title": "low", "seeders": 1},
            {"title": "high", "seeders": 99},
            {"title": "mid", "seeders": 50},
        ])
        assert [t["title"] for t in out] == ["high", "mid", "low"]

    def test_field_mapping_and_magnet_fallback(self):
        out = _format([{
            "title": "T", "size": 123, "seeders": 5, "leechers": 2,
            "quality": "1080p", "indexer": "idx",
            "magnetUrl": None, "downloadUrl": "http://dl",
            "infoHash": "abc123",
        }])
        t = out[0]
        assert t["magnet"] == "http://dl"          # falls back when magnetUrl falsy
        assert t["info_hash"] == "abc123"
        assert set(t.keys()) == {
            "title", "size", "seeders", "leechers", "quality",
            "indexer", "magnet", "info_hash",
        }

    def test_magnet_url_preferred_over_download_url(self):
        out = _format([{"title": "T", "seeders": 1,
                        "magnetUrl": "magnet:?xt=x", "downloadUrl": "http://dl"}])
        assert out[0]["magnet"] == "magnet:?xt=x"

    def test_missing_optional_fields_become_none(self):
        out = _format([{"title": "T", "seeders": 1}])
        assert out[0]["magnet"] is None
        assert out[0]["size"] is None
