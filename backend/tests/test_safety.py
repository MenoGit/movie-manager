"""Tests for the pre-download safety validation: services/safety.py pure
checks, and the guarded-add orchestration end-to-end against a mocked
qBittorrent (services/safe_download.py via the downloads router)."""

import asyncio

import pytest

from services import safety

GB = 1024 ** 3
MB = 1024 ** 2


# ─── File-list validation ───────────────────────────────────────────────────

class TestCheckFiles:
    def test_video_only_passes(self):
        v = safety.check_files(["Heat.1995.1080p/Heat.1995.1080p.mkv",
                                "Heat.1995.1080p/Heat.srt"])
        assert v["level"] == "ok"

    def test_exe_blocks(self):
        v = safety.check_files(["Heat.1995.1080p.mkv", "Codec-Setup.exe"])
        assert v["level"] == "block"
        assert "Codec-Setup.exe" in v["reasons"][0]

    @pytest.mark.parametrize("bad", [
        "run.scr", "install.bat", "x.cmd", "y.com", "setup.msi", "open.lnk",
        "s.vbs", "payload.js", "app.jar", "z.pif", "h.hta", "fix.reg", "disc.iso",
    ])
    def test_all_blocklisted_extensions(self, bad):
        assert safety.check_files([bad])["level"] == "block"

    def test_extension_case_insensitive(self):
        assert safety.check_files(["MOVIE.EXE"])["level"] == "block"
        assert safety.check_files(["Film.MKV"])["level"] == "ok"

    def test_archive_warns(self):
        v = safety.check_files(["Movie.2024/movie.rar", "movie.r00"])
        assert v["level"] == "warn"
        assert "archive" in v["reasons"][0]

    def test_exe_beats_archive(self):
        v = safety.check_files(["a.rar", "b.exe"])
        assert v["level"] == "block"

    def test_allowed_and_neutral_types_pass(self):
        v = safety.check_files([
            "m.mkv", "m.mp4", "m.avi", "s.srt", "s.ass", "s.idx", "s.sup",
            "info.nfo", "cover.jpg", "poster.png", "RARBG.txt", "check.sfv",
        ])
        assert v["level"] == "ok"

    def test_empty_list_ok(self):
        assert safety.check_files([])["level"] == "ok"


# ─── Release name + size sanity ─────────────────────────────────────────────

class TestCheckRelease:
    def test_password_in_name_blocks(self):
        v = safety.check_release("Movie.2024.1080p [PASSWORD in nfo]", 4 * GB)
        assert v["level"] == "block"
        assert "password" in v["reasons"][0].lower()

    def test_4k_movie_bounds(self):
        title = "Movie.2024.2160p.WEB-DL"
        assert safety.check_release(title, 20 * GB)["level"] == "ok"
        assert safety.check_release(title, 4 * GB)["level"] == "block"
        assert safety.check_release(title, 120 * GB)["level"] == "block"

    def test_1080p_movie_bounds(self):
        title = "Movie.2024.1080p.BluRay"
        assert safety.check_release(title, 8 * GB)["level"] == "ok"
        assert safety.check_release(title, 300 * MB)["level"] == "block"
        assert safety.check_release(title, 30 * GB)["level"] == "block"

    def test_720p_movie_bounds(self):
        title = "Movie.2024.720p.WEB"
        assert safety.check_release(title, 2 * GB)["level"] == "ok"
        assert safety.check_release(title, 200 * MB)["level"] == "block"
        assert safety.check_release(title, 10 * GB)["level"] == "block"

    def test_unknown_quality_skips_size_check(self):
        # 100MB "movie" with no resolution tag: suspicious but never blocked
        # on missing information (per spec).
        assert safety.check_release("Movie.2024.DVDRip", 100 * MB)["level"] == "ok"

    def test_tv_episode_bounds(self):
        title = "Show.S03E01.1080p.WEB"
        assert safety.check_release(title, 2 * GB, mode="tv")["level"] == "ok"
        assert safety.check_release(title, 20 * MB, mode="tv")["level"] == "block"
        assert safety.check_release(title, 20 * GB, mode="tv")["level"] == "block"

    def test_season_pack_multiplies_by_episode_count(self):
        title = "Show.S03.COMPLETE.1080p.WEB"
        ok = safety.check_release(title, 30 * GB, mode="tv", episode_count=10)
        assert ok["level"] == "ok"
        tiny = safety.check_release(title, 300 * MB, mode="tv", episode_count=10)
        assert tiny["level"] == "block"  # < 50MB * 10

    def test_season_pack_without_count_skips(self):
        v = safety.check_release("Show.S03.COMPLETE.1080p", 300 * MB, mode="tv")
        assert v["level"] == "ok"

    def test_no_size_no_title_ok(self):
        assert safety.check_release(None, None)["level"] == "ok"


