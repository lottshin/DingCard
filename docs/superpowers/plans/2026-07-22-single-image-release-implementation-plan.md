# Single-Image Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship DingCard as one versioned, multi-architecture GHCR image whose Fastify process serves the SPA, API, and uploads while preserving existing Compose data.

**Architecture:** Move the production static-site responsibility from the disposable Nginx container into a focused Fastify plugin, then build the frontend and backend into one non-root Node image. Keep the existing `db` and `uploads` volume names, publish only from SemVer Git tags, and make anonymous multi-architecture startup smoke tests a release gate.

**Tech Stack:** Node.js 20, Fastify 4, `@fastify/static`, React/Vite, Docker/Compose, Docker Buildx/QEMU, GitHub Actions, GHCR, Node test runner, Vitest, Playwright.

---

## File Structure

- Create `server/src/staticSite.js`: validate and register the production SPA/static-file contract.
- Create `server/src/staticSite.test.mjs`: Fastify injection tests for static files, caching, SPA fallback, strict image mode, and 404 boundaries.
- Create `server/src/app.js`: build and register the Fastify application without listening.
- Modify `server/src/index.js`: listen-only process entry using `buildApp`.
- Modify `server/src/config.js` and `server/src/config.test.mjs`: add stable `WEB_ROOT` and `DINGCARD_IMAGE` runtime contracts.
- Modify `server/src/routes/assetLock.integration.test.mjs`: replace the deleted Nginx proxy assertion with the new public-origin/runtime contract.
- Replace `Dockerfile`: build frontend and backend into one non-root Node image.
- Delete `server/Dockerfile` and `deploy/nginx.conf`: remove obsolete two-image runtime definitions.
- Modify `.dockerignore`: include `server` source while excluding server data and dependencies.
- Modify `docker-compose.yml`: run one `app` service from a pinned GHCR image or local build.
- Modify `deploy/compose-smoke.sh`: test one Fastify container and address it by service ID.
- Create `.github/workflows/publish-image.yml`: tag-only GHCR multi-architecture publishing and anonymous smoke tests.
- Modify `.github/workflows/ci.yml`: update official Action majors in a separate commit and validate both workflows.
- Modify `scripts/release-readiness.test.mjs`: enforce versions, one-image Compose, workflow, License, and documentation contracts.
- Modify `package.json`, `package-lock.json`, `server/package.json`, `server/package-lock.json`: bump frontend to `0.11.0` and server to `0.3.0`.
- Create `LICENSE`: MIT, copyright `2026 lottshin`.
- Modify `.env.example`, `README.md`, `CHANGELOG.md`, `docs/deployment.md`, `docs/backend-plan.md`, and `docs/release-verification.md`: document the new deployment and release behavior.

### Task 1: Define the Fastify static-site contract

**Files:**
- Create: `server/src/staticSite.test.mjs`
- Create: `server/src/staticSite.js`

- [ ] **Step 1: Write failing behavior tests**

Create a temporary web root containing `index.html`, `favicon.svg`, and `assets/app-hash.js`. Register a wished-for `registerStaticSite(app, { webRoot, required })` on a real Fastify instance. Assert independently that:

- `/` and `/favicon.svg` return their files with `Cache-Control: no-cache`.
- `/assets/app-hash.js` returns `Cache-Control: public, max-age=31536000, immutable`.
- `GET` and `HEAD` `/editor/work` with `Accept: text/html` return `index.html`.
- unknown `/api`, `/api/`, `/api/x`, `/uploads`, `/uploads/`, and `/uploads/x` paths remain 404.
- a custom upload prefix such as `/media`, `/media/`, and `/media/x` remains 404 when passed through `uploadsPublicPath`.
- unknown `POST`, `Accept: application/json`, and missing-HTML-Accept requests remain 404.
- `required: true` rejects an empty root, missing directory, unreadable root/index, and directory without `index.html` with stable error messages.
- `required: false` with an empty root leaves an API-only Fastify instance usable.

- [ ] **Step 2: Verify RED**

Run: `node --test src/staticSite.test.mjs` from `server/`.

Expected: FAIL because `staticSite.js` does not exist.

- [ ] **Step 3: Implement the smallest static-site plugin**

Validate `webRoot` with `node:fs`/`node:path`; register `@fastify/static` at `/`; set cache headers from the resolved file path; install a not-found handler that only falls back for `GET`/`HEAD`, HTML `Accept`, and paths outside `/api` plus the configured `uploadsPublicPath` exact root/children. Export small pure predicates only when tests need their public contract.

