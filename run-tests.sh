#!/usr/bin/env bash
# Run the full FilmVault test suite: backend pytest (host) + frontend vitest
# (inside the running frontend container — there is no node on the host).
#
#   ./run-tests.sh             # everything
#   ./run-tests.sh --backend   # backend only
#   ./run-tests.sh --frontend  # frontend only
#
# Extra args after the flag are passed through to the underlying runner,
# e.g. ./run-tests.sh --backend -k prowlarr -x

set -u
cd "$(dirname "$0")"

DEPS_DIR=.pytest-deps
# Everything the host-side suite imports: pytest itself, the backend's HTTP
# stack, settings loading, and fastapi (the router tests import APIRouter).
BOOTSTRAP_PKGS=(pytest httpx pydantic-settings python-dotenv fastapi)

run_backend=true
run_frontend=true
case "${1:-}" in
  --backend)  run_frontend=false; shift ;;
  --frontend) run_backend=false;  shift ;;
esac

backend_status=0
frontend_status=0

if $run_backend; then
  if [ ! -d "$DEPS_DIR" ]; then
    echo "→ $DEPS_DIR missing; bootstrapping test deps (one-time)..."
    python3 -m pip install --target="$DEPS_DIR" "${BOOTSTRAP_PKGS[@]}" || exit 1
  fi
  echo "→ backend: pytest"
  PYTHONPATH="$DEPS_DIR" python3 -m pytest backend/tests/ -q "$@"
  backend_status=$?
fi

if $run_frontend; then
  if ! docker ps --format '{{.Names}}' | grep -qx movie-manager-frontend; then
    echo "→ frontend: SKIPPED — movie-manager-frontend container is not running."
    echo "  Start it with: docker compose up -d frontend"
    frontend_status=1
  else
    echo "→ frontend: vitest (in container)"
    docker exec movie-manager-frontend npm test --silent -- "$@"
    frontend_status=$?
  fi
fi

echo
$run_backend  && echo "backend:  $([ $backend_status -eq 0 ] && echo PASS || echo FAIL)"
$run_frontend && echo "frontend: $([ $frontend_status -eq 0 ] && echo PASS || echo FAIL)"
exit $(( backend_status || frontend_status ))
