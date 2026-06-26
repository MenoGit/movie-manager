"""Test bootstrap: put backend/ on sys.path and provide dummy settings env
so importing services.prowlarr (which builds config.Settings at import time)
never depends on a real .env. Only pure functions are tested — none of these
values are ever used to talk to a service."""

import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

for _key in (
    "TMDB_API_KEY", "QBIT_URL", "QBIT_USERNAME", "QBIT_PASSWORD",
    "PROWLARR_URL", "PROWLARR_API_KEY", "PLEX_URL", "PLEX_TOKEN",
):
    os.environ.setdefault(_key, "test-dummy")
