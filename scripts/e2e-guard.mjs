// The local e2e gate: full suites belong to CI (its browser job), and the
// user works on this machine. Local runs must be targeted single tests
// (`-g "pattern"`), capped at two workers, and only when the machine is
// quiet. Every decision lands in scripts/.e2e-audit.log so the gate's
// behaviour is checkable after the fact.
//
// Usage: npm run test:e2e -- <playwright args…>
//   npm run test:e2e -- freeform-shape-tools.spec.ts -g "dashes a rect"
//
// Full-suite runs are refused locally unless DINGCARD_FULL_E2E=1 is set —
// an explicit, logged decision, not something that can happen by accident.

import { spawnSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

const AUDIT_LOG = path.resolve(import.meta.dirname, '.e2e-audit.log')
/** Above this 1-minute load average, no local browser test may start. */
const LOAD_LIMIT = 10
/** Local runs never get more than this many browser workers. */
const WORKER_LIMIT = 2

const args = process.argv.slice(2)
const load = os.loadavg()[0]
const hasFilter = args.some((arg) => arg === '-g' || arg.startsWith('--grep='))
const fullRun = !hasFilter
const forced = process.env.DINGCARD_FULL_E2E === '1'

function audit(verdict, note) {
  appendFileSync(
    AUDIT_LOG,
    `${new Date().toISOString()} load=${load.toFixed(1)} verdict=${verdict} ${note} :: ${args.join(' ')}\n`,
  )
}

if (fullRun && !forced) {
  audit('REFUSED', 'full suite without DINGCARD_FULL_E2E=1 — full e2e belongs to CI')
  console.error(
    '已拒绝：本地不跑全量 e2e（全量归 CI 的 browser job）。\n'
    + '只跑和改动相关的单条用例：npm run test:e2e -- <spec 文件> -g "用例名"\n'
    + '确需本地全量（不该有）：DINGCARD_FULL_E2E=1 npm run test:e2e -- …（会记入审计日志）',
  )
  process.exit(1)
}

if (load >= LOAD_LIMIT) {
  audit('REFUSED', `load ${load.toFixed(1)} ≥ ${LOAD_LIMIT}`)
  console.error(
    `已拒绝：机器负载 ${load.toFixed(1)}（阈值 ${LOAD_LIMIT}）。等空闲后再跑，或推给 CI。`,
  )
  process.exit(1)
}

const forwarded = args.some((arg) => arg.startsWith('--workers'))
  ? args
  : [...args, `--workers=${WORKER_LIMIT}`]
audit(forced ? 'ALLOWED-FULL' : 'ALLOWED', forced ? 'explicit DINGCARD_FULL_E2E=1' : 'targeted run')

const run = spawnSync('npx', ['playwright', 'test', ...forwarded], {
  stdio: 'inherit',
  env: { ...process.env },
})
process.exit(run.status ?? 1)
