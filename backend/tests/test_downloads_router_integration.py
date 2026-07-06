"""Integration tests for the /downloads queue flow — the router logic that
sits on top of qbittorrent/plex/history: completed torrents are logged to
history, auto-deleted from qBit (keeping files), trigger a Plex refresh,
and are excluded from the queue response. HTTP is mocked end-to-end;
history writes go to a per-test tmp file via HISTORY_PATH monkeypatching."""

import asyncio
import json

import pytest

from routers import downloads
from services import history


@pytest.fixture
def tmp_history(tmp_path, monkeypatch):
    path = tmp_path / "history.json"
    monkeypatch.setattr(history, "HISTORY_PATH", str(path))
    return path


def _torrent(name, thash, progress, state="downloading", **extra):
    return {
        "name": name, "hash": thash, "progress": progress, "state": state,
        "size": 2_000_000_000, "downloaded": int(2_000_000_000 * progress),
        "dlspeed": 1_048_576, "eta": 3600, "num_seeds": 12, **extra,
    }


def _wire_qbit(mock_http, torrents):
    mock_http.add("POST", "/api/v2/auth/login", text="Ok.")
    mock_http.add("GET", "/api/v2/torrents/info", json=torrents)
    mock_http.add("POST", "/api/v2/torrents/delete", text="")


def _wire_plex_refresh(mock_http):
    mock_http.add("GET", "/library/sections/1/refresh", json={})
    mock_http.add("GET", "/library/sections", json={"MediaContainer": {"Directory": [
        {"key": "1", "type": "movie", "title": "Movies"}]}})


class TestQueueFlow:
    def test_in_progress_torrents_returned_with_shape(self, mock_http, tmp_history,
                                                      clear_plex_cache):
        _wire_qbit(mock_http, [_torrent("Movie.2024.1080p", "aaa", 0.4321)])
        queue = asyncio.run(downloads.get_queue())

        assert queue == [{
            "hash": "aaa", "name": "Movie.2024.1080p",
            "progress": 43.2,  # 0.4321 → 43.21 → rounded to 1 decimal
            "state": "downloading", "size": 2_000_000_000,
            "downloaded": int(2_000_000_000 * 0.4321),
            "speed": 1_048_576, "eta": 3600, "seeds": 12,
        }]
        # nothing deleted, no history, no plex refresh
        assert mock_http.requests_to("/torrents/delete") == []
        assert mock_http.requests_to("/refresh") == []
        assert not tmp_history.exists()

    def test_completed_torrent_logged_deleted_and_excluded(self, mock_http,
                                                           tmp_history,
                                                           clear_plex_cache):
        _wire_plex_refresh(mock_http)
        _wire_qbit(mock_http, [
            _torrent("Done.Movie.2160p", "done1", 1.0, state="stalledUP"),
            _torrent("Still.Going", "going1", 0.5),
        ])
        queue = asyncio.run(downloads.get_queue())

        # completed torrent excluded from response
        assert [t["hash"] for t in queue] == ["going1"]

        # history entry written
        entries = json.loads(tmp_history.read_text())
        assert len(entries) == 1
        assert entries[0]["type"] == "movie"
        assert entries[0]["name"] == "Done.Movie.2160p"
        assert entries[0]["hash"] == "done1"
        assert "timestamp" in entries[0]

        # deleted from qBit keeping files
        delete = mock_http.requests_to("/torrents/delete")[0]
        body = delete.content.decode()
        assert "hashes=done1" in body and "deleteFiles=false" in body

        # plex refresh triggered exactly once
        assert len(mock_http.requests_to("/sections/1/refresh")) == 1

    def test_uploading_state_counts_as_completed(self, mock_http, tmp_history,
                                                 clear_plex_cache):
        # state == "uploading" completes even if progress reads < 1.0
        _wire_plex_refresh(mock_http)
        _wire_qbit(mock_http, [_torrent("Seeding.Now", "up1", 0.999, state="uploading")])
        queue = asyncio.run(downloads.get_queue())
        assert queue == []
        assert len(mock_http.requests_to("/torrents/delete")) == 1

    def test_plex_refresh_failure_swallowed(self, mock_http, tmp_history,
                                            clear_plex_cache):
        # Plex being down must not break the queue response or the auto-delete
        import httpx
        mock_http.add("GET", "/library/sections", exc=httpx.ConnectError("plex down"))
        _wire_qbit(mock_http, [_torrent("Done", "d1", 1.0)])
        queue = asyncio.run(downloads.get_queue())
        assert queue == []
        assert len(mock_http.requests_to("/torrents/delete")) == 1
        assert json.loads(tmp_history.read_text())[0]["name"] == "Done"

    def test_empty_queue(self, mock_http, tmp_history, clear_plex_cache):
        _wire_qbit(mock_http, [])
        assert asyncio.run(downloads.get_queue()) == []


class TestOtherEndpoints:
    def test_add_endpoint_delegates(self, mock_http):
        mock_http.add("POST", "/api/v2/auth/login", text="Ok.")
        mock_http.add("POST", "/api/v2/torrents/add", text="Ok.")
        result = asyncio.run(downloads.add_torrent(
            downloads.AddTorrentRequest(magnet="magnet:?x", movie_title="Heat")))
        assert result["title"] == "Heat"
        assert result["save_path"].endswith("/Heat")

    def test_storage_transforms_maindata(self, mock_http):
        mock_http.add("POST", "/api/v2/auth/login", text="Ok.")
        mock_http.add("GET", "/api/v2/sync/maindata", json={"server_state": {
            "free_space_on_disk": 123, "dl_info_speed": 456, "up_info_speed": 789,
            "irrelevant": "dropped"}})
        result = asyncio.run(downloads.storage_info())
        assert result == {"free_space": 123, "dl_speed": 456, "up_speed": 789}

    def test_history_roundtrip_newest_first(self, tmp_history):
        asyncio.run(history.append({"type": "movie", "name": "First"}))
        asyncio.run(history.append({"type": "movie", "name": "Second"}))
        entries = asyncio.run(downloads.get_history())
        assert [e["name"] for e in entries] == ["Second", "First"]

    def test_clear_history(self, tmp_history):
        asyncio.run(history.append({"type": "movie", "name": "X"}))
        result = asyncio.run(downloads.clear_history())
        assert result == {"status": "cleared"}
        assert asyncio.run(downloads.get_history()) == []
