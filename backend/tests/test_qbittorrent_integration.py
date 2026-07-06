"""Integration tests for services.qbittorrent against a mocked qBittorrent
WebUI API. Covers login handling (success + each failure mode), the add
flows (save-path construction, category, URL rewriting), and the queue
read/delete calls. No real network."""

import asyncio
from urllib.parse import parse_qs

import httpx
import pytest
from fastapi import HTTPException

from config import settings
from services import qbittorrent


def _form(request: httpx.Request) -> dict:
    """Decode an application/x-www-form-urlencoded body to {key: value}."""
    parsed = parse_qs(request.content.decode(), keep_blank_values=True)
    return {k: v[0] for k, v in parsed.items()}


def _login_ok(mock_http):
    mock_http.add("POST", "/api/v2/auth/login", text="Ok.")


# ─── _rewrite_for_host (pure) ───────────────────────────────────────────────

class TestRewriteForHost:
    def test_magnet_untouched(self):
        m = "magnet:?xt=urn:btih:abc"
        assert qbittorrent._rewrite_for_host(m) == m

    def test_empty_untouched(self):
        assert qbittorrent._rewrite_for_host("") == ""

    def test_prowlarr_host_rewritten_to_localhost(self):
        url = "http://prowlarr.test:9696/1/download?apikey=k&file=x"
        assert qbittorrent._rewrite_for_host(url) == \
            "http://localhost:9696/1/download?apikey=k&file=x"

    def test_other_host_untouched(self):
        url = "https://indexer.example.com/download/1"
        assert qbittorrent._rewrite_for_host(url) == url


# ─── Login handling ─────────────────────────────────────────────────────────

class TestLogin:
    def test_credentials_sent(self, mock_http):
        _login_ok(mock_http)
        mock_http.add("GET", "/api/v2/torrents/info", json=[])
        asyncio.run(qbittorrent.get_torrents())

        login = mock_http.requests_to("/auth/login")[0]
        assert _form(login) == {"username": "test-user", "password": "test-pass"}

    def test_403_raises_502(self, mock_http):
        mock_http.add("POST", "/api/v2/auth/login", text="Forbidden", status=403)
        with pytest.raises(HTTPException) as exc:
            asyncio.run(qbittorrent.get_torrents())
        assert exc.value.status_code == 502
        assert "rejected login" in exc.value.detail

    def test_fails_body_raises_502(self, mock_http):
        # qBit returns 200 "Fails." on bad credentials
        mock_http.add("POST", "/api/v2/auth/login", text="Fails.")
        with pytest.raises(HTTPException) as exc:
            asyncio.run(qbittorrent.get_torrents())
        assert exc.value.status_code == 502
        assert "QBIT_USERNAME" in exc.value.detail

    def test_unreachable_raises_502(self, mock_http):
        mock_http.add("POST", "/api/v2/auth/login",
                      exc=httpx.ConnectError("connection refused"))
        with pytest.raises(HTTPException) as exc:
            asyncio.run(qbittorrent.get_torrents())
        assert exc.value.status_code == 502
        assert "unreachable" in exc.value.detail


# ─── Add flows ──────────────────────────────────────────────────────────────

