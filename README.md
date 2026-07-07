# FilmVault 🎬

A self-hosted movie manager that connects TMDb, Prowlarr, qBittorrent, and Jellyfin (or Plex) into one clean dark UI.

## Setup

### 1. Copy env file and fill in your values
```bash
cp .env.example .env
nano .env
```

You'll need:
- **TMDb API key** — free at https://www.themoviedb.org/settings/api
- **qBittorrent** — your existing setup, just need URL + credentials
- **Jellyfin API key** — Jellyfin Dashboard > API Keys > + (Plex token optional; see Library server below)
- **Prowlarr API key** — generated after first boot (see step 3)

### 2. Start Prowlarr first to get the API key
```bash
docker compose up prowlarr -d
```
Open http://localhost:9696, go to Settings > General, copy the API key into `.env` as `PROWLARR_API_KEY`.

Then add your torrent indexers in Prowlarr under Indexers > Add Indexer.

### 3. Start everything
```bash
docker compose up -d
```

App runs at **http://localhost:3000**

## Architecture

```
TMDb API          → movie metadata, posters, streaming info
Prowlarr          → searches your configured torrent indexers  
qBittorrent       → handles actual downloads
Jellyfin          → library management + auto-refresh (Plex available as fallback)
```

## Library server

**Jellyfin is the primary library provider** — it powers the "In Library" badges,
TV episode progress, the recently-added row, and the post-download refresh.
Plex support is kept fully intact as a secondary.

All provider access goes through `backend/services/library.py`, which binds
`services/jellyfin.py` or `services/plex.py` based on one setting:

```bash
# .env — omit entirely for the default (jellyfin)
LIBRARY_PROVIDER=plex
```

Then restart the backend: `docker compose up -d backend`. Both providers'
credentials stay configured in `.env` (`JELLYFIN_URL`/`JELLYFIN_API_KEY`,
`PLEX_URL`/`PLEX_TOKEN`); only the selected one is contacted. An invalid
value fails at startup with a clear error.

## Features
- Trending / Top Rated / Now Playing / Genre browsing
- Streaming service filter (Netflix, Disney+, Prime, etc.)
- "In Library" badge cross-referenced with your media library
- Click movie → torrent list with seeders, size, source
- Edit search query before downloading
- Download queue with live progress
- Storage meter
- Manual library refresh button
- Watchlist (saved locally)
- Movie detail with trailer link, cast, streaming services

## Dev (without Docker)
```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload

# Frontend
cd frontend
npm install
npm run dev
```

## Tests

One command runs everything — backend pytest on the host, frontend vitest inside the running frontend container (no node needed on the host):

```bash
./run-tests.sh             # backend + frontend
./run-tests.sh --backend   # backend only; extra args pass to pytest, e.g. -k prowlarr -x
./run-tests.sh --frontend  # frontend only (needs: docker compose up -d frontend)
```

Backend deps live in the gitignored `.pytest-deps/` (no venv needed); the script bootstraps it automatically on first run. The suite makes **no network calls** — external services (Prowlarr, qBittorrent, TMDb, Jellyfin, Plex) are mocked at the httpx transport layer via the `mock_http` fixture in `backend/tests/conftest.py`.

What's covered:

- `backend/tests/test_scoring.py`, `test_prowlarr.py` — pure logic: release parsing, torrent scoring/tiers, year bucketing, episode matching
- `backend/tests/test_*_integration.py` — service + router flows against mocked HTTP: Prowlarr search strategies, qBittorrent login/add/queue, TMDb detail + theatrical-only heuristic, Jellyfin/Plex library index + provider facade, download-queue auto-completion
- `frontend/src/test/*.test.js` — vitest for the JS scoring/display helpers
- **Parity contract**: `frontend/src/test/parity-cases.json` is asserted by both `backend/tests/test_parity.py` and `torrentScoring.parity.test.js` so the Python and JS scorers can't drift apart. Regenerate it deliberately — never edit one side to make a test pass.

These are characterization tests: they lock in current behavior. If one fails after a change, decide whether the code or the locked-in expectation is wrong — don't reflexively update the test.
