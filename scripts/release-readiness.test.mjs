import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8')
const exists = (relative) => fs.existsSync(path.join(root, relative))
const frontend = JSON.parse(read('package.json'))
const server = JSON.parse(read('server/package.json'))
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function composeServiceNames(source) {
  const lines = source.split(/\r?\n/)
  const servicesIndex = lines.findIndex((line) => /^services:\s*$/.test(line))
  assert.notEqual(servicesIndex, -1, 'compose file must define services')

  const names = []
  for (const line of lines.slice(servicesIndex + 1)) {
    if (/^[^\s#]/.test(line)) break
    const match = line.match(/^  ([A-Za-z0-9_-]+):\s*$/)
    if (match) names.push(match[1])
  }
  return names
}

function workflowJob(source, jobName) {
  const lines = source.split(/\r?\n/)
  const start = lines.findIndex((line) => line === `  ${jobName}:`)
  assert.notEqual(start, -1, `workflow must define the ${jobName} job`)

  const endOffset = lines.slice(start + 1).findIndex((line) => /^  [A-Za-z0-9_-]+:\s*$/.test(line))
  const end = endOffset === -1 ? lines.length : start + 1 + endOffset
  return lines.slice(start, end).join('\n')
}

test('release entry documentation matches current versions and commands', () => {
  assert.equal(exists('README.md'), true, 'README.md must exist')
  assert.equal(exists('CHANGELOG.md'), true, 'CHANGELOG.md must exist')

  const readme = read('README.md')
  const changelog = read('CHANGELOG.md')
  assert.equal(exists('public/favicon.svg'), true, 'README header favicon must exist')
  assert.match(readme, /public\/favicon\.svg/)
  assert.match(readme, new RegExp(`version-${escapeRegExp(frontend.version)}`))
  assert.match(readme, /actions\/workflows\/ci\.yml\/badge\.svg/)
  assert.match(readme, /Node\.js 20\+/)
  for (const scriptName of Object.keys(frontend.scripts)) {
    const command = scriptName === 'test' ? 'npm test' : `npm run ${scriptName}`
    assert.match(readme, new RegExp(escapeRegExp(command)), `README must document ${command}`)
  }
  for (const command of [
    'node server/smoke-test.mjs',
    'node --test scripts/release-readiness.test.mjs',
  ]) {
    assert.match(readme, new RegExp(escapeRegExp(command)), `README must document ${command}`)
  }
  assert.match(readme, /PowerShell/)
  assert.match(readme, /POSIX/)
  assert.match(readme, /--strictPort/)
  assert.match(readme, /VITE_API_BASE/)
  assert.match(readme, /LocalStore[\s\S]*RemoteStore[\s\S]*不(?:会|自动)迁移/)

  assert.match(changelog, new RegExp(`\\[${escapeRegExp(frontend.version)}\\] - 2026-07-20`))
  assert.match(changelog, new RegExp(`服务端[^\n]*${escapeRegExp(server.version)}`))
  assert.match(changelog, /LocalStore[^\n]*RemoteStore[^\n]*不自动迁移/)
  assert.match(changelog, /混合尺寸[^\n]*确认/)
})

test('CI invokes repository contracts and existing verification commands', () => {
  assert.equal(exists('.github/workflows/ci.yml'), true, 'CI workflow must exist')
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
  ]) {
    assert.match(workflow, new RegExp(escapeRegExp(command)), `CI must run ${command}`)
  }
  assert.match(workflow, /contents:\s*read/)
  assert.match(workflow, /package-lock\.json[\s\S]*server\/package-lock\.json/)
  assert.match(workflow, /hashFiles\('test-results\/\*\*\/\*'\)/)
  assert.match(workflow, /setup-python@v5/)
  assert.match(workflow, /yaml\.safe_load/)
  assert.match(workflow, /timeout-minutes:\s*15/)
})

