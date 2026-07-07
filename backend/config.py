from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    tmdb_api_key: str
    qbit_url: str
    qbit_username: str
    qbit_password: str
    prowlarr_url: str
    prowlarr_api_key: str
    plex_url: str
    plex_token: str
    jellyfin_url: str
    jellyfin_api_key: str
    # Active library provider: "jellyfin" (default) or "plex".
    library_provider: str = "jellyfin"
    movies_path: str = "/mnt/media/movies"
    tv_shows_path: str = "/mnt/media/tv-shows"

    class Config:
        env_file = ".env"

settings = Settings()
