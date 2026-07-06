# FilmVault 🎬

A self-hosted movie manager that connects TMDb, Prowlarr, qBittorrent, and Plex into one clean dark UI.

## Setup

### 1. Copy env file and fill in your values
```bash
cp .env.example .env
nano .env
```

You'll need:
- **TMDb API key** — free at https://www.themoviedb.org/settings/api
- **qBittorrent** — your existing setup, just need URL + credentials
- **Plex token** — In Plex, go to Settings > Troubleshooting > "Get an X-Plex-Token"
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
Plex              → library management + auto-refresh
```

## Features
- Trending / Top Rated / Now Playing / Genre browsing
- Streaming service filter (Netflix, Disney+, Prime, etc.)
- "In Library" badge cross-referenced with your Plex library
- Click movie → torrent list with seeders, size, source
- Edit search query before downloading
- Download queue with live progress
- Storage meter
- Manual Plex refresh button
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

Backend deps live in the gitignored `.pytest-deps/` (no venv needed); the script bootstraps it automatically on first run. The suite makes **no network calls** — external services (Prowlarr, qBittorrent, TMDb, Plex) are mocked at the httpx transport layer via the `mock_http` fixture in `backend/tests/conftest.py`.

What's covered:

- `backend/tests/test_scoring.py`, `test_prowlarr.py` — pure logic: release parsing, torrent scoring/tiers, year bucketing, episode matching
- `backend/tests/test_*_integration.py` — service + router flows against mocked HTTP: Prowlarr search strategies, qBittorrent login/add/queue, TMDb detail + theatrical-only heuristic, Plex library index, download-queue auto-completion
- `frontend/src/test/*.test.js` — vitest for the JS scoring/display helpers
- **Parity contract**: `frontend/src/test/parity-cases.json` is asserted by both `backend/tests/test_parity.py` and `torrentScoring.parity.test.js` so the Python and JS scorers can't drift apart. Regenerate it deliberately — never edit one side to make a test pass.

These are characterization tests: they lock in current behavior. If one fails after a change, decide whether the code or the locked-in expectation is wrong — don't reflexively update the test.
