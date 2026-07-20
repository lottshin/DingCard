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

test('release entry documentation matches current versions and commands', () => {
  assert.equal(exists('README.md'), true, 'README.md must exist')
  assert.equal(exists('CHANGELOG.md'), true, 'CHANGELOG.md must exist')

  const readme = read('README.md')
  const changelog = read('CHANGELOG.md')
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

test('backend release checklists distinguish repository and deployment evidence', () => {
  const plan = read('docs/backend-plan.md')
  for (const implemented of [
    '密码 **bcrypt/argon2**',
    '`JWT_SECRET` 走环境变量',
    '所有草稿/图片查询',
    '上传校验',
    '注册加基础限流',
  ]) {
    assert.match(plan, new RegExp(`- \\[x\\] ${escapeRegExp(implemented)}`))
  }
  for (const deploymentOnly of ['全站 HTTPS', '`data.db` 权限 600', 'CORS:']) {
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

  const smoke = read('deploy/compose-smoke.sh')
  assert.match(smoke, /COMPOSE_SMOKE_PROJECT/)
  assert.match(smoke, /COMPOSE_SMOKE_WEB_PORT/)
  assert.match(smoke, /\/api\/health/)
  assert.match(smoke, /seq 1 60/)
  assert.match(smoke, /command -v cygpath/)
})
