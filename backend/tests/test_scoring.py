"""Characterization tests for backend/services/scoring.py — pure logic only.

These lock in current (hand-verified) behavior so future edits that change
outputs fail loudly. Where a case looks surprising, it's documented as a
known quirk rather than asserted away.
"""

import pytest

from services.scoring import (
    GB,
    EP_BRACKETS,
    MOVIE_TIERS,
    _size_fit_bonus,
    _speed_score,
    _tier_for,
    _tiers_for_torrent,
    is_season_pack,
    parse_release,
    runtime_bucket,
    score_torrent,
)


# ─── parse_release ──────────────────────────────────────────────────────────

class TestParseResolution:
    @pytest.mark.parametrize("title,expected", [
        ("Movie.2160p.WEB-DL", "4K"),
        ("Movie 4K HDR", "4K"),
        ("Movie.UHD.BluRay", "4K"),
        ("Movie.1080p.WEB-DL", "1080p"),
        ("Movie.720p.HDTV", "720p"),
        ("Movie.480p.DVDRip", "480p"),
        ("Movie.with.no.res.marker", "other"),
        # "4K" needs word boundaries: embedded in a token it doesn't count
        ("Movie.X264K.fake", "other"),
    ])
    def test_resolution(self, title, expected):
        assert parse_release(title)["resolution"] == expected


class TestParseSource:
    @pytest.mark.parametrize("title,expected", [
        ("Movie.2024.HDCAM.x264", "CAM"),
        ("Movie.2024.CAMRip", "CAM"),
        ("Movie.CAM.x264", "CAM"),
        ("Movie.TELESYNC.XviD", "TS"),
        ("Movie.HDTS.720p", "TS"),
        ("Movie.TS.x264", "TS"),
        ("Movie.BluRay.1080p", "BluRay"),
        ("Movie.Blu-Ray.1080p", "BluRay"),
        ("Movie.BDRip.x264", "BluRay"),
        ("Movie.BRRip.x264", "BluRay"),
        ("Movie.REMUX.2160p", "BluRay"),      # remux implies BluRay source
        ("Movie.WEB-DL.1080p", "WEB-DL"),
        ("Movie.WEBDL.1080p", "WEB-DL"),
        ("Movie.WEB.DL.1080p", "WEB-DL"),
        ("Movie.WEBRip.1080p", "WEBRip"),
        ("Movie.WEB-Rip.1080p", "WEBRip"),
        ("Show.HDTV.720p", "HDTV"),
        ("Show.PDTV.x264", "HDTV"),
        ("Movie.1080p.x264", "Unknown"),
        # Known quirk: DVDRip matches none of the source patterns
        ("Movie.2024.DVDRip.x264", "Unknown"),
    ])
    def test_source(self, title, expected):
        assert parse_release(title)["source"] == expected

    def test_remux_flag(self):
        assert parse_release("Movie.REMUX.2160p")["is_remux"] is True
        assert parse_release("Movie.BluRay.2160p")["is_remux"] is False


class TestParseAudio:
    @pytest.mark.parametrize("title,expected", [
        ("Movie.Atmos.TrueHD", "Atmos"),           # Atmos wins over TrueHD
        ("Movie.TrueHD.7.1", "DTS-HD/TrueHD"),
        ("Movie.DTS-HD.MA.5.1", "DTS-HD/TrueHD"),
        ("Movie.DDP5.1.WEB-DL", "DDP5.1"),
        ("Movie.DD+.5.1", "DDP5.1"),
        ("Movie.EAC3.WEB", "DDP5.1"),
        ("Movie.DTS.x264", "DTS"),
        ("Movie.AAC5.1.x264", "AAC5.1"),
        ("Movie.AAC.x264", "AAC"),
        ("Movie.1080p.x264", "Stereo"),            # default
    ])
    def test_audio(self, title, expected):
        assert parse_release(title)["audio"] == expected


class TestParseHDR:
    @pytest.mark.parametrize("title,expected", [
        ("Movie.DV.2160p", "DV"),
        ("Movie.DoVi.2160p", "DV"),
        ("Movie.Dolby.Vision.2160p", "DV"),
        ("Movie.HDR10+.2160p", "HDR10+"),
        ("Movie.HDR10PLUS.2160p", "HDR10+"),
        ("Movie.HDR10.2160p", "HDR10"),
        ("Movie.HDR.2160p", "HDR10"),
        ("Movie.2160p.SDR", "SDR"),
        ("Movie.1080p", "SDR"),                    # default
        # DV needs word boundaries — DVDRip must not read as Dolby Vision
        ("Movie.DVDRip.x264", "SDR"),
    ])
    def test_hdr(self, title, expected):
        assert parse_release(title)["hdr"] == expected


