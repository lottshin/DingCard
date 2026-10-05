import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8')
const exists = (relative) => fs.existsSync(path.join(root, relative))
const frontend = JSON.parse(read('package.json'))
const frontendLock = JSON.parse(read('package-lock.json'))
const server = JSON.parse(read('server/package.json'))
const serverLock = JSON.parse(read('server/package-lock.json'))
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function markdownSection(source, heading) {
  const lines = source.split(/\r?\n/)
  const start = lines.findIndex((line) => line === `## ${heading}`)
  assert.notEqual(start, -1, `document must contain the ${heading} section`)
  const endOffset = lines.slice(start + 1).findIndex((line) => /^## /.test(line))
  const end = endOffset === -1 ? lines.length : start + 1 + endOffset
  return lines.slice(start, end).join('\n')
}

function fencedCodeBlocks(source) {
  return [...source.matchAll(/```[^\n]*\r?\n([\s\S]*?)```/g)].map((match) => match[1].trim())
}

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
  assert.equal(exists('LICENSE'), true, 'MIT LICENSE must exist')

  const readme = read('README.md')
  const changelog = read('CHANGELOG.md')
  const backendPlan = read('docs/backend-plan.md')
  const releaseNotes = markdownSection(changelog, '[0.24.0] - 2026-10-05')
  const license = read('LICENSE')
  assert.equal(frontend.version, '0.24.0')
  assert.equal(frontendLock.version, '0.24.0')
  assert.equal(frontendLock.packages[''].version, '0.24.0')
  assert.equal(server.version, '0.3.0')
  assert.equal(serverLock.version, '0.3.0')
  assert.equal(serverLock.packages[''].version, '0.3.0')
  assert.equal(exists('public/favicon.svg'), true, 'README header favicon must exist')
  assert.match(readme, /public\/favicon\.svg/)
  assert.match(readme, /version-0\.24\.0/)
  assert.match(readme, /编辑档案[\s\S]*公共剧场[\s\S]*议题封面/)
  assert.match(readme, /自由画布[\s\S]*八套/)
  assert.match(readme, /独立图片[\s\S]*裁剪[\s\S]*八个黑柄/)
  assert.match(backendPlan, /当前源码版本：前端 `0\.24\.0`，后端 `0\.3\.0`/)
  assert.match(readme, /actions\/workflows\/ci\.yml\/badge\.svg/)
  assert.match(readme, /Node\.js 22\+/)
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

  assert.match(releaseNotes, /AI 能接着做人在编辑器里存的作品了/)
  assert.match(releaseNotes, /`list_server_projects`[^\n]*`open_server_project`/)
  assert.match(releaseNotes, /分享出去的网页更好用了[^\n]*「保存这张」/)
  assert.match(releaseNotes, /镜像随 `v0\.24\.0` 标签发布/)
  assert.match(releaseNotes, /GHCR[^\n]*`0.23\.0`/)
  assert.match(releaseNotes, /LocalStore[^\n]*RemoteStore[^\n]*不自动迁移/)
  assert.match(changelog, /混合尺寸[^\n]*确认/)
  assert.match(license, /MIT License/)
  assert.match(license, /Copyright \(c\) 2026 lottshin/)
  assert.match(license, /Permission is hereby granted, free of charge/)
})

