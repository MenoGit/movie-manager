"""Backend half of the cross-language parity contract.

frontend/src/test/parity-cases.json is the single canonical fixture; the
vitest suite (frontend/src/torrentScoring.parity.test.js) asserts the JS
port against the same file. If either implementation drifts from the other,
its own suite fails against this shared contract.
"""

import json
from pathlib import Path

import pytest

from services.scoring import GB, _speed_score, parse_release, score_torrent

FIXTURE = Path(__file__).resolve().parents[2] / "frontend/src/test/parity-cases.json"

with FIXTURE.open() as f:
    CASES = json.load(f)

# Fixture uses language-neutral keys; map to this implementation's names.
PARSED_KEY_MAP = {"remux": "is_remux", "yts": "is_yts"}
CTX_KEY_MAP = {"runtimeMin": "runtime_min", "episodeCount": "episode_count",
               "isSeasonSearch": "is_season_search"}


@pytest.mark.parametrize(
    "case", CASES["parse_cases"], ids=[c["title"][:45] for c in CASES["parse_cases"]]
)
def test_parse_parity(case):
    parsed = parse_release(case["title"])
    for key, expected in case["expected"].items():
        assert parsed[PARSED_KEY_MAP.get(key, key)] == expected, key


@pytest.mark.parametrize(
    "case", CASES["speed_cases"],
    ids=[f"s{c['seeds']}_p{c['peers']}" for c in CASES["speed_cases"]],
)
def test_speed_score_parity(case):
    assert _speed_score(case["seeds"], case["peers"]) == pytest.approx(
        case["expected"], abs=1e-6
    )


@pytest.mark.parametrize(
    "case", CASES["score_cases"], ids=[c["title"][:45] for c in CASES["score_cases"]]
)
def test_score_parity(case):
    ctx = {CTX_KEY_MAP.get(k, k): v for k, v in case["ctx"].items()}
    r = score_torrent(
        {"title": case["title"], "size": case["size_bytes"],
         "seeders": case["seeders"], "leechers": case["leechers"]},
        ctx,
    )
    assert r["score"] == pytest.approx(case["expected"]["score"], abs=1e-9)
    assert r["tier"] == case["expected"]["tier"]
    assert r["eligible"] is case["expected"]["eligible"]
