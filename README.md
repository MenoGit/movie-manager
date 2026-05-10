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