- [ ] **Step 4: Verify GREEN and edge cases**

Run: `node --test src/staticSite.test.mjs` from `server/`.

Expected: all static-site tests pass with no warnings.

- [ ] **Step 5: Run the AGENTS.md checklist and commit**

Check empty/invalid roots, exact path names, stable errors, documentation implications, server minor bump requirement, Windows/Linux path handling, then commit:

```powershell
git add server/src/staticSite.js server/src/staticSite.test.mjs
git commit -m "feat(server): serve the production SPA"
```

### Task 2: Integrate static hosting without breaking API-only runs

**Files:**
- Create: `server/src/app.js`
- Modify: `server/src/index.js`
- Modify: `server/src/config.js`
- Modify: `server/src/config.test.mjs`
- Modify: `server/src/routes/assetLock.integration.test.mjs`

- [ ] **Step 1: Write failing configuration and assembly tests**

Add config subprocess cases proving:

- `WEB_ROOT` resolves to an absolute path when supplied.
- `DINGCARD_IMAGE=1` is parsed as strict image mode.
- production API-only config remains valid when `DINGCARD_IMAGE` is absent and `WEB_ROOT` is empty.

Add or adjust the existing integration assertion so it verifies the public request origin continues to use the complete `Host` authority and first forwarded protocol without reading `deploy/nginx.conf`.

- [ ] **Step 2: Verify RED**

Run: `node --test src/config.test.mjs src/routes/assetLock.integration.test.mjs` from `server/`.

Expected: new config assertions fail because the fields do not exist; the new runtime assertion fails until assembly is split.

- [ ] **Step 3: Add config fields and application factory**

Add `webRoot` and `imageRuntime` to config. Move Fastify construction, plugins, health route, auth/draft/image routes, and static-site registration into `buildApp()` in `app.js`. Keep `index.js` limited to building, listening, logging startup errors, and exiting non-zero. Register uploads before the SPA, with 30-day immutable caching, then register the SPA last and pass `config.uploadsPublicPath` so API and the configured upload routes win.

- [ ] **Step 4: Verify GREEN and existing backend behavior**

Run from repository root:

```powershell
npm run test:server
node server/smoke-test.mjs
```

Expected: all old and new backend tests pass; the HTTP smoke still covers auth, drafts, uploads, ownership, limits, and GC.

- [ ] **Step 5: Run the AGENTS.md checklist and commit**

Search `webRoot`, `WEB_ROOT`, `imageRuntime`, and `DINGCARD_IMAGE` across the repository; confirm health/status codes are unchanged; record pending docs/version work; commit:

```powershell
git add server/src/app.js server/src/index.js server/src/config.js server/src/config.test.mjs server/src/routes/assetLock.integration.test.mjs
git commit -m "refactor(server): separate app assembly from startup"
```

### Task 3: Define and implement the one-container deployment

**Files:**
- Modify: `scripts/release-readiness.test.mjs`
- Replace: `Dockerfile`
- Delete: `server/Dockerfile`
- Delete: `deploy/nginx.conf`
- Modify: `.dockerignore`
- Modify: `docker-compose.yml`
- Modify: `deploy/compose-smoke.sh`

- [ ] **Step 1: Add failing deployment contract tests**

Extend `release-readiness.test.mjs` to assert:

- Compose has one `app` service, one `ghcr.io/lottshin/dingcard:${DINGCARD_VERSION:-0.11.0}` image reference, one build context, port `3000`, and both existing volumes.
- Dockerfile bakes in `NODE_ENV=production`, `DINGCARD_IMAGE=1`, `HOST=0.0.0.0`, `PORT=3000`, `DATA_DIR=/data`, and `WEB_ROOT=/app/dist`, retains `ARG/ENV VITE_API_BASE=/` for the frontend build, copies the frontend and server production dependency stages, uses `USER node`, and checks `/api/health`.
- `server/Dockerfile` and `deploy/nginx.conf` no longer exist.
- Compose smoke references service `app`, validates homepage/API/upload/static asset, and does not contain Nginx or hard-coded Compose container names.

- [ ] **Step 2: Verify RED**

Run: `node --test scripts/release-readiness.test.mjs`.

Expected: deployment contract test fails on the existing two-service Compose and Nginx image.

- [ ] **Step 3: Build the unified image definition**

