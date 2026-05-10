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
    movies_path: str = "/mnt/media/movies"

    class Config:
        env_file = ".env"

settings = Settings()