test('MCP automation package stays documented, versioned, and tested', () => {
  assert.equal(exists('mcp/package.json'), true, 'mcp package manifest must exist')
  assert.equal(exists('mcp/package-lock.json'), true, 'mcp lockfile must be committed')
  assert.equal(exists('mcp/tsconfig.json'), true, 'mcp TypeScript config must exist')
  assert.equal(exists('docs/mcp.md'), true, 'MCP user documentation must exist')

  const mcp = JSON.parse(read('mcp/package.json'))
  assert.equal(mcp.name, 'dingcard-mcp')
  assert.equal(mcp.version, '0.24.0')
  assert.equal(mcp.private, true, 'mcp package stays private (no npm publish)')
  for (const scriptName of Object.keys(mcp.scripts)) {
    assert.equal(typeof mcp.scripts[scriptName], 'string')
  }
  assert.match(mcp.scripts.build, /tsc -p tsconfig\.json/)
  assert.match(mcp.scripts.build, /esbuild/)
  assert.match(
    mcp.scripts.build,
    /outfile=dist\/render\.mjs --external:playwright-core/,
    'mcp build bundles the server render library (dist/render.mjs)',
  )
  assert.equal(
    mcp.files.includes('dist/render.mjs'), true, 'dist/render.mjs ships in the package')
  assert.match(mcp.scripts.start, /node dist\/index\.mjs/)
  assert.match(mcp.scripts.test, /vitest/)
  assert.equal(
    mcp.dependencies['@modelcontextprotocol/sdk'] !== undefined, true, 'SDK must be a runtime dep')
  assert.equal(
    mcp.dependencies['playwright-core'] !== undefined, true, 'playwright-core must be a runtime dep')
  assert.equal(
    mcp.dependencies.playwright === undefined, true, 'mcp must not depend on full playwright (no browser downloads)')

  const mcpReadme = read('docs/mcp.md')
  for (const entry of [
    'list_templates',
    'create_document_from_template',
    'create_document_from_outline',
    'validate_document',
    'inspect_document',
    'apply_actions',
    'render_document',
    'render_markdown',
    'share_document',
    'list_shares',
    'revoke_share',
    'list_server_projects',
    'open_server_project',
    'DINGCARD_SERVER_URL',
    'DINGCARD_SERVER_TOKEN',
    'dingcard://schema/freeform',
    'DINGCARD_DIST_DIR',
    '127.0.0.1',
  ]) {
    assert.match(mcpReadme, new RegExp(escapeRegExp(entry)), `docs/mcp.md must document ${entry}`)
  }
  const readme = read('README.md')
  assert.match(readme, /MCP 自动化/, 'README must introduce the MCP surface')
  assert.match(readme, /npm --prefix mcp ci/)
  assert.match(readme, /docs\/mcp\.md/)
  assert.match(readme, /渲染管线测试/)
})