class TestCombine:
    def test_block_beats_warn_beats_ok(self):
        block = {"level": "block", "reasons": ["b"]}
        warn = {"level": "warn", "reasons": ["w"]}
        ok = {"level": "ok", "reasons": []}
        assert safety.combine(ok, warn)["level"] == "warn"
        assert safety.combine(warn, block, ok)["level"] == "block"
        assert safety.combine(ok, ok)["level"] == "ok"

    def test_reasons_accumulate(self):
        v = safety.combine({"level": "warn", "reasons": ["a"]},
                           {"level": "block", "reasons": ["b"]})
        assert v["reasons"] == ["a", "b"]


# ─── Guarded add, end-to-end through the movies router ──────────────────────

MAGNET = "magnet:?xt=urn:btih:" + "a" * 40

def _wire_qbit_flow(mock_http, files):
    mock_http.add("POST", "/api/v2/auth/login", text="Ok.")
    mock_http.add("POST", "/api/v2/torrents/add", text="Ok.")
    mock_http.add("GET", "/api/v2/torrents/files", json=[{"name": n} for n in files])
    mock_http.add("POST", "/api/v2/torrents/removeTags", text="")
    mock_http.add("POST", "/api/v2/torrents/resume", text="")
    mock_http.add("POST", "/api/v2/torrents/delete", text="")


class TestGuardedAddFlow:
    def _req(self, **kw):
        from routers.downloads import AddTorrentRequest
        base = dict(magnet=MAGNET, movie_title="Heat",
                    release_title="Heat.1995.1080p.BluRay", size=8 * GB)
        base.update(kw)
        return AddTorrentRequest(**base)

    def test_clean_torrent_added_paused_then_resumed(self, mock_http):
        from routers.downloads import add_torrent
        _wire_qbit_flow(mock_http, ["Heat.1995.1080p/Heat.mkv", "Heat.srt"])
        result = asyncio.run(add_torrent(self._req()))

        assert result["status"] == "added"
        assert result["title"] == "Heat"
        add = mock_http.requests_to("/torrents/add")[0].content.decode()
        assert "paused=true" in add and "tags=safety-" in add
        assert len(mock_http.requests_to("/torrents/resume")) == 1
        assert mock_http.requests_to("/torrents/delete") == []

    def test_exe_in_files_blocked_and_deleted(self, mock_http):
        from routers.downloads import add_torrent
        _wire_qbit_flow(mock_http, ["Heat.mkv", "Codec.exe"])
        result = asyncio.run(add_torrent(self._req()))

        assert result["status"] == "blocked"
        assert "Codec.exe" in result["reason"]
        delete = mock_http.requests_to("/torrents/delete")[0].content.decode()
        assert "deleteFiles=true" in delete
        assert mock_http.requests_to("/torrents/resume") == []

    def test_archive_warns_and_deletes_without_force(self, mock_http):
        from routers.downloads import add_torrent
        _wire_qbit_flow(mock_http, ["Heat.rar"])
        result = asyncio.run(add_torrent(self._req()))

        assert result["status"] == "warned"
        assert "archive" in result["reason"]
        assert len(mock_http.requests_to("/torrents/delete")) == 1

    def test_force_overrides_archive_warn(self, mock_http):
        from routers.downloads import add_torrent
        _wire_qbit_flow(mock_http, ["Heat.rar"])
        result = asyncio.run(add_torrent(self._req(force=True)))

        assert result["status"] == "added"
        assert len(mock_http.requests_to("/torrents/resume")) == 1

    def test_size_precheck_blocks_before_qbit(self, mock_http):
        from routers.downloads import add_torrent
        result = asyncio.run(add_torrent(self._req(size=300 * MB)))

        assert result["status"] == "blocked"
        assert "implausibly small" in result["reason"]
        assert mock_http.requests == []  # qBit never contacted

    def test_force_cannot_override_block(self, mock_http):
        from routers.downloads import add_torrent
        result = asyncio.run(add_torrent(self._req(size=300 * MB, force=True)))
        assert result["status"] == "blocked"
        assert mock_http.requests == []

    def test_legacy_request_without_context_still_validates_files(self, mock_http):
        # Old-style payload (magnet + title only): pre-checks skip for lack
        # of data, but the paused file inspection still protects.
        from routers.downloads import add_torrent, AddTorrentRequest
        _wire_qbit_flow(mock_http, ["Movie.exe"])
        result = asyncio.run(add_torrent(
            AddTorrentRequest(magnet=MAGNET, movie_title="Heat")))
        assert result["status"] == "blocked"
