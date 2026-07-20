# Local Release Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the local `0.10.1` repository release-ready with accurate entry documentation, a changelog, reusable CI, evidence-based backend status, and recorded production/Docker verification, without using a remote.

**Architecture:** Keep runtime code untouched. Add one Node built-in contract test that treats release documentation and CI as versioned interfaces, then implement the missing files until that test passes. Reuse existing npm scripts in CI and record environment-dependent Docker results separately from repository-level test results.

**Tech Stack:** Markdown, GitHub Actions YAML, Node.js 20 built-in test runner, npm, Vite, Vitest, Playwright, Docker Compose.

---

## File Structure

- Create `scripts/release-readiness.test.mjs`: repository contract tests for README, CHANGELOG, workflow, versions, and backend checklist status.
- Create `README.md`: canonical repository entry point and cross-platform operating instructions.
- Create `CHANGELOG.md`: user-facing `0.10.1` release history and compatibility boundaries.
- Create `.github/workflows/ci.yml`: future remote CI using existing test/build commands.
- Create `docs/release-verification.md`: dated local verification evidence and explicit Docker execution status.
- Modify `deploy/compose-smoke.sh`: accept a unique project/port from the caller and check the health endpoint without changing its default use.
- Modify `server/src/config.test.mjs`: prove production rejects an empty JWT secret.
- Modify `server/smoke-test.mjs`: prove password hashing, upload validation, randomized paths, and registration rate limiting over HTTP.
- Modify `docs/backend-plan.md`: reconcile completed security/open-source checklist items with repository evidence.

Runtime source files, package versions, lockfiles, `.claude/`, remote configuration, tags, and LICENSE remain unchanged.

### Task 1: Add a failing release-readiness contract test

**Files:**
- Create: `scripts/release-readiness.test.mjs`

- [ ] **Step 1: Write the test before release files exist**

Use `node:test`, `node:assert/strict`, `node:fs`, `node:path`, and `fileURLToPath`. Define all imports and helpers before the tests so the file is directly executable:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8')
const exists = (relative) => fs.existsSync(path.join(root, relative))
const frontend = JSON.parse(read('package.json'))
const server = JSON.parse(read('server/package.json'))
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
```

The test must:

```js
test('release entry documentation matches the current versions and commands', () => {
  assert.equal(exists('README.md'), true)
  assert.equal(exists('CHANGELOG.md'), true)
  assert.match(read('README.md'), /Node\.js 20\+/)
  for (const scriptName of Object.keys(frontend.scripts)) {
    const command = scriptName === 'test' ? 'npm test' : `npm run ${scriptName}`
    assert.match(read('README.md'), new RegExp(escapeRegExp(command)))
  }
  for (const command of ['node server/smoke-test.mjs', 'node --test scripts/release-readiness.test.mjs']) {
    assert.match(read('README.md'), new RegExp(escapeRegExp(command)))
  }
  assert.match(read('README.md'), /PowerShell/)
  assert.match(read('README.md'), /POSIX/)
  assert.match(read('CHANGELOG.md'), new RegExp(`\\[${escapeRegExp(frontend.version)}\\]`))
  assert.match(read('CHANGELOG.md'), new RegExp(`服务端.*${escapeRegExp(server.version)}`))
  assert.match(read('CHANGELOG.md'), /LocalStore.*RemoteStore.*不自动迁移/)
  assert.match(read('CHANGELOG.md'), /混合尺寸.*确认/)
})

test('CI invokes repository contracts and existing verification commands', () => {
  assert.equal(exists('.github/workflows/ci.yml'), true)
  const workflow = read('.github/workflows/ci.yml')
  for (const command of [
    'npm ci',
    'npm --prefix server ci',
    'npm run test:unit',
    'npm run test:server',
    'node server/smoke-test.mjs',
    'node --test scripts/release-readiness.test.mjs',
    'npm run build',
    'npm run test:e2e',
  ]) assert.match(workflow, new RegExp(escapeRegExp(command)))
  assert.match(workflow, /contents:\s*read/)
  assert.match(workflow, /package-lock\.json[\s\S]*server\/package-lock\.json/)
  assert.match(workflow, /hashFiles\('test-results\/\*\*\/\*'\)/)
  assert.match(workflow, /setup-python@v5/)
  assert.match(workflow, /yaml\.safe_load/)
})