class TestAddTorrent:
    def test_movie_add(self, mock_http):
        _login_ok(mock_http)
        mock_http.add("POST", "/api/v2/torrents/add", text="Ok.")
        result = asyncio.run(qbittorrent.add_torrent(
            "magnet:?xt=urn:btih:abc", "Heat (1995)"))

        add = mock_http.requests_to("/torrents/add")[0]
        form = _form(add)
        # "(" and ")" are stripped by sanitization; magnet passes through unrewritten
        assert form["urls"] == "magnet:?xt=urn:btih:abc"
        assert form["savepath"] == f"{settings.movies_path}/Heat 1995"
        assert form["category"] == "movies"
        assert result == {"save_path": f"{settings.movies_path}/Heat 1995",
                          "title": "Heat 1995"}

    def test_title_sanitization_strips_specials(self, mock_http):
        _login_ok(mock_http)
        mock_http.add("POST", "/api/v2/torrents/add", text="Ok.")
        result = asyncio.run(qbittorrent.add_torrent(
            "magnet:?x", 'What\'s Up: Doc? <edition/"special">'))
        assert result["title"] == "Whats Up Doc editionspecial"

    def test_prowlarr_download_url_rewritten(self, mock_http):
        _login_ok(mock_http)
        mock_http.add("POST", "/api/v2/torrents/add", text="Ok.")
        asyncio.run(qbittorrent.add_torrent(
            "http://prowlarr.test:9696/1/download?file=x", "Movie"))
        form = _form(mock_http.requests_to("/torrents/add")[0])
        assert form["urls"] == "http://localhost:9696/1/download?file=x"

    def test_tv_add_uses_show_season_path(self, mock_http):
        _login_ok(mock_http)
        mock_http.add("POST", "/api/v2/torrents/add", text="Ok.")
        result = asyncio.run(qbittorrent.add_tv_torrent(
            "magnet:?x", "Severance", 2))
        form = _form(mock_http.requests_to("/torrents/add")[0])
        assert form["savepath"] == f"{settings.tv_shows_path}/Severance/Season 02"
        assert form["category"] == "tv"
        assert result == {"save_path": f"{settings.tv_shows_path}/Severance/Season 02",
                          "show": "Severance", "season": 2}

    def test_anime_add_tv_path_but_anime_category(self, mock_http):
        _login_ok(mock_http)
        mock_http.add("POST", "/api/v2/torrents/add", text="Ok.")
        result = asyncio.run(qbittorrent.add_anime_torrent(
            "magnet:?x", "Frieren", 1))
        form = _form(mock_http.requests_to("/torrents/add")[0])
        assert form["savepath"] == f"{settings.tv_shows_path}/Frieren/Season 01"
        assert form["category"] == "anime"
        assert result["season"] == 1

    def test_add_failure_propagates(self, mock_http):
        # qBit 415 (invalid torrent) raises out — no swallow. Characterization.
        _login_ok(mock_http)
        mock_http.add("POST", "/api/v2/torrents/add", text="Unsupported", status=415)
        with pytest.raises(httpx.HTTPStatusError):
            asyncio.run(qbittorrent.add_torrent("magnet:?x", "Movie"))


# ─── Queue reads / delete ───────────────────────────────────────────────────

class TestQueueCalls:
    def test_get_torrents_passes_category(self, mock_http):
        _login_ok(mock_http)
        mock_http.add("GET", "/api/v2/torrents/info", json=[{"name": "t"}])
        result = asyncio.run(qbittorrent.get_torrents(category="tv"))
        info = mock_http.requests_to("/torrents/info")[0]
        assert info.url.params["category"] == "tv"
        assert result == [{"name": "t"}]

    def test_get_torrents_default_category_movies(self, mock_http):
        _login_ok(mock_http)
        mock_http.add("GET", "/api/v2/torrents/info", json=[])
        asyncio.run(qbittorrent.get_torrents())
        assert mock_http.requests_to("/torrents/info")[0].url.params["category"] == "movies"

    def test_delete_sends_lowercase_bool(self, mock_http):
        _login_ok(mock_http)
        mock_http.add("POST", "/api/v2/torrents/delete", text="")
        asyncio.run(qbittorrent.delete_torrent("abc123", delete_files=False))
        form = _form(mock_http.requests_to("/torrents/delete")[0])
        assert form == {"hashes": "abc123", "deleteFiles": "false"}

    def test_get_main_data(self, mock_http):
        _login_ok(mock_http)
        mock_http.add("GET", "/api/v2/sync/maindata",
                      json={"server_state": {"free_space_on_disk": 42}})
        data = asyncio.run(qbittorrent.get_main_data())
        assert data["server_state"]["free_space_on_disk"] == 42
