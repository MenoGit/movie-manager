"""Test bootstrap: put backend/ on sys.path and provide dummy settings env
so importing services.prowlarr (which builds config.Settings at import time)
never depends on a real .env. Only pure functions are tested — none of these
values are ever used to talk to a service."""

import os
import sys
import tempfile
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

for _key in (
    "TMDB_API_KEY", "QBIT_URL", "QBIT_USERNAME", "QBIT_PASSWORD",
    "PROWLARR_URL", "PROWLARR_API_KEY", "PLEX_URL", "PLEX_TOKEN",
):
    os.environ.setdefault(_key, "test-dummy")

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