test('backend release checklists distinguish repository and deployment evidence', () => {
  const plan = read('docs/backend-plan.md')
  for (const implemented of ['密码 **bcrypt/argon2**', '`JWT_SECRET` 走环境变量', '所有草稿/图片查询', '上传校验', '注册加基础限流']) {
    assert.match(plan, new RegExp(`- \\[x\\] ${escapeRegExp(implemented)}`))
  }
  for (const deploymentOnly of ['全站 HTTPS', '`data.db` 权限 600', 'CORS:']) {
    assert.match(plan, new RegExp(`- \\[ \\] ${escapeRegExp(deploymentOnly)}`))
  }
  assert.match(plan, /实现\/配置证据.*自动化测试\/冒烟证据/)
  assert.match(plan, /\| 429 \|[^\n]*限流/)
})

test('verification report and compose smoke expose explicit execution contracts', () => {
  assert.equal(exists('docs/release-verification.md'), true)
  const report = read('docs/release-verification.md')
  for (const label of ['Release contract', 'Frontend unit', 'Backend tests', 'Backend HTTP smoke', 'Production build', 'CI YAML', 'Full E2E', 'Compose config', 'Container smoke', 'Compose cleanup']) {
    assert.match(report, new RegExp(`\\| ${escapeRegExp(label)} \\| (PASS|FAIL|NOT EXECUTED) \\|`))
  }
  const smoke = read('deploy/compose-smoke.sh')
  assert.match(smoke, /COMPOSE_SMOKE_PROJECT/)
  assert.match(smoke, /COMPOSE_SMOKE_WEB_PORT/)
  assert.match(smoke, /\/api\/health/)
})
```

Add focused assertions for the `0.10.1` date, LocalStore/RemoteStore non-migration boundary, every root npm script (including watch/headed/integration/acceptance), Docker command/health contracts, and every required verification-report row without asserting prose formatting beyond the contract.

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test scripts/release-readiness.test.mjs`

Expected: FAIL because `README.md`, `CHANGELOG.md`, `.github/workflows/ci.yml`, and `docs/release-verification.md` do not exist and the backend checklist is stale. The failure must be an assertion about missing release artifacts, not a syntax error or `ReferenceError`.

- [ ] **Step 3: Run the AGENTS.md change checklist**

Confirm helper fallbacks throw stable filesystem assertions, grep all new contract names, verify no product error/status code or runtime config changed, keep the test command documented in the plan pending README creation, keep versions unchanged for test-only infrastructure, and confirm Windows/Ubuntu path joining uses `node:path`.

- [ ] **Step 4: Commit the RED contract**

```powershell
git add scripts/release-readiness.test.mjs
git commit -m "test: define release readiness contracts"
```

### Task 2: Add README and CHANGELOG

**Files:**
- Create: `README.md`
- Create: `CHANGELOG.md`

- [ ] **Step 1: Write README as the canonical entry point**

Include:

- Product purpose and Markdown/freeform workspace distinction.
- Node.js 20+, npm, Chrome for E2E, and optional Docker requirements.
- `npm ci`, `npm run dev`, `npm run build`, and `npm run preview`.
- Separate PowerShell and POSIX examples for copying `.env.example`; keep shell-neutral npm commands single-sourced.
- LocalStore default and `VITE_API_BASE` RemoteStore boundary, explicitly stating no automatic data migration.
- Direct server mode with `npm --prefix server ci` and `npm --prefix server run dev`.
- Docker Compose setup requiring a strong `JWT_SECRET`, and links to `docs/backend-plan.md` and `docs/freeform-editor.md`.
- Every root npm script, including watch/headed entries: `npm test`, `npm run build`, `npm run dev`, `npm run preview`, `npm run test:unit`, `npm run test:unit:watch`, `npm run test:server`, `npm run test:e2e`, `npm run test:e2e:headed`, `npm run test:acceptance`, and `npm run test:integration`; also list `node server/smoke-test.mjs` and `node --test scripts/release-readiness.test.mjs`.
- Data locations, HTTPS, file permission, and backup reminders.

- [ ] **Step 2: Write CHANGELOG from repository evidence**

Create `Unreleased` and `[0.10.1] - 2026-07-20` sections. Cover the minimum Added/Changed/Fixed set from the design and explicitly state the server remains `0.2.0`, LocalStore/RemoteStore do not auto-migrate, and mixed-size export requires confirmation.

- [ ] **Step 3: Run the release contract**

Run: `node --test scripts/release-readiness.test.mjs`

Expected: README/CHANGELOG assertions pass; CI, backend checklist, verification report, and Compose-smoke contract assertions still fail.

- [ ] **Step 4: Run the AGENTS.md change checklist**

Verify every documented command/variable against package files and env templates, grep LocalStore/RemoteStore and versions repository-wide, confirm no new error/status code or runtime contract, check CHANGELOG/README synchronization, keep versions unchanged for documentation-only changes, and separately read PowerShell/POSIX blocks for executable syntax.

