import httpx
from config import settings

BASE = "https://api.themoviedb.org/3"
HEADERS = {"Authorization": f"Bearer {settings.tmdb_api_key}"}
IMAGE_BASE = "https://image.tmdb.org/t/p/w500"

async def get_trending(time_window: str = "week"):
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{BASE}/trending/movie/{time_window}", headers=HEADERS)
        r.raise_for_status()
        return r.json()["results"]

async def get_top_rated(page: int = 1):
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{BASE}/movie/top_rated", headers=HEADERS, params={"page": page})
        r.raise_for_status()
        return r.json()["results"]

async def get_now_playing():
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{BASE}/movie/now_playing", headers=HEADERS)
        r.raise_for_status()
        return r.json()["results"]

async def get_by_genre(genre_id: int, page: int = 1):
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{BASE}/discover/movie",
            headers=HEADERS,
            params={"with_genres": genre_id, "sort_by": "popularity.desc", "page": page}
        )
        r.raise_for_status()
        return r.json()["results"]

async def get_genres():
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{BASE}/genre/movie/list", headers=HEADERS)
        r.raise_for_status()
        return r.json()["genres"]

async def get_movie_detail(movie_id: int):
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{BASE}/movie/{movie_id}",
            headers=HEADERS,
            params={"append_to_response": "videos,credits,watch/providers"}
        )
        r.raise_for_status()
        data = r.json()

        # Extract streaming providers for US
        providers = data.get("watch/providers", {}).get("results", {}).get("US", {})
        data["streaming_services"] = providers.get("flatrate", [])
        data["trailer"] = next(
            (v for v in data.get("videos", {}).get("results", [])
             if v["type"] == "Trailer" and v["site"] == "YouTube"),
            None
        )
        return data

async def search_movies(query: str):
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{BASE}/search/movie", headers=HEADERS, params={"query": query})
        r.raise_for_status()
        return r.json()["results"]

def poster_url(path: str) -> str:
    return f"{IMAGE_BASE}{path}" if path else None
