from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import movies, downloads

app = FastAPI(title="Movie Manager", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten in production
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(movies.router)
app.include_router(downloads.router)

@app.get("/health")
async def health():
    return {"status": "ok"}