Replace the root Dockerfile with frontend-build, server-deps, and final Node stages. Preserve `ARG VITE_API_BASE=/` plus its build-stage environment so the bundled frontend selects same-origin RemoteStore. Update `.dockerignore` so `server/` is included but `server/node_modules`, `server/data`, tests, docs, secrets, and generated output stay excluded. Remove obsolete Docker/Nginx files.

- [ ] **Step 4: Replace Compose and smoke script**

Create one `app` service with pinned `image`, root `build` and `VITE_API_BASE: /` build arg, explicit runtime environment, `8080:3000`, existing `db` and `uploads` mounts, restart policy, and image health check. Update smoke to resolve the app container through `docker compose ps -q app`, test homepage, API health, registration, image upload/static retrieval and a referenced hashed frontend asset, then always clean its unique project.

- [ ] **Step 5: Verify configuration and contract GREEN**

Run:

```powershell
$env:JWT_SECRET='compose-config-test-only'
docker compose config --quiet
docker compose config --services
node --test scripts/release-readiness.test.mjs
```

Expected: config is valid, service output is only `app`, and release contract passes its deployment section. If the Docker daemon is available, run `bash deploy/compose-smoke.sh`; otherwise record runtime smoke as not executed.

- [ ] **Step 6: Run the AGENTS.md checklist and commit**

Confirm `app`, image, environment, port, and volume names are consistent; no status code changed; pending docs are listed; deployment is a root minor feature; validate amd64 host and the documented arm64 CI path; commit:

```powershell
git add Dockerfile .dockerignore docker-compose.yml deploy/compose-smoke.sh scripts/release-readiness.test.mjs
git rm server/Dockerfile deploy/nginx.conf
git commit -m "feat(docker): package DingCard as one image"
```

### Task 4: Add the GHCR multi-architecture release gate

**Files:**
- Modify: `scripts/release-readiness.test.mjs`
- Create: `.github/workflows/publish-image.yml`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add failing workflow contract tests**

Assert the publish workflow contains: `v*` tag trigger, explicit SemVer validation, GHCR login with `GITHUB_TOKEN`, `packages: write`, `id-token: write`, amd64/arm64 platforms, OCI metadata, version/minor/latest/SHA tags, stable-only `latest`, SBOM, provenance, anonymous smoke matrix for both platforms, QEMU setup in the smoke job, `/` and `/api/health`, and unconditional cleanup. Do not change the existing CI Action-version assertions in this step.

- [ ] **Step 2: Verify RED**

Run: `node --test scripts/release-readiness.test.mjs`.

Expected: FAIL because `publish-image.yml` does not exist; the unchanged CI Action-version assertions still pass at this stage.

- [ ] **Step 3: Implement publishing workflow**

Use current official Actions: checkout v7, setup-qemu v4, setup-buildx v4, login v4, metadata v6, and build-push v7. Reject non-SemVer `v*` refs before login. Build and push `ghcr.io/lottshin/dingcard` for both platforms with registry cache, OCI labels, SBOM, and provenance. A fresh matrix job must not log in; it pulls/runs each platform under QEMU, discovers its random host port, checks homepage/health/static asset, and removes its container and temporary volume in `always()` cleanup.

- [ ] **Step 4: Update CI Actions separately**

After the publishing commit is green, update the release contract assertions for checkout/setup-node/setup-python v7, run them to observe RED against the old CI, then upgrade CI while preserving commands, caches, permissions, browser job, and failure artifact behavior. Parse both workflow files with PyYAML.

- [ ] **Step 5: Verify GREEN and commit in two commits**

Run:

```powershell
node --test scripts/release-readiness.test.mjs
python -c "import pathlib, yaml; [yaml.safe_load(path.read_text(encoding='utf-8')) for path in pathlib.Path('.github/workflows').glob('*.yml')]"
```

Commit publishing and CI upgrades separately; each commit must pass the contract state it contains:

```powershell
git add .github/workflows/publish-image.yml scripts/release-readiness.test.mjs
git commit -m "ci: publish multi-architecture container images"
git add .github/workflows/ci.yml scripts/release-readiness.test.mjs
git commit -m "ci: update official GitHub Actions"
```

### Task 5: Synchronize versions, License, and user documentation