class TestParseCodec:
    @pytest.mark.parametrize("title,expected", [
        ("Movie.AV1.2160p", "AV1"),
        ("Movie.x265.1080p", "x265"),
        ("Movie.HEVC.1080p", "x265"),
        ("Movie.H.265.1080p", "x265"),
        ("Movie.x264.1080p", "x264"),
        ("Movie.H.264.1080p", "x264"),
        ("Movie.XviD.DVDRip", "MPEG"),
        ("Movie.DivX", "MPEG"),
        ("Movie.MPEG-2", "MPEG"),
        ("Movie.1080p.BluRay", "unknown"),         # default
    ])
    def test_codec(self, title, expected):
        assert parse_release(title)["codec"] == expected


class TestParseYTSAndEdges:
    def test_yts_variants(self):
        assert parse_release("Movie.1080p.YTS.MX")["is_yts"] is True
        assert parse_release("Movie.1080p.YTS.AG")["is_yts"] is True
        assert parse_release("Movie.1080p.YTS")["is_yts"] is True
        assert parse_release("Movie.1080p.RARBG")["is_yts"] is False

    def test_empty_and_none(self):
        for empty in ("", None):
            p = parse_release(empty)
            assert p == {
                "resolution": "other", "source": "Unknown", "audio": "Stereo",
                "hdr": "SDR", "codec": "unknown", "is_remux": False, "is_yts": False,
            }


# ─── is_season_pack / runtime_bucket ────────────────────────────────────────

class TestSeasonPack:
    @pytest.mark.parametrize("title,expected", [
        ("Show.S02E01.1080p", False),              # explicit episode marker
        ("Show.3x01.720p", False),
        ("Show.S02.1080p.WEB-DL", True),           # bare season marker
        ("Show.Season.Pack.1080p", True),
        ("Show.COMPLETE.1080p", True),
        ("Anime.Batch.1080p", True),
        ("Show.Collection.x265", True),
        ("Show.Full Season.720p", True),
        ("Just.A.Movie.2024.1080p", False),
        ("", False),
        (None, False),
    ])
    def test_pack_detection(self, title, expected):
        assert is_season_pack(title) is expected

    def test_episode_marker_beats_complete(self):
        # An S##E## marker forces "not a pack" even when COMPLETE appears
        assert is_season_pack("Show.S01E01.COMPLETE.repack") is False


class TestRuntimeBucket:
    @pytest.mark.parametrize("minutes,expected", [
        (20, "short"), (29, "short"),
        (30, "standard"), (45, "standard"),
        (46, "long"), (75, "long"),
        (76, "extraLong"), (120, "extraLong"),
    ])
    def test_buckets(self, minutes, expected):
        assert runtime_bucket(minutes) == expected


# ─── speed score curve ──────────────────────────────────────────────────────

class TestSpeedScore:
    def test_zero_and_negative_seeds(self):
        assert _speed_score(0, 10) == 0
        assert _speed_score(-1, 0) == 0

    def test_curve_points(self):
        assert _speed_score(1, 0) == pytest.approx(3.3)          # log2(2)*3.3
        assert _speed_score(3, 0) == pytest.approx(6.6)          # log2(4)*3.3
        assert _speed_score(7, 0) == pytest.approx(9.9)          # log2(8)*3.3

    def test_saturates_at_18(self):
        assert _speed_score(43, 0) == 18                         # cap reached
        assert _speed_score(100, 0) == 18
        assert _speed_score(10_000, 0) == 18

    def test_ratio_bonus_requires_ratio_above_2(self):
        base_50 = min(__import__("math").log2(51) * 3.3, 18)
        assert _speed_score(50, 10) == pytest.approx(base_50 + 2)   # 5.0 > 2
        assert _speed_score(50, 25) == pytest.approx(base_50)       # exactly 2 → no bonus
        assert _speed_score(50, 30) == pytest.approx(base_50)       # < 2 → no bonus

    def test_no_ratio_bonus_when_zero_peers(self):
        # peers == 0 short-circuits the bonus even though ratio is "infinite"
        assert _speed_score(100, 0) == 18


# ─── tier / size-fit logic ──────────────────────────────────────────────────

class TestMovieTierBoundaries:
    @pytest.mark.parametrize("size_gb,expected", [
        (0.69, None),
        (0.7, "budget"), (3.99, "budget"),
        (4.0, "value"), (11.99, "value"),
        (12.0, "quality"),                 # 12 is in both brackets; quality wins
        (25.0, "quality"),
        (25.01, None),                     # hard cap excludes big remuxes
        (55.0, None),
    ])
    def test_tier_for(self, size_gb, expected):
        assert _tier_for(size_gb, MOVIE_TIERS) == expected


