from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import movies, downloads, tv, tv_downloads, anime, anime_downloads, watchlist
from services import auto_downloader


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Spin up the auto-downloader background loop on app boot.
    auto_downloader.start_background_task()
    try:
        yield
    finally:
        auto_downloader.stop_background_task()


app = FastAPI(title="Movie Manager", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(movies.router)
app.include_router(downloads.router)
app.include_router(tv.router)
app.include_router(tv_downloads.router)
app.include_router(anime.router)
app.include_router(anime_downloads.router)
app.include_router(watchlist.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
