// The operator dashboard: a tiny instance overview behind one admin token.
//
// Self-hosted DingCard has no roles or admin accounts; the operator is whoever
// holds DINGCARD_ADMIN_TOKEN. With the token unset neither route is registered,
// so a deployment that never opted in exposes nothing. The token is checked in
// constant time and never appears in a response or a log line.

import { timingSafeEqual } from 'node:crypto'
import { stmts } from './db.js'

const PAGE_CSS = `
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', system-ui, sans-serif;
    background: #f4f2ee;
    color: #26241f;
  }
  @media (prefers-color-scheme: dark) {
    body { background: #17160f; color: #f0ede4; }
  }
  main { max-width: 520px; margin: 0 auto; padding: 40px 16px; }
  h1 { font-size: 20px; line-height: 1.4; margin: 0 0 6px; }
  .meta { font-size: 13px; opacity: 0.62; margin: 0 0 20px; }
  form { display: flex; gap: 8px; margin: 0 0 20px; }
  input {
    flex: 1;
    padding: 10px 12px;
    font: inherit;
    border: 1px solid rgba(128, 122, 102, 0.45);
    border-radius: 8px;
    background: transparent;
    color: inherit;
  }
  button {
    padding: 10px 16px;
    font: 500 14px/1 inherit;
    font-family: inherit;
    border: 1px solid rgba(128, 122, 102, 0.45);
    border-radius: 8px;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }
  button:active { transform: translateY(1px); }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 10px 0; text-align: left; border-bottom: 1px solid rgba(128, 122, 102, 0.25); }
  th { font-weight: 500; opacity: 0.72; }
  td { font-variant-numeric: tabular-nums; text-align: right; }
  #error { color: #b3452e; font-size: 14px; margin: 0 0 12px; }
  footer { font-size: 12px; opacity: 0.5; text-align: center; margin-top: 26px; }
`

const PAGE_SCRIPT = `
(function () {
  var form = document.getElementById('admin-form')
  var out = document.getElementById('out')
  var error = document.getElementById('error')
  function fmtBytes(n) {
    if (n > 1024 * 1024 * 1024) return (n / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
    if (n > 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + ' MB'
    if (n > 1024) return (n / 1024).toFixed(1) + ' KB'
    return n + ' B'
  }
  form.addEventListener('submit', function (event) {
    event.preventDefault()
    error.textContent = ''
    out.textContent = '读取中…'
    var token = document.getElementById('admin-token').value
    fetch('/api/admin/stats', { headers: { authorization: 'Bearer ' + token } })
      .then(function (response) {
        if (response.status === 401) throw new Error('令牌不对')
        if (!response.ok) throw new Error('读取失败（' + response.status + '）')
        return response.json()
      })
      .then(function (data) {
        var s = data.stats
        var rows = [
          ['用户', s.users],
          ['作品 · 自由画布', s.drafts['freeform-slide'] || 0],
          ['作品 · Markdown', s.drafts['markdown-card'] || 0],
          ['图片', (s.images.count || 0) + ' 张 · ' + fmtBytes(s.images.bytes || 0)],
          ['素材', s.assets],
          ['分享链接', s.shares.total + ' 个 · 还能打开 ' + s.shares.active + ' 个'],
          ['API 令牌（启用中）', s.apiTokens]
        ]
        var when = new Date(data.serverTime).toLocaleString('zh-CN')
        out.innerHTML = '<table>' + rows.map(function (row) {
          return '<tr><th>' + row[0] + '</th><td>' + row[1] + '</td></tr>'
        }).join('') + '</table><p class="meta">服务器时间：' + when + '</p>'
      })
      .catch(function (err) {
        out.textContent = ''
        error.textContent = err.message || '读取失败'
      })
  })
})()
`

function adminPage() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>叮卡实例总览 · 管理员</title>
<style>${PAGE_CSS}</style>
</head>
<body>
<main>
<h1>叮卡实例总览</h1>
<p class="meta">输入管理员令牌（环境变量 DINGCARD_ADMIN_TOKEN 的值），查看这个实例的使用情况。令牌只在本地使用，不会发给别的地址。</p>
<form id="admin-form">
<input id="admin-token" type="password" autocomplete="off" placeholder="管理员令牌" aria-label="管理员令牌">
<button type="submit">查看</button>
</form>
<p id="error" role="alert"></p>
<div id="out"></div>
<footer>由 叮卡 生成</footer>
</main>
<script>${PAGE_SCRIPT}</script>
</body>
</html>`
}

function tokenMatches(provided, expected) {
  const a = Buffer.from(String(provided))
  const b = Buffer.from(String(expected))
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Instance-wide counts for the dashboard; every number comes straight from SQL. */
export function adminStats({ stmts: routeStmts = stmts, now = Date.now } = {}) {
  const images = routeStmts.countImages.get()
  const shares = routeStmts.countShares.get(now())
  return {
    users: routeStmts.countUsers.get().n,
    drafts: Object.fromEntries(routeStmts.countDraftsByMode.all().map((row) => [row.mode, row.n])),
    images: { count: images.n, bytes: images.bytes },
    assets: routeStmts.countAssets.get().n,
    shares: { total: shares.n, active: shares.active },
    apiTokens: routeStmts.countApiTokens.get().n,
  }
}

/**
 * Register the operator dashboard: GET /admin (the tiny page) and
 * GET /api/admin/stats (its data). Registering nothing when the token is unset
 * keeps unconfigured deployments free of any admin surface.
 */
export function registerAdmin(app, options = {}) {
  const adminToken = typeof options.adminToken === 'string' ? options.adminToken.trim() : ''
  if (adminToken === '') return
  const now = options.now ?? Date.now
  const stats = options.stats ?? (() => adminStats(options))

  app.get('/api/admin/stats', async (request, reply) => {
    const header = request.headers.authorization
    const provided = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : ''
    if (provided === '' || !tokenMatches(provided, adminToken)) {
      reply.code(401).send({ error: '管理员令牌不对' })
      return
    }
    reply.send({ ok: true, serverTime: now(), stats: stats() })
  })

  app.get('/admin', async (_request, reply) => {
    reply.header('X-Robots-Tag', 'noindex').type('text/html; charset=utf-8').send(adminPage())
  })
}