test('tag releases publish and anonymously verify the multi-architecture GHCR image', () => {
  assert.equal(
    exists('.github/workflows/publish-image.yml'),
    true,
    'container publishing workflow must exist',
  )

  const workflow = read('.github/workflows/publish-image.yml')
  assert.match(workflow, /^on:\s*\n\s{2}push:\s*\n\s{4}tags:\s*\n\s{6}- ['"]v\*['"]\s*$/m)
  assert.doesNotMatch(workflow, /branches:/)
  for (const permission of ['contents: read', 'packages: write', 'id-token: write', 'attestations: write']) {
    assert.match(workflow, new RegExp(escapeRegExp(permission)))
  }

  const publish = workflowJob(workflow, 'publish')
  assert.match(
    publish,
    new RegExp(
      escapeRegExp(
        '^v(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(-[0-9A-Za-z-]+(\\.[0-9A-Za-z-]+)*)?$',
      ),
    ),
  )
  assert.match(publish, /Invalid release tag[\s\S]*exit 1/)
  assert.match(publish, /image:\s*\$\{\{ steps\.version\.outputs\.image \}\}/)
  assert.match(publish, /version:\s*\$\{\{ steps\.version\.outputs\.version \}\}/)
  assert.match(publish, /ghcr\.io\/lottshin\/dingcard/)
  for (const action of [
    'actions/checkout@v7',
    'docker/setup-qemu-action@v4',
    'docker/setup-buildx-action@v4',
    'docker/login-action@v4',
    'docker/metadata-action@v6',
    'docker/build-push-action@v7',
  ]) {
    assert.match(publish, new RegExp(escapeRegExp(action)), `publish job must use ${action}`)
  }
  assert.match(publish, /password:\s*\$\{\{ secrets\.GITHUB_TOKEN \}\}/)
  assert.match(publish, /platforms:\s*linux\/amd64,linux\/arm64/)
  assert.match(publish, /type=semver,pattern=\{\{version\}\}/)
  assert.match(publish, /type=semver,pattern=\{\{major\}\}\.\{\{minor\}\}/)
  assert.match(publish, /type=sha/)
  assert.match(publish, /type=raw,value=latest,enable=\$\{\{ steps\.version\.outputs\.stable == 'true' \}\}/)
  for (const label of [
    'org.opencontainers.image.source',
    'org.opencontainers.image.revision',
    'org.opencontainers.image.version',
    'org.opencontainers.image.licenses',
  ]) {
    assert.match(publish, new RegExp(escapeRegExp(label)), `publish job must set ${label}`)
  }
  assert.match(publish, /sbom:\s*true/)
  assert.match(publish, /provenance:\s*mode=max/)
  assert.match(publish, /cache-from:\s*type=gha/)
  assert.match(publish, /cache-to:\s*type=gha,mode=max/)
  assert.match(publish, /docker buildx imagetools inspect[\s\S]*--raw[\s\S]*jq -e/)
  assert.match(publish, /platform\.architecture == "amd64"/)
  assert.match(publish, /platform\.architecture == "arm64"/)

  const smoke = workflowJob(workflow, 'smoke')
  assert.match(smoke, /needs:\s*publish/)
  assert.match(smoke, /fail-fast:\s*false/)
  assert.match(smoke, /platform:\s*linux\/amd64/)
  assert.match(smoke, /platform:\s*linux\/arm64/)
  assert.match(smoke, /docker\/setup-qemu-action@v4/)
  assert.doesNotMatch(smoke, /docker\/login-action|GITHUB_TOKEN|password:/)
  assert.match(smoke, /docker logout ghcr\.io/)
  assert.match(smoke, /docker pull --platform "\$PLATFORM" "\$IMAGE:\$VERSION"/)
  assert.match(smoke, /docker run[\s\S]*-p 127\.0\.0\.1::3000/)
  assert.match(smoke, /docker port "\$CONTAINER_NAME" 3000\/tcp/)
  assert.match(smoke, /"\$BASE_URL\/"/)
  assert.match(smoke, /"\$BASE_URL\/api\/health"/)
  assert.match(smoke, /\/assets\//)
  assert.match(smoke, /if:\s*\$\{\{ always\(\) \}\}/)
  assert.match(smoke, /docker rm -f "\$CONTAINER_NAME"/)
  assert.match(smoke, /docker image rm "\$IMAGE:\$VERSION"/)
})

test('deployment documentation keeps the shortest safe Docker path', () => {
  assert.equal(exists('docs/deployment.md'), true, 'deployment guide must exist')

  const readme = read('README.md')
  for (const entry of [
    '在线 Demo',
    'Vercel',
    'git clone https://github.com/lottshin/DingCard.git',
    'docker compose config --quiet',
    'docker compose up -d --build',
    'curl -f http://127.0.0.1:8080/api/health',
    'docs/deployment.md',
  ]) {
    assert.match(readme, new RegExp(escapeRegExp(entry)), `README must keep ${entry}`)
  }

  const deployment = read('docs/deployment.md')
  for (const entry of [
    'JWT_SECRET',
    'WEB_PORT=127.0.0.1:8080',
    'docker compose config --quiet',
    'host_ip: 127.0.0.1',
    'Caddyfile',
    'Nginx',
    'db.tar.gz',
    'uploads.tar.gz',
    '输入 RESTORE',
    'git pull --ff-only',
    'docker compose down -v',
    'docker compose up -d --build app',
    'docker compose logs --tail=100 app',
    'docker compose up -d --force-recreate app',
    'docker compose ps --all -q app',
    'APP_ID',
  ]) {
    assert.match(deployment, new RegExp(escapeRegExp(entry)), `deployment guide must keep ${entry}`)
  }
  assert.match(deployment, /Docker Compose[^\n]*`app`[^\n]*容器/)
  assert.match(deployment, /Fastify[^\n]*前端[^\n]*`\/uploads`[^\n]*`\/api`/)
  assert.match(deployment, /`db`[^\n]*SQLite/)
  assert.match(deployment, /`uploads`[^\n]*上传/)
  assert.match(deployment, /proxy_pass http:\/\/127\.0\.0\.1:8080/)
  assert.doesNotMatch(deployment, /docker compose logs[^\n]*(?:\bserver\b|\bweb\b)/)
  assert.doesNotMatch(deployment, /docker compose ps[^\n]*-q server/)
  assert.doesNotMatch(deployment, /docker compose up[^\n]*(?:\bserver\b|\bweb\b)/)
  assert.doesNotMatch(deployment, /\bSERVER_ID\b/)
  assert.doesNotMatch(deployment, /deploy\/nginx\.conf/)
  assert.doesNotMatch(deployment, /MAX_UPLOAD_BYTES[^\n]*(?:Nginx|client_max_body_size)/i)
  assert.doesNotMatch(deployment, /\/api\/health[^\n]*502[^\n]*server/i)
  assert.doesNotMatch(deployment, /Docker Compose[^\n]*两个容器/)

  const envExample = read('.env.example')
  assert.match(envExample, /127\.0\.0\.1:8080/)

  const backendPlan = read('docs/backend-plan.md')
  assert.match(backendPlan, /Docker 部署与维护.*deployment\.md/)
})

test('backend release checklists distinguish repository and deployment evidence', () => {
  const plan = read('docs/backend-plan.md')
  for (const implemented of [
    '密码 **bcrypt/argon2**',
    '`JWT_SECRET` 走环境变量且生产环境非空',
    '所有草稿/图片查询',
    '上传校验',
    '注册加基础限流',
  ]) {
    assert.match(plan, new RegExp(`- \\[x\\] ${escapeRegExp(implemented)}`))
  }
  for (const deploymentOnly of [
    '`JWT_SECRET` 使用足够随机的生产密钥',
    '全站 HTTPS',
    '`data.db` 权限 600',
    'CORS:',
  ]) {
    assert.match(plan, new RegExp(`- \\[ \\] ${escapeRegExp(deploymentOnly)}`))
  }
  assert.match(plan, /实现\/配置证据[^\n]*自动化测试\/冒烟证据/)
  assert.match(plan, /\| 429 \|[^\n]*限流/)
})

test('verification report and compose smoke expose explicit execution contracts', () => {
  assert.equal(exists('docs/release-verification.md'), true, 'verification report must exist')
  const report = read('docs/release-verification.md')
  for (const label of [
    'Release contract',
    'Frontend unit',
    'Backend tests',
    'Backend HTTP smoke',
    'Production build',
    'CI YAML',
    'Full E2E',
    'Compose config',
    'Container smoke',
    'Compose cleanup',
  ]) {
    assert.match(
      report,
      new RegExp(`\\| ${escapeRegExp(label)} \\| (PASS|FAIL|NOT EXECUTED) \\|`),
      `verification report must contain a status row for ${label}`,
    )
  }
  assert.match(report, /\| Release contract \| PASS \|[^\n]*9\/9/)
  assert.match(report, /\| Compose config \| PASS \|[^\n]*`app`/)
  assert.match(
    report,
    /\| Container smoke \| PASS \|[^\n]*`app`[^\n]*Fastify[^\n]*首页[^\n]*`\/api\/health`[^\n]*注册[^\n]*上传[^\n]*`\/assets\//,
  )
  assert.match(report, /\| Compose cleanup \| PASS \|[^\n]*smoke[^\n]*镜像标签[^\n]*不存在/)
  assert.doesNotMatch(report, /\| Compose config \| PASS \|[^\n]*(?:`server`|`web`)/)
  assert.doesNotMatch(report, /\| Container smoke \| PASS \|[^\n]*Nginx/)
  assert.match(report, /Docker daemon 29\.1\.2[^\n]*可用/)
  assert.match(report, /Commit under test：`8169480`/)

  const smoke = read('deploy/compose-smoke.sh')
  assert.match(smoke, /COMPOSE_SMOKE_PROJECT/)
  assert.match(smoke, /COMPOSE_SMOKE_WEB_PORT/)
  assert.match(smoke, /\/api\/health/)
  assert.match(smoke, /command -v cygpath/)
  assert.match(smoke, /SECONDS \+ 60/)
  assert.match(smoke, /--connect-timeout/)
  assert.match(smoke, /Compose 资源清理失败/)

  const backendSmoke = read('server/smoke-test.mjs')
  assert.match(backendSmoke, /RATE_LIMIT_MAX: '300'/)
  assert.match(backendSmoke, /x-ratelimit-limit/)
})

test('compose packages the release as one pinned app service', () => {
  const compose = read('docker-compose.yml')

  assert.deepEqual(composeServiceNames(compose), ['app'])
  assert.match(compose, /image:\s*ghcr\.io\/lottshin\/dingcard:\$\{DINGCARD_VERSION:-0\.11\.0\}/)
  assert.match(compose, /build:\s*\n\s+context:\s*\.\s*\n\s+args:\s*\n\s+VITE_API_BASE:\s*\/\s*$/m)
  assert.match(compose, /JWT_SECRET:\s*\$\{JWT_SECRET:\?[^}]+\}/)
  assert.match(compose, /NODE_ENV:\s*production/)
  assert.match(compose, /DINGCARD_IMAGE:\s*["']?1["']?/)
  assert.match(compose, /HOST:\s*0\.0\.0\.0/)
  assert.match(compose, /PORT:\s*["']?3000["']?/)
  assert.match(compose, /DATA_DIR:\s*\/data/)
  assert.match(compose, /WEB_ROOT:\s*\/app\/dist/)
  for (const setting of [
    'JWT_EXPIRY',
    'RATE_LIMIT_MAX',
    'AUTH_RATE_LIMIT_MAX',
    'USER_QUOTA_BYTES',
    'IMAGE_LEASE_MS',
    'MAX_UPLOAD_BYTES',
  ]) {
    assert.match(compose, new RegExp(`\\b${setting}:`), `compose must preserve ${setting}`)
  }
  assert.match(compose, /-\s*db:\/data(?:\s|$)/)
  assert.match(compose, /-\s*uploads:\/data\/uploads(?:\s|$)/)
  assert.match(compose, /-\s*["']?\$\{WEB_PORT:-8080\}:3000["']?/)
  assert.doesNotMatch(compose, /depends_on:|expose:/)
})

test('root Dockerfile builds the frontend and server into a non-root Node image', () => {
  const dockerfile = read('Dockerfile')

  assert.deepEqual(
    [...dockerfile.matchAll(/^FROM\s+\S+(?:\s+AS\s+(\S+))?/gim)].map((match) => match[1]),
    ['frontend-build', 'server-deps', 'final'],
  )
  assert.match(dockerfile, /^FROM node:20-slim AS final$/m)
  assert.match(dockerfile, /^ARG VITE_API_BASE=\/$/m)
  assert.match(dockerfile, /^ENV VITE_API_BASE=\$VITE_API_BASE$/m)
  assert.match(dockerfile, /COPY package\.json package-lock\.json \.\//)
  assert.match(dockerfile, /RUN npm ci\s*$/m)
  const frontendStage = dockerfile.split(/^FROM node:20-slim AS server-deps$/m)[0]
  assert.doesNotMatch(frontendStage, /^COPY \. \.\s*$/m)
  assert.match(frontendStage, /COPY tsconfig\.json tsconfig\.node\.json vite\.config\.ts index\.html \.\//)
  assert.match(frontendStage, /COPY public \.\/public/)
  assert.match(frontendStage, /COPY src \.\/src/)
  assert.match(dockerfile, /RUN npm ci --omit=dev\s*$/m)
  assert.match(dockerfile, /COPY server\/package\.json server\/package-lock\.json \.\//)
  assert.match(dockerfile, /COPY server\/src \.\/server\/src/)
  assert.match(dockerfile, /COPY --from=server-deps \/app\/server\/node_modules \.\/server\/node_modules/)
  assert.match(dockerfile, /COPY --from=frontend-build \/app\/dist \.\/dist/)
  for (const setting of [
    'NODE_ENV=production',
    'DINGCARD_IMAGE=1',
    'HOST=0.0.0.0',
    'PORT=3000',
    'DATA_DIR=/data',
    'WEB_ROOT=/app/dist',
  ]) {
    assert.match(dockerfile, new RegExp(escapeRegExp(setting)), `Dockerfile must set ${setting}`)
  }
  assert.match(dockerfile, /RUN mkdir -p \/data(?:\/uploads)?[\s\S]*chown[^\n]*node:node \/data/)
  assert.match(dockerfile, /^WORKDIR \/app\/server$/m)
  assert.match(dockerfile, /^USER node$/m)
  assert.match(dockerfile, /^EXPOSE 3000$/m)
  assert.match(dockerfile, /HEALTHCHECK[\s\S]*127\.0\.0\.1:3000\/api\/health/)
  assert.match(dockerfile, /CMD \["node", "src\/index\.js"\]/)
  assert.doesNotMatch(dockerfile, /nginx/i)

  assert.equal(exists('server/Dockerfile'), false, 'server/Dockerfile must be removed')
  assert.equal(exists('deploy/nginx.conf'), false, 'deploy/nginx.conf must be removed')
})

test('Docker build context contains required sources but excludes local state', () => {
  const dockerignore = read('.dockerignore')
  const patterns = dockerignore
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))

  assert.equal(patterns.includes('server'), false, 'server source must remain in the root build context')
  assert.equal(patterns.includes('server/'), false, 'server source must remain in the root build context')
  for (const required of [
    'node_modules',
    '**/node_modules',
    'server/data',
    'data',
    'e2e',
    'e2e-integration',
    'docs',
    '.git',
    '.worktrees',
  ]) {
    assert.equal(patterns.includes(required), true, `.dockerignore must exclude ${required}`)
  }
  for (const requiredSource of [
    'public',
    'src',
    'index.html',
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'tsconfig.node.json',
    'vite.config.ts',
  ]) {
    assert.equal(patterns.includes(requiredSource), false, `${requiredSource} is required to build the image`)
  }
  assert.match(dockerignore, /(?:^|\n)e2e(?:\r?\n|$)/)
  assert.match(dockerignore, /(?:^|\n)\.env(?:\r?\n|$)/)
  assert.match(dockerignore, /\*\.log/)
})

test('compose smoke validates the app container without generated-name assumptions', () => {
  const smoke = read('deploy/compose-smoke.sh')

  assert.match(smoke, /SMOKE_VERSION="smoke-\$\{PROJECT\}"/)
  const composeCommands = smoke
    .split(/\r?\n/)
    .filter((line) => /\bdocker compose -p\b/.test(line))
  assert.equal(composeCommands.length, 3, 'smoke must have only up/down/ps Compose calls')
  for (const command of composeCommands) {
    assert.match(command, /DINGCARD_VERSION="\$SMOKE_VERSION"/)
  }
  assert.match(smoke, /SMOKE_IMAGE="ghcr\.io\/lottshin\/dingcard:\$SMOKE_VERSION"/)
  assert.match(smoke, /if docker image inspect "\$SMOKE_IMAGE"/)
  assert.match(smoke, /if ! docker image rm "\$SMOKE_IMAGE"/)
  assert.match(smoke, /Smoke image cleanup failed/)
  assert.doesNotMatch(smoke, /docker image rm[^\n]*\|\| true/)
  assert.doesNotMatch(smoke, /DINGCARD_VERSION=["']?0\.11\.0/)
  assert.match(smoke, /docker compose[^\n]*up -d --build/)
  assert.match(smoke, /docker compose[^\n]*ps -q app/)
  assert.match(smoke, /APP_ID=\$\(/)
  assert.match(smoke, /docker exec "?\$APP_ID"?/)
  assert.match(smoke, /docker logs "?\$APP_ID"?/)
  assert.match(smoke, /<div id=["']root["']>/)
  assert.match(smoke, /\/api\/health/)
  assert.match(smoke, /\/api\/auth\/register/)
  assert.match(smoke, /\/api\/images/)
  assert.match(smoke, /\/assets\//)
  assert.match(smoke, /down -v --remove-orphans/)
  assert.doesNotMatch(smoke, /nginx/i)
  assert.doesNotMatch(smoke, /\$\{PROJECT\}-(?:server|app|web)-1/)
  assert.doesNotMatch(smoke, /ps -q (?:server|web)(?:\s|$)/)
})
