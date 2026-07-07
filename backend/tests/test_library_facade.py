"""Tests for the services.library provider facade: default binding,
explicit plex selection, invalid-provider failure, and the interface-parity
contract (every facade name must exist on BOTH providers — the drift guard
that keeps LIBRARY_PROVIDER=plex a real switch, not a latent crash)."""

import importlib

import pytest

from config import settings
from services import jellyfin, library, plex

# The provider interface, as re-exported by the facade.
INTERFACE = [
    "normalize_title",
    "get_library_index",
    "get_library_items_with_tmdb",
    "get_recently_added",
    "get_poster_image",
    "refresh_library",
    "get_tv_library_index",
    "get_tv_library_items_with_tmdb",
    "get_tv_library_shows",
    "get_tv_show_episodes",
    "refresh_tv_library",
]


class TestProviderSelection:
    def test_default_is_jellyfin(self):
        assert settings.library_provider == "jellyfin"
        assert library._impl is jellyfin
        assert library.get_library_index is jellyfin.get_library_index

    def test_plex_selectable(self, monkeypatch):
        monkeypatch.setattr(settings, "library_provider", "plex")
        try:
            reloaded = importlib.reload(library)
            assert reloaded._impl is plex
            assert reloaded.get_library_index is plex.get_library_index
        finally:
            monkeypatch.undo()
            importlib.reload(library)

    def test_invalid_provider_fails_at_import(self, monkeypatch):
        monkeypatch.setattr(settings, "library_provider", "emby")
        try:
            with pytest.raises(ValueError, match="LIBRARY_PROVIDER"):
                importlib.reload(library)
        finally:
            monkeypatch.undo()
            importlib.reload(library)


class TestInterfaceParity:
    @pytest.mark.parametrize("name", INTERFACE)
    def test_both_providers_implement(self, name):
        for provider in (jellyfin, plex):
            fn = getattr(provider, name, None)
            assert callable(fn), f"{provider.__name__} missing {name}"

    @pytest.mark.parametrize("name", INTERFACE)
    def test_facade_reexports(self, name):
        assert getattr(library, name) is getattr(jellyfin, name)