**Files:**
- Modify: `package.json`, `package-lock.json`
- Modify: `server/package.json`, `server/package-lock.json`
- Create: `LICENSE`
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/deployment.md`
- Modify: `docs/backend-plan.md`
- Modify: `docs/release-verification.md`
- Modify: `scripts/release-readiness.test.mjs`

- [ ] **Step 1: Add failing version, License, and documentation contracts**

Assert root/server versions are `0.11.0`/`0.3.0`; README badge and CHANGELOG match; MIT License contains `2026 lottshin`; README uses `docker compose pull` plus `up -d --no-build`; documentation includes `DINGCARD_VERSION=0.11.0`, the `app` service, GHCR public-package note, source-build command, unchanged two-volume backup/restore, and no production Nginx-container instructions.

- [ ] **Step 2: Verify RED**

Run: `node --test scripts/release-readiness.test.mjs`.

Expected: version/license/docs assertions fail against `0.10.1`, `0.2.0`, missing License, and two-container instructions.

- [ ] **Step 3: Bump all version sources**

Use `npm version 0.11.0 --no-git-tag-version` at root and `npm version 0.3.0 --no-git-tag-version` under `server`; inspect both lockfile roots. Do not create a Git tag yet.

- [ ] **Step 4: Add License and rewrite deployment paths**

Add the standard MIT text. Update `.env.example`, README, deployment/backend docs, backup/restore container lookup, logs, upgrades, source build, image pull, public GHCR requirement, outer HTTPS proxy, and technical stack. Keep Vercel/local-only behavior unchanged and avoid duplicating the long deployment guide in README.

- [ ] **Step 5: Update changelog and verification template**

Add `0.11.0 - 2026-07-22`, describing the single image, fixed version deployment, multi-architecture release, preserved volumes, root/server versions, and no automatic LocalStore/RemoteStore migration. Update verification rows for one-service Compose, container runtime status, manifest platforms, anonymous pull, and both architecture smokes; do not mark unexecuted remote checks as passed.

- [ ] **Step 6: Verify GREEN, search references, and commit**

Run:

```powershell
node --test scripts/release-readiness.test.mjs
rg -n "0\.10\.1|0\.2\.0|server web|web server|deploy/nginx\.conf|server/Dockerfile|Nginx 直出|两个容器" README.md CHANGELOG.md .env.example docs deploy server .github Dockerfile docker-compose.yml package*.json
```

Classify every remaining hit as historical, development-only, external HTTPS proxy, or an error to fix. Commit:

```powershell
git add package.json package-lock.json server/package.json server/package-lock.json LICENSE .env.example README.md CHANGELOG.md docs scripts/release-readiness.test.mjs
git commit -m "docs: publish DingCard 0.11.0 deployment guide"
```

### Task 6: Full verification and integration

**Files:**
- Verify all changed files above.
- Modify `docs/release-verification.md` only with actual results.

- [ ] **Step 1: Run repository tests from a clean dependency state**

Run:

```powershell
npm ci
npm --prefix server ci
node --test scripts/release-readiness.test.mjs
npm run test:unit
npm run test:server
node server/smoke-test.mjs
npm run build
npm run test:e2e
```

Expected: all tests pass; only the known Vite large-chunk warning remains.

- [ ] **Step 2: Verify deployment artifacts**

Run `docker compose config --quiet`, confirm `docker compose config --services` prints only `app`, and check `docker compose images`. If the local daemon is available, run `bash deploy/compose-smoke.sh`; if not, record it as `NOT EXECUTED` and rely on the future tag workflow rather than claiming a pass.

- [ ] **Step 3: Run the final AGENTS.md audit**

Review function fallbacks, grep every new config name, confirm HTTP/error contracts, check every affected document, verify all four version files and visible badges, and separate local Windows evidence from GitHub amd64/arm64 evidence.

- [ ] **Step 4: Inspect the complete change set**

Run:

```powershell
git diff --check master...HEAD
git status --short --branch
git log --oneline master..HEAD
git diff --stat master...HEAD
```

Expected: no whitespace errors, no generated artifacts, and only single-image release files changed.

- [ ] **Step 5: Commit verification evidence**

```powershell
git add docs/release-verification.md
git commit -m "test: record 0.11.0 release verification"
```

- [ ] **Step 6: Request code review, merge, then publish**

Run the requesting-code-review skill. Resolve blocking findings and rerun affected checks. Fast-forward the reviewed branch into local `master`, push `master`, create and push `v0.11.0`, wait for the image build, set `ghcr.io/lottshin/dingcard` public immediately after the package is first created, then rerun the anonymous smoke job if its first attempt failed while private. Confirm both manifests and a Ready release before creating the GitHub Release. Do not publish the tag before local verification and review pass.