test('CI invokes repository contracts and existing verification commands', () => {  assert.equal(exists('.github/workflows/ci.yml'), true, 'CI workflow must exist')
  const workflow = read('.github/workflows/ci.yml')
  for (const command of [
    'npm ci',
    'npm --prefix server ci',
    'npm --prefix mcp ci',
    'npm run test:unit',
    'npm run test:server',
    'node server/smoke-test.mjs',
    'node --test scripts/release-readiness.test.mjs',
    'bash deploy/compose-smoke.sh',
    'npm run build',
    'npm --prefix mcp run build',
    'npm --prefix mcp test',
    'npm --prefix mcp run test:render',
    'npm run test:e2e',
  ]) {
    assert.match(workflow, new RegExp(escapeRegExp(command)), `CI must run ${command}`)
  }
  assert.match(workflow, /contents:\s*read/)
  assert.match(workflow, /package-lock\.json[\s\S]*server\/package-lock\.json[\s\S]*mcp\/package-lock\.json/)
  assert.match(workflow, /hashFiles\('test-results\/\*\*\/\*'\)/)
  for (const action of [
    'actions/checkout@v7',
    'actions/setup-node@v7',
    'actions/setup-python@v7',
  ]) {
    assert.match(workflow, new RegExp(escapeRegExp(action)), `CI must use ${action}`)
  }
  assert.match(workflow, /yaml\.safe_load/)
  assert.match(workflow, /pathlib\.Path\('\.github\/workflows'\)\.glob\('\*\.yml'\)/)
  assert.match(workflow, /publish-image\.yml/)
  assert.match(workflow, /^  static:\n    runs-on: ubuntu-latest\n    timeout-minutes: 10$/m)
  assert.match(workflow, /^  browser:\n    needs: static\n    runs-on: ubuntu-latest\n    timeout-minutes: 20$/m)
  assert.match(workflow, /^  container:\n    needs: static\n    runs-on: ubuntu-latest\n    timeout-minutes: 15$/m)
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
  const workflowPreamble = workflow.split(/^jobs:\s*$/m)[0]
  assert.match(workflowPreamble, /^permissions:\s*\n\s{2}contents:\s*read\s*$/m)
  assert.doesNotMatch(workflowPreamble, /packages:\s*write|id-token:\s*write|attestations:\s*write/)

  const publish = workflowJob(workflow, 'publish')
  for (const permission of ['contents: read', 'packages: write', 'id-token: write', 'attestations: write']) {
    assert.match(publish, new RegExp(escapeRegExp(permission)), `publish job must grant ${permission}`)
  }
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
  assert.match(publish, /docker logout ghcr\.io/)
  assert.match(publish, /https:\/\/ghcr\.io\/v2\/lottshin\/dingcard\/manifests\/\$VERSION/)
  assert.match(publish, /application\/vnd\.oci\.image\.index\.v1\+json/)
  assert.match(publish, /application\/vnd\.docker\.distribution\.manifest\.list\.v2\+json/)
  assert.match(publish, /curl[\s\S]*--request GET[\s\S]*HTTP_STATUS/)
  assert.match(publish, /HTTP_STATUS[\s\S]*2\*/)
  assert.match(publish, /public[\s\S]*rerun/i)
  const publicManifestCheck = publish.slice(publish.indexOf('      - name: Verify public manifest access'))
  assert.doesNotMatch(publicManifestCheck, /GITHUB_TOKEN|secrets\.|docker\/login-action/)

  const smoke = workflowJob(workflow, 'smoke')
  assert.match(smoke, /permissions:\s*\{\}/)
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
    'cp .env.example .env',
    'openssl rand -hex 32',
    'DINGCARD_VERSION=0.23.0',
    'docker compose pull',
    'docker compose up -d --no-build',
    'curl -f http://127.0.0.1:8080/api/health',
    'docs/deployment.md',
  ]) {
    assert.match(readme, new RegExp(escapeRegExp(entry)), `README must keep ${entry}`)
  }
  const readmeDeploy = markdownSection(readme, '使用与部署')
  assert.doesNotMatch(readmeDeploy, /docker compose (?:config|ps)|docker compose up[^\n]*--build/)

  const deployment = read('docs/deployment.md')
  for (const entry of [
    'JWT_SECRET',
    'DINGCARD_VERSION=0.23.0',
    'WEB_PORT=127.0.0.1:8080',
    'docker compose config --quiet',
    'docker compose pull',
    'docker compose up -d --no-build',
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

  const firstDeploy = markdownSection(deployment, '首次部署')
  const restore = markdownSection(deployment, '恢复备份')
  const upgrade = markdownSection(deployment, '升级')
  const sourceBuild = markdownSection(deployment, '从源码构建')
  const legacyShutdown = 'docker compose down --remove-orphans'
  assert.match(upgrade, new RegExp(`^${escapeRegExp(legacyShutdown)}$`, 'm'))
  assert.ok(
    upgrade.indexOf(legacyShutdown) < upgrade.indexOf('git pull --ff-only'),
    'the legacy stack must stop before the Compose definition changes',
  )
  assert.doesNotMatch(upgrade, /^docker compose down[^\n]*(?:\s-v(?:\s|$)|--volumes)/m)
  for (const section of [firstDeploy, upgrade]) {
    assert.match(section, /docker compose pull/)
    assert.match(section, /docker compose up -d --no-build/)
    assert.doesNotMatch(section, /docker compose up[^\n]*--build/)
  }
  assert.match(sourceBuild, /docker compose up -d --build app/)
  assert.match(restore, /^docker compose pull$/m)
  assert.match(restore, /^docker compose create --no-build app$/m)
  assert.doesNotMatch(restore, /^\s*#.*docker compose (?:pull|create)[^\n]*$/m)
  assert.doesNotMatch(restore, /docker compose create(?![^\n]*--no-build)[^\n]*\bapp\b/)
  assert.doesNotMatch(deployment, /docker compose pull[^\n]*(?:\|\||;)[^\n]*--build/)
  assert.doesNotMatch(deployment, /拉取失败[^\n]*(?:--build|源码构建|本地构建)/)
  assert.match(
    deployment,
    /^docker compose config \| grep -F 'host_ip: 127\.0\.0\.1'$/m,
  )
  assert.match(
    deployment,
    /^docker compose config \| grep -F 'published: "8080"'$/m,
  )
  assert.doesNotMatch(deployment, /grep[^\n]*host_ip[^\n]*\|[^\n]*published/)

  const httpsSection = markdownSection(deployment, '配置域名和 HTTPS')
  const httpsBlocks = fencedCodeBlocks(httpsSection)
  const bindingCheck = [
    "docker compose config | grep -F 'host_ip: 127.0.0.1'",
    'docker compose config | grep -F \'published: "8080"\'',
  ].join('\n')
  const bindingCheckIndex = httpsBlocks.indexOf(bindingCheck)
  const restartIndex = httpsBlocks.indexOf('docker compose up -d --force-recreate app')
  assert.notEqual(bindingCheckIndex, -1, 'HTTPS binding checks must have a dedicated code block')
  assert.ok(restartIndex > bindingCheckIndex, 'app restart must follow the binding check block')
  assert.match(httpsSection, /两条检查都输出匹配结果后再执行/)

  const envExample = read('.env.example')
  assert.match(envExample, /^DINGCARD_VERSION=0\.23\.0$/m)
  assert.match(envExample, /127\.0\.0\.1:8080/)
  assert.match(envExample, /app:3000/)
  assert.match(envExample, /Fastify[^\n]*统一限制[^\n]*\r?\nMAX_UPLOAD_BYTES=/)
  assert.doesNotMatch(envExample, /deploy\/nginx\.conf|server\/Dockerfile|容器内 Nginx|web 容器|server 容器/)

  const backendPlan = read('docs/backend-plan.md')
  assert.match(backendPlan, /Docker 部署与维护.*deployment\.md/)
  assert.match(backendPlan, /Fastify[^\n]*(?:同一进程|单进程)[^\n]*(?:SPA|前端)[^\n]*`\/api`[^\n]*`\/uploads`/)
  assert.doesNotMatch(backendPlan, /server\/Dockerfile|deploy\/nginx\.conf|web \+ server|web 容器|server 容器|Nginx 直出/)

  const currentDocs = [readme, deployment, envExample, backendPlan].join('\n')
  assert.doesNotMatch(currentDocs, /docker compose logs[^\n]*(?:\bserver\b|\bweb\b)/)
  assert.doesNotMatch(currentDocs, /docker compose ps[^\n]*-q server/)
  assert.doesNotMatch(currentDocs, /deploy\/nginx\.conf|server\/Dockerfile/)
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
    'MCP unit',
    'MCP render pipeline',
    'MCP stdio 端到端',
    'MCP build',
    'Backend tests',
    'Backend HTTP smoke',
    'Production build',
    'CI YAML',
    'Full E2E',
    'Editor acceptance',
    'Compose config',
    'Container smoke',
    'Compose cleanup',
    'Image manifest',
    'Anonymous pull',
    'amd64 image smoke',
    'arm64 image smoke',
  ]) {
    assert.match(
      report,
      new RegExp(`\\| ${escapeRegExp(label)} \\| (PASS|FAIL|NOT EXECUTED) \\|`),
      `verification report must contain a status row for ${label}`,
    )
  }
  assert.match(report, /^# 0\.19\.0 发布验证$/m)
  assert.match(report, /`v0\.19\.0`（指向 `68d20f8`）/)
  assert.match(report, /`documentVersion: 9`/)
  assert.match(report, /36332255431/)
  assert.match(report, /36332255449/)
  assert.match(report, /本报告只记录实际执行结果/)
  assert.match(report, /\| Release contract \| PASS \|[^\n]*12\/12/)
  assert.match(report, /\| Frontend unit \| PASS \|[^\n]*720\/720/)
  assert.match(report, /\| MCP unit \| PASS \|[^\n]*29\/29/)
  assert.match(report, /\| MCP render pipeline \| PASS \|[^\n]*1080×1440/)
  assert.match(report, /渲染出像素级不同/)
  assert.match(report, /stdio JSON-RPC/)
  assert.match(report, /\| Backend tests \| PASS \|[^\n]*CI（Ubuntu \+ Node 20）/)
  assert.match(report, /\| Backend HTTP smoke \| PASS \|[^\n]*CI static 作业/)
  assert.match(report, /\| Full E2E \| PASS \|[^\n]*CI browser 作业全部通过/)
  assert.match(report, /v9 竖排开关闭环/)
  assert.match(report, /\| Editor acceptance \| PASS \|[^\n]*2\/2/)
  for (const label of ['Compose config', 'Container smoke', 'Compose cleanup', 'Image manifest', 'Anonymous pull', 'amd64 image smoke', 'arm64 image smoke']) {
    assert.match(report, new RegExp(`\\| ${escapeRegExp(label)} \\| PASS \\|`))
  }
  assert.match(report, /sha256:2f4e49da8a3e2b3bbbc745f3d4e0959d3cf569e6c0024889dcc28d5aad66a703/)
  assert.match(report, /render\.html[^\n]*MCP 无头渲染入口/)
  assert.match(report, /mcp\/dist\/index\.mjs/)
  assert.match(report, /主 chunk 降至 239/)
  assert.match(report, /仅监听 `127\.0\.0\.1` 随机端口/)
  assert.match(report, /render\.html[^\n]*MCP 无头渲染入口/)
  assert.match(report, /mcp\/dist\/index\.mjs/)
  assert.match(report, /主 chunk 降至 239/)
  assert.match(report, /仅监听 `127\.0\.0\.1` 随机端口/)

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
  assert.match(compose, /image:\s*ghcr\.io\/lottshin\/dingcard:\$\{DINGCARD_VERSION:-0\.23\.0\}/)
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
    ['frontend-build', 'server-deps', 'render-lib', 'final'],
  )
  assert.match(dockerfile, /^FROM node:22-slim AS final$/m)
  assert.match(dockerfile, /^ARG VITE_API_BASE=\/$/m)
  assert.match(dockerfile, /^ENV VITE_API_BASE=\$VITE_API_BASE$/m)
  assert.match(dockerfile, /COPY package\.json package-lock\.json \.\//)
  assert.match(dockerfile, /RUN npm ci\s*$/m)
  const frontendStage = dockerfile.split(/^FROM node:22-slim AS server-deps$/m)[0]
  assert.doesNotMatch(frontendStage, /^COPY \. \.\s*$/m)
  assert.match(frontendStage, /COPY tsconfig\.json tsconfig\.node\.json vite\.config\.ts index\.html render\.html \.\//)
  assert.match(frontendStage, /COPY public \.\/public/)
  assert.match(frontendStage, /COPY src \.\/src/)
  assert.match(dockerfile, /RUN npm ci --omit=dev\s*$/m)
  assert.match(dockerfile, /COPY server\/package\.json server\/package-lock\.json \.\//)
  assert.match(dockerfile, /COPY server\/src \.\/server\/src/)
  assert.match(dockerfile, /COPY --from=server-deps \/app\/server\/node_modules \.\/server\/node_modules/)
  assert.match(dockerfile, /COPY --from=frontend-build \/app\/dist \.\/dist/)

  // The server-side render library: bundled in render-lib, carried into the
  // final image next to the server, with Chromium pinned to the server's
  // playwright-core so the browser and the driver cannot drift apart.
  const renderLibStage = dockerfile.split(/^FROM node:22-slim AS render-lib$/m)[1]?.split(/^FROM node:22-slim AS final$/m)[0] ?? ''
  assert.match(renderLibStage, /COPY mcp\/package\.json mcp\/package-lock\.json mcp\/tsconfig\.json \.\/mcp\//)
  assert.match(renderLibStage, /COPY mcp\/src \.\/mcp\/src/)
  assert.match(renderLibStage, /RUN npm ci && npm run build/)
  assert.match(dockerfile, /COPY --from=render-lib \/app\/mcp\/dist\/render\.mjs \.\/mcp\/dist\/render\.mjs/)
  assert.match(dockerfile, /RUN ln -s \/app\/server\/node_modules \/app\/mcp\/node_modules/)
  assert.match(
    dockerfile,
    /PLAYWRIGHT_DRIVER=.*playwright-core\/package\.json'\)\.version/,
    'the Chromium driver version is read from the installed playwright-core package',
  )
  assert.match(
    dockerfile,
    /playwright@\$\{PLAYWRIGHT_DRIVER\}"? install --with-deps chromium/,
    'the image installs the Chromium build matching the server playwright-core version',
  )
  assert.doesNotMatch(dockerfile, /playwright@1\.\d+\.\d+ install/, 'no hardcoded Chromium driver pin to drift out of sync')
  assert.match(dockerfile, /fonts-noto-cjk/, 'the image carries CJK fonts so Chinese cards render correctly')

  for (const setting of [
    'NODE_ENV=production',
    'DINGCARD_IMAGE=1',
    'HOST=0.0.0.0',
    'PORT=3000',
    'DATA_DIR=/data',
    'WEB_ROOT=/app/dist',
    'DINGCARD_DIST_DIR=/app/dist',
    'PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright',
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
  assert.equal(composeCommands.length, 4, 'smoke must have only build/up/down/ps app Compose calls')
  for (const command of composeCommands) {
    assert.match(command, /DINGCARD_VERSION="\$SMOKE_VERSION"/)
  }
  assert.match(smoke, /SMOKE_IMAGE="ghcr\.io\/lottshin\/dingcard:\$SMOKE_VERSION"/)
  assert.match(smoke, /if docker image inspect "\$SMOKE_IMAGE"/)
  assert.match(smoke, /if ! docker image rm "\$SMOKE_IMAGE"/)
  assert.match(smoke, /Smoke image cleanup failed/)
  assert.doesNotMatch(smoke, /docker image rm[^\n]*\|\| true/)
  assert.doesNotMatch(smoke, /DINGCARD_VERSION=["']?0\.11\.0/)
  assert.match(smoke, /docker compose[^\n]*build app/)
  assert.match(smoke, /docker compose[^\n]*up -d --no-build/)
  assert.match(smoke, /docker compose[^\n]*ps -q app/)
  assert.match(smoke, /APP_ID=\$\(/)
  assert.match(smoke, /docker exec "?\$APP_ID"?/)
  assert.match(smoke, /docker logs "?\$APP_ID"?/)
  assert.match(smoke, /<div id=["']root["']>/)
  assert.match(smoke, /\/api\/health/)
  assert.match(smoke, /\/api\/auth\/register/)
  assert.match(smoke, /\/api\/images/)
  assert.match(smoke, /\/api\/decks/)
  assert.equal(exists('deploy/smoke-deck.json'), true, 'compose smoke renders a checked-in deck document')
  assert.match(smoke, /\/assets\//)
  assert.match(smoke, /down -v --remove-orphans/)
  assert.doesNotMatch(smoke, /nginx/i)
  assert.doesNotMatch(smoke, /\$\{PROJECT\}-(?:server|app|web)-1/)
  assert.doesNotMatch(smoke, /ps -q (?:server|web)(?:\s|$)/)
})

test('compose smoke migrates legacy services without deleting persisted user data', () => {
  const smoke = read('deploy/compose-smoke.sh')

  assert.match(smoke, /LEGACY_COMPOSE_FILE/)
  assert.match(smoke, /services:\s*\n\s+server:/)
  assert.match(smoke, /services:[\s\S]*\n\s+web:/)
  assert.match(smoke, /docker compose -f "\$LEGACY_COMPOSE_FILE" -p "\$PROJECT"[^\n]*up -d/)
  assert.match(
    smoke,
    /docker compose -f "\$LEGACY_COMPOSE_FILE" -p "\$PROJECT"[^\n]*down --remove-orphans/,
  )
  assert.doesNotMatch(
    smoke,
    /docker compose -f "\$LEGACY_COMPOSE_FILE" -p "\$PROJECT"[^\n]*down[^\n]*(?:\s-v(?:\s|$)|--volumes)/,
  )
  assert.match(smoke, /\/api\/auth\/login/)
  assert.match(smoke, /\/api\/drafts/)
  assert.match(smoke, /migrated account/)
  assert.match(smoke, /migrated draft/)
  assert.match(smoke, /migrated upload/)
})