- [ ] **Step 5: Commit documentation entry points**

```powershell
git add README.md CHANGELOG.md
git commit -m "docs: add release entry points"
```

### Task 3: Reconcile backend checklist evidence

**Files:**
- Modify: `docs/backend-plan.md`
- Modify: `server/src/config.test.mjs`
- Modify: `server/smoke-test.mjs`

- [ ] **Step 1: Add direct automated evidence for existing security behavior**

Extend `server/src/config.test.mjs` with a child-process test that imports `config.js` under `NODE_ENV=production` and an empty `JWT_SECRET`, then requires a non-zero exit and the stable refusal message. In `server/smoke-test.mjs`, explicitly set `AUTH_RATE_LIMIT_MAX: '12'` and `MAX_UPLOAD_BYTES: '1024'` in the spawned server environment so inherited developer/CI variables cannot change the evidence. Extend the smoke without changing server runtime code:

- Inspect Alice's `pw_hash` after registration and require a bcrypt prefix plus inequality with the plaintext password.
- Extend `uploadImage` with an optional MIME argument while preserving `image/png` as the fallback. Submit a non-image MIME and require HTTP 415.
- Submit a 1025-byte PNG and require the configured single-file `MAX_UPLOAD_BYTES=1024` limit to return HTTP 413; keep the existing user-quota race as a separate assertion.
- Upload a PNG named `../../client-name.png`, then require the returned/stored basename to match the server UUID filename shape and not contain the client filename or path segments.
- After all normal auth flows, send at most 12 registration requests with unique usernames until the fixed auth limiter returns HTTP 429; fail if no 429 arrives. This directly proves the checklist's registration limit rather than relying on login behavior.

Run `npm run test:server` and `node server/smoke-test.mjs`; both must pass. These are characterization/evidence tests for already implemented behavior, not new product behavior.

- [ ] **Step 2: Confirm implementation and automated evidence before editing docs**

Run repository searches for bcrypt, production `JWT_SECRET`, user-scoped SQL, upload MIME/size handling, auth rate limiting, and their tests/smoke coverage. Keep CORS unchecked because the repository has configuration code but no direct enable/disable test. Keep HTTPS and host filesystem permissions unchecked because they are deployment responsibilities.

- [ ] **Step 3: Update checklist status and evidence note**

Add a note that `[x]` requires both implementation/configuration and automated test/smoke evidence. Immediately below the checklist add a compact evidence table with one row per checked item and explicit repository paths for both evidence types, for example `server/src/routes/auth.js` plus the real HTTP smoke test for bcrypt, and `server/src/db.js` plus `server/smoke-test.mjs` for ownership. Check bcrypt, JWT secret, ownership, the full upload-validation contract (size, MIME, randomized filename), and registration limiting. Add HTTP 429 to the documented status-code table with its authentication rate-limit meaning. Check the existing secret-template item in the open-source checklist. Leave LICENSE and `.superpowers/` review unchecked; mark README complete.

- [ ] **Step 4: Re-run the release contract**

Run: `node --test scripts/release-readiness.test.mjs`

Expected: backend checklist assertions pass; CI, verification report, and Compose-smoke contract assertions still fail.

- [ ] **Step 5: Run the AGENTS.md change checklist**

Confirm the smoke helper fallback remains stable for its default MIME, new assertions use documented status codes 413/415/429 and the existing JWT error string, grep every new evidence/config term, synchronize README/CI/backend status documentation with the added smoke entry, keep versions unchanged because runtime behavior did not change, and review Windows child-process plus Linux CI execution. Record any mismatch before committing.

- [ ] **Step 6: Commit the evidence tests and documentation correction**

```powershell
git add docs/backend-plan.md server/src/config.test.mjs server/smoke-test.mjs
git commit -m "test: document backend release evidence"
```

### Task 4: Add reusable CI

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create the workflow**

Use two jobs so the browser job has its own 15-minute budget. The static job validates both YAML parsing and repository contracts; the browser job repeats dependency installation in a clean runner and retains Playwright evidence:

