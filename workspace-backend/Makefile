# Dev/build workflow for workspace-backend + frontend.
#
#   make dev            run backend (:18789) and frontend (:5010) together
#   make dev-backend    backend only (with --reload)
#   make dev-frontend   frontend only (vite :5010, proxies /api+/healthz → :18789)
#   make build-frontend build the SPA into frontend/dist/
#   make serve          build the SPA then serve it from the backend on :18789
#   make package        build + zip a deployable bundle into dist/ (version from source; set-version first)
#   make set-version     stamp one version into backend + frontend (VERSION=x.y.z)
#   make check          backend (ruff+mypy+pytest) + frontend (biome+typecheck+test)

PORT ?= 18789
FE := frontend

.PHONY: dev dev-backend dev-frontend build-frontend serve package set-version check check-backend check-frontend

dev-backend:
	uv run uvicorn workspace_backend.app:app --reload --port $(PORT)

dev-frontend:
	cd $(FE) && pnpm dev

# Ctrl-C stops both processes.
dev:
	@$(MAKE) -j2 dev-backend dev-frontend

build-frontend:
	cd $(FE) && pnpm install && pnpm build

# Build the SPA, then start the backend which mounts dist/ as a static SPA.
# Open http://localhost:$(PORT)/ — one process, same origin, no proxy.
serve: build-frontend
	uv run uvicorn workspace_backend.app:app --port $(PORT)

# Build the SPA, export requirements.txt from uv.lock, and zip a deployable bundle
# into dist/bz-agent-v<ver>.zip. The version is read from the source tree; stamp it
# first with `make set-version VERSION=x.y.z`.
package:
	./scripts/package.sh

# Set and sync the single product version across backend (__init__.py, pyproject.toml)
# and frontend (version.ts). Run with no VERSION to just report the current values.
#   make set-version VERSION=0.6.5
set-version:
	./scripts/set-version.sh $(VERSION)

check-backend:
	uv run ruff format && uv run ruff check && uv run mypy && uv run pytest -q

check-frontend:
	cd $(FE) && pnpm run check && pnpm run typecheck && pnpm test

check: check-backend check-frontend
