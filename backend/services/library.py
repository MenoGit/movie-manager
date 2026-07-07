"""Library-provider facade. Routers and the auto-downloader import this
module instead of a concrete provider; LIBRARY_PROVIDER in .env picks the
implementation (default: jellyfin). Both providers expose the same
functions and return shapes.

The provider is bound once at import time — switching requires a backend
restart (docker compose up -d backend), which also keeps caches coherent."""

from config import settings
from services import jellyfin, plex

_PROVIDERS = {"jellyfin": jellyfin, "plex": plex}

if settings.library_provider not in _PROVIDERS:
    raise ValueError(
        f"LIBRARY_PROVIDER must be one of {sorted(_PROVIDERS)}, "
        f"got {settings.library_provider!r}"
    )

_impl = _PROVIDERS[settings.library_provider]

# The provider interface, spelled out — a provider missing one of these
# fails at import, not at request time.
normalize_title = _impl.normalize_title
get_library_index = _impl.get_library_index
get_library_items_with_tmdb = _impl.get_library_items_with_tmdb
get_recently_added = _impl.get_recently_added
get_poster_image = _impl.get_poster_image
refresh_library = _impl.refresh_library
get_tv_library_index = _impl.get_tv_library_index
get_tv_library_items_with_tmdb = _impl.get_tv_library_items_with_tmdb
get_tv_library_shows = _impl.get_tv_library_shows
get_tv_show_episodes = _impl.get_tv_show_episodes
refresh_tv_library = _impl.refresh_tv_library