```yaml
name: CI

on:
  push:
  pull_request:

permissions:
  contents: read

concurrency:
  group: ${{ github.workflow }}-${{ github.event_name }}-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true

jobs:
  static:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: |
            package-lock.json
            server/package-lock.json
      - run: npm ci
      - run: npm --prefix server ci
      - run: npm run test:unit
      - run: npm run test:server
      - run: node server/smoke-test.mjs
      - run: node --test scripts/release-readiness.test.mjs
      - run: npm run build
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - run: python -m pip install --disable-pip-version-check --no-input PyYAML==6.0.3
      - run: python -c "import pathlib, yaml; yaml.safe_load(pathlib.Path('.github/workflows/ci.yml').read_text(encoding='utf-8'))"

  browser:
    needs: static
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: |
            package-lock.json
            server/package-lock.json
      - run: npm ci
      - run: npm --prefix server ci
      - run: npx playwright install --with-deps chrome
      - run: npm run test:e2e
      - name: Upload Playwright results
        if: ${{ failure() && hashFiles('test-results/**/*') != '' }}
        uses: actions/upload-artifact@v4
        with:
          name: playwright-results
          path: test-results/
          retention-days: 7
```

Do not add a new npm script or loosen any test with `continue-on-error`.

- [ ] **Step 2: Run the release contract**

Run: `node --test scripts/release-readiness.test.mjs`

Expected: workflow assertions pass; compose-smoke override/health assertions and the missing verification report assertion remain until Task 5.

- [ ] **Step 3: Parse YAML and inspect referenced names**

Run: `python -c "import pathlib, yaml; yaml.safe_load(pathlib.Path('.github/workflows/ci.yml').read_text(encoding='utf-8'))"`

Expected: exit 0 with no YAML parser error. PyYAML is a verification-environment tool, pinned in CI and not added to the product's npm dependency graph.

Run: `git diff --check`

Run: `rg -n "test:unit|test:server|test:e2e|release-readiness|package-lock" .github/workflows/ci.yml package.json server/package.json`

Expected: every workflow command resolves to an existing script or the committed Node test.

- [ ] **Step 3a: Run the AGENTS.md change checklist**

Confirm workflow commands match package scripts, permissions and job timeouts match the design, no new runtime status/error code or product config exists, documentation mentions every new developer command, versions remain unchanged for this non-runtime change, and the Ubuntu CI environment is distinct from the Windows local baseline.

- [ ] **Step 4: Commit CI**

```powershell
git add .github/workflows/ci.yml
git commit -m "ci: add release verification workflow"
```

### Task 5: Run and record release verification

**Files:**
- Create: `docs/release-verification.md`
- Modify: `deploy/compose-smoke.sh`

- [ ] **Step 1: Create a non-claiming verification report skeleton**

Create the report before running the release contract. Include date, commit, environment, and rows for release contract, frontend unit, backend, build, E2E, YAML parsing, Compose config, container smoke, and cleanup. Initialize every result to `NOT EXECUTED`; do not pre-fill expected counts as passing results.

- [ ] **Step 2: Make the existing Compose smoke isolated and health-aware**

Update `deploy/compose-smoke.sh` so defaults remain compatible while callers can provide unique values:

```bash
PROJECT="${COMPOSE_SMOKE_PROJECT:-dinka-smoke}"
WEB_PORT="${COMPOSE_SMOKE_WEB_PORT:-8093}"
```

Replace the old 30-second container-health-only wait with a 60-second readiness loop that probes both the public homepage and `/api/health`; proceed only after the homepage is HTTP 200 with the root element and the API is HTTP 200 with JSON `{ "ok": true }`. Keep its EXIT trap and ensure every Docker command, generated container name, diagnostic path, and cleanup command uses the selected project/port. Extend the release contract test so it fails before this change and passes afterward.

- [ ] **Step 3: Run the release contract and AGENTS.md change checklist**

Run `node --test scripts/release-readiness.test.mjs`; it must pass with the report skeleton and Compose overrides present. Audit the shell-script fallback contracts, grep the new environment names repository-wide, confirm `/api/health` is an existing endpoint with the same status/body, synchronize README and verification docs, keep versions unchanged because the default smoke behavior and runtime product are unchanged, and distinguish Windows local verification from Bash/Linux CI behavior.

- [ ] **Step 4: Commit the clean verification target**

```powershell
git add scripts/release-readiness.test.mjs docs/release-verification.md deploy/compose-smoke.sh
git commit -m "test: prepare local release verification"
git status --short --branch
git rev-parse HEAD
```

Expected: the worktree is clean. Save this HEAD as the report's `Commit under test`; subsequent evidence commands run against this committed snapshot, and the final report is committed separately.

- [ ] **Step 5: Run fast repository verification and update the report**

Run:

```powershell
node --test scripts/release-readiness.test.mjs
npm run test:unit
npm run test:server
node server/smoke-test.mjs
npm run build
python -c "import pathlib, yaml; yaml.safe_load(pathlib.Path('.github/workflows/ci.yml').read_text(encoding='utf-8'))"
```

Expected: all commands exit 0. Record actual counts and bundle output, not fixed expected values, in the report.

- [ ] **Step 6: Distinguish Docker CLI, Compose, and daemon states**