class TestTVTiers:
    def test_tv_quality_has_no_hard_cap(self):
        # TV brackets only define maxIdeal — anything >= quality.min lands in
        # quality tier (oversize is punished via the size-fit bonus instead).
        tiers = EP_BRACKETS["standard"]
        assert _tier_for(100.0, tiers) == "quality"
        assert _tier_for(2.5, tiers) == "quality"
        assert _tier_for(1.0, tiers) == "value"     # value: 0.8–2.5
        assert _tier_for(0.5, tiers) == "budget"    # budget: 0.12–0.8
        assert _tier_for(0.05, tiers) is None

    def test_season_search_multiplies_brackets_for_all_torrents(self):
        ctx = {"mode": "tv", "runtime_min": 45, "episode_count": 10,
               "is_season_search": True}
        tiers = _tiers_for_torrent({"title": "Show.S01E02.1080p"}, ctx)  # not a pack
        assert tiers["quality"]["min"] == 25      # 2.5 × 10
        assert tiers["value"]["max"] == 25        # 2.5 × 10

    def test_pack_title_multiplies_even_outside_season_search(self):
        ctx = {"mode": "tv", "runtime_min": 45, "episode_count": 13}
        tiers = _tiers_for_torrent({"title": "Show.S01.COMPLETE.1080p"}, ctx)
        assert tiers["quality"]["min"] == pytest.approx(2.5 * 13)

    def test_episode_title_uses_base_bracket(self):
        ctx = {"mode": "tv", "runtime_min": 45, "episode_count": 13}
        tiers = _tiers_for_torrent({"title": "Show.S01E02.1080p"}, ctx)
        assert tiers == EP_BRACKETS["standard"]


class TestSizeFitBonus:
    def test_center_of_bracket_gets_plus_two(self):
        # movie quality bracket 12–25: center is 18.5
        assert _size_fit_bonus(18.5, MOVIE_TIERS, "quality") == pytest.approx(2.0)

    def test_edges_get_zero(self):
        assert _size_fit_bonus(12.0, MOVIE_TIERS, "quality") == pytest.approx(0.0)
        assert _size_fit_bonus(25.0, MOVIE_TIERS, "quality") == pytest.approx(0.0)

    def test_outside_bracket_gets_minus_four(self):
        assert _size_fit_bonus(26.0, MOVIE_TIERS, "quality") == -4
        assert _size_fit_bonus(11.0, MOVIE_TIERS, "quality") == -4

    def test_tv_uses_max_ideal_as_soft_ceiling(self):
        # standard quality: min 2.5, maxIdeal 8 → 10 GB episode is oversize
        assert _size_fit_bonus(10.0, EP_BRACKETS["standard"], "quality") == -4


# ─── score_torrent end-to-end + eligibility ─────────────────────────────────

def _t(title, size_gb, seeds, peers):
    return {"title": title, "size": int(size_gb * GB), "seeders": seeds, "leechers": peers}


class TestScoreTorrent:
    def test_high_seed_1080p_webdl(self):
        # weights: 1080p(8) + WEB-DL(9) + DDP5.1(8) + SDR(4) + x264(5) = 34
        # speed: saturated 18 + ratio bonus 2 = 20; size 8 GB = value center +2
        r = score_torrent(_t("The.Matrix.1999.1080p.WEB-DL.DDP5.1.H.264", 8.0, 120, 10),
                          {"mode": "movie"})
        assert r["score"] == 56.0
        assert r["tier"] == "value"
        assert r["eligible"] is True

    def test_cam_is_never_eligible(self):
        r = score_torrent(_t("New.Release.2026.HDCAM.x264.AAC", 2.0, 500, 5),
                          {"mode": "movie"})
        assert r["eligible"] is False

    def test_ts_is_never_eligible(self):
        r = score_torrent(_t("New.Release.2026.TS.x264", 2.0, 500, 5),
                          {"mode": "movie"})
        assert r["eligible"] is False

    def test_under_three_seeds_not_eligible(self):
        r = score_torrent(_t("Movie.1080p.WEB-DL", 8.0, 2, 0), {"mode": "movie"})
        assert r["eligible"] is False
        r = score_torrent(_t("Movie.1080p.WEB-DL", 8.0, 3, 0), {"mode": "movie"})
        assert r["eligible"] is True

    def test_oversize_remux_gets_no_tier_and_no_size_bonus(self):
        r = score_torrent(_t("Movie.2160p.REMUX.Atmos.DV", 55.0, 40, 8), {"mode": "movie"})
        assert r["tier"] is None
        # weights 10+10+10+6+3 (unknown codec) = 39; speed log2(41)*3.3 ≈ 17.68
        # (40 seeds is below the 43-seed saturation point) + 2 ratio bonus;
        # no size term because tier is None → 58.7
        assert r["score"] == 58.7

    def test_yts_bonus_applied(self):
        base = score_torrent(_t("Movie.2023.1080p.BluRay.x264", 2.1, 80, 30), {"mode": "movie"})
        yts = score_torrent(_t("Movie.2023.1080p.BluRay.x264.YTS.MX", 2.1, 80, 30), {"mode": "movie"})
        assert yts["score"] == pytest.approx(base["score"] + 1, abs=0.051)  # rounding step is 0.1

    def test_missing_fields_default_to_zero(self):
        r = score_torrent({"title": "Movie.1080p"}, {"mode": "movie"})
        assert r["size_gb"] == 0
        assert r["seeds"] == 0
        assert r["tier"] is None
        assert r["eligible"] is False

    def test_score_is_rounded_to_one_decimal(self):
        r = score_torrent(_t("Movie.1080p.WEB-DL", 5.0, 10, 20), {"mode": "movie"})
        assert r["score"] == round(r["score"], 1)
