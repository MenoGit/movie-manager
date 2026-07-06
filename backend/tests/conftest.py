"""Test bootstrap: put backend/ on sys.path and provide dummy settings env
so importing services.prowlarr (which builds config.Settings at import time)
never depends on a real .env. URL-shaped dummies matter for the integration
tests — httpx needs a valid absolute base URL to build request URLs against
the MockTransport; nothing is ever contacted at these addresses."""

import os
import sys
import tempfile
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

_DUMMY_ENV = {
    "TMDB_API_KEY": "test-tmdb-key",
    "QBIT_URL": "http://qbit.test:8080",
    "QBIT_USERNAME": "test-user",
    "QBIT_PASSWORD": "test-pass",
    "PROWLARR_URL": "http://prowlarr.test:9696",
    "PROWLARR_API_KEY": "test-prowlarr-key",
    "PLEX_URL": "http://plex.test:32400",
    "PLEX_TOKEN": "test-plex-token",
}
for _key, _val in _DUMMY_ENV.items():
    os.environ.setdefault(_key, _val)

# config.Settings forbids unknown keys and reads ./.env relative to cwd. The
# real .env carries infra keys the model doesn't declare (e.g. DUCKDNS_TOKEN),
# which would crash import. Pre-import config from a directory with no .env so
# settings come only from the dummy env above; the cached module is then reused
# by services.prowlarr's `from config import settings`.
_cwd = os.getcwd()
os.chdir(tempfile.gettempdir())
try:
    import config  # noqa: F401
finally:
    os.chdir(_cwd)

import httpx  # noqa: E402  (after sys.path/env setup on purpose)


class HTTPRecorder:
    """Routes httpx requests to canned responses and records every request.

    Register routes with add(); each incoming request is matched against
    routes in registration order by (method, substring-of-URL). An
    unmatched request is a test bug, so it raises AssertionError rather
    than silently returning anything."""

    def __init__(self):
        self._routes = []
        self.requests: list[httpx.Request] = []

    def add(self, method: str, url_contains: str, *, json=None, status=200,
            text=None, exc: Exception | None = None):
        """Canned response for requests whose URL contains `url_contains`.
        Pass `exc` to raise a transport-level error (e.g. httpx.ConnectError)
        instead of returning a response."""
        self._routes.append((method.upper(), url_contains, json, status, text, exc))

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        for method, fragment, json_body, status, text, exc in self._routes:
            if request.method == method and fragment in str(request.url):
                if exc is not None:
                    raise exc
                if text is not None:
                    return httpx.Response(status, text=text)
                return httpx.Response(status, json=json_body if json_body is not None else {})
        raise AssertionError(f"Unmatched request: {request.method} {request.url}")

    def requests_to(self, url_contains: str) -> list:
        return [r for r in self.requests if url_contains in str(r.url)]


@pytest.fixture
def mock_http(monkeypatch):
    """Patch httpx.AsyncClient so every request in the code under test goes
    through an in-memory MockTransport — no real network. Yields the recorder
    for registering routes and asserting on captured requests."""
    recorder = HTTPRecorder()
    real_client = httpx.AsyncClient

    class PatchedAsyncClient(real_client):
        def __init__(self, **kwargs):
            kwargs["transport"] = httpx.MockTransport(recorder.handler)
            super().__init__(**kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", PatchedAsyncClient)
    return recorder


@pytest.fixture
def clear_plex_cache():
    """Reset services.plex module-level caches around a test so cached data
    from one test never leaks into another."""
    from services import plex

    def _reset():
        plex._LIBRARY_CACHE.update(data=None, ts=0)
        plex._TV_LIBRARY_CACHE.update(data=None, ts=0)
        plex._TV_EPISODES_CACHE.clear()

    _reset()
    yield
    _reset()