Use these separate checks in PowerShell:

```powershell
$docker = Get-Command docker -ErrorAction SilentlyContinue
docker compose version
docker info --format '{{.ServerVersion}}'
```

If `Get-Command` fails, record CLI/Compose/config/smoke as `NOT EXECUTED`. If `docker compose version` fails, record Compose/config/smoke as `NOT EXECUTED`. `docker compose config` does not require a running daemon, so a failed `docker info` skips only container smoke, not config validation.

- [ ] **Step 7: Validate Compose config with an isolated name**

Generate `$project = "rednote-release-smoke-$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"`. Generate a candidate port between 18080 and 18999 and reject it if `Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue` finds a listener. Check project-name collision without parsing Compose by requiring `docker ps -a --filter "label=com.docker.compose.project=$project" --format '{{.ID}}'` to be empty when the daemon is available; a timestamp collision generates a new suffix. Write a temporary env file containing only a non-production `JWT_SECRET` and selected `WEB_PORT`, run `docker compose -p $project --env-file $envFile config`, require exit 0, and assert the parsed text contains both `server:` and `web:` services. Remove the temporary env file in a `finally` block. If the daemon is unavailable, skip only the collision query and container smoke; still run config validation.

- [ ] **Step 8: Run isolated container smoke when the daemon and Bash are available**

Check `Get-Command bash`. Set `COMPOSE_SMOKE_PROJECT=$project` and `COMPOSE_SMOKE_WEB_PORT=$port`, then run `bash deploy/compose-smoke.sh`. The script itself requires the 60-second homepage/API readiness gate, auth, upload, static image serving, and cleanup. After it exits, require exit 0 and verify `docker ps -a --filter "label=com.docker.compose.project=$project" --format '{{.ID}}'` is empty. Also query `docker network ls --filter label=com.docker.compose.project=$project` and `docker volume ls --filter label=com.docker.compose.project=$project`; both must be empty. These label queries do not parse Compose or require `JWT_SECRET`. If daemon or Bash is unavailable, record container smoke `NOT EXECUTED` while preserving the independent config result.

- [ ] **Step 9: Run complete browser verification**

Run: `npm run test:e2e`

Expected: all E2E and acceptance tests pass. Allow at least 10 minutes because the suite is serial; record the actual count and duration.

- [ ] **Step 10: Finalize the verification report**

Document date, commit under test, commands, exit status, actual test counts, build bundle sizes/warnings, Docker CLI/Compose/engine status, HTTP health results if executed, and cleanup confirmation. Distinguish `PASS`, `FAIL`, and `NOT EXECUTED`.

- [ ] **Step 11: Make the release contract GREEN**

Run: `node --test scripts/release-readiness.test.mjs`

Expected: all release-readiness tests pass.

- [ ] **Step 12: Run the report AGENTS.md change checklist**

Confirm report statuses match actual command exit codes, command/config names match definitions, no new status code was introduced after Task 3 documentation, README and report remain synchronized, versions are unchanged, and Windows/Docker/Bash outcomes are clearly separated.

- [ ] **Step 13: Commit verification evidence**

```powershell
git add docs/release-verification.md
git commit -m "test: record local release verification"
```

### Task 6: Final audit and local merge

**Files:**
- Verify all changed files above.

- [ ] **Step 1: Run final AGENTS.md contract audit**

Repeat the checklist across the combined diff: functions/contracts, new names repository-wide, status/error codes, documentation synchronization, versions, and multiple environments. Confirm no runtime API, product status/error code, or product behavior was added. The two `COMPOSE_SMOKE_*` names are test-only overrides documented in the script and verification report, so frontend `0.10.1` and server `0.2.0` remain correct.

- [ ] **Step 2: Run final fresh verification**

Run:

```powershell
node --test scripts/release-readiness.test.mjs
npm run test:unit
npm run test:server
node server/smoke-test.mjs
npm run build
npm run test:e2e
git diff --check master...HEAD
git status --short --branch
```

Expected: all tests/build pass, diff check is clean, and only intended commits exist. Remove generated `test-results/` if untracked; do not touch root `.claude/`.

- [ ] **Step 3: Review commit range**

Run: `git log --oneline master..HEAD`

Run: `git diff --stat master...HEAD`

Expected: changes are limited to design/plan, README, CHANGELOG, backend documentation/evidence tests, CI, release contract test, the existing Compose smoke helper, and verification report.

- [ ] **Step 4: Fast-forward local master**

After verification and review, return to `D:\New_god\rednote` and run `git merge --ff-only chore/release-readiness`. Do not add a remote, push, tag, or modify `.claude/`.
