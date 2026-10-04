// The public share page: GET /share/:token, no authentication.
//
// Anyone with the unguessable token sees the deck's exported pages on a
// phone-friendly page and can long-press to save them. An expired share
// answers 410, an unknown or revoked one 404; both render the same plain
// shell so the page never leaks whether a token ever existed.

import { config } from './config.js'
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
  main { max-width: 520px; margin: 0 auto; padding: 28px 16px 40px; }
  h1 { font-size: 20px; line-height: 1.4; margin: 0 0 6px; }
  .meta { font-size: 13px; opacity: 0.62; margin: 0 0 20px; }
  img {
    display: block;
    width: 100%;
    height: auto;
    border-radius: 10px;
    margin: 0 0 14px;
    background: #fff;
  }
  @media (prefers-color-scheme: dark) { img { background: #211f17; } }
  footer { font-size: 12px; opacity: 0.5; text-align: center; margin-top: 26px; }
  .state { text-align: center; padding: 72px 16px; }
  .state h1 { margin-bottom: 10px; }
  .state p { font-size: 14px; opacity: 0.62; margin: 0; }
`

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function shareShell(body, title) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)} · 叮卡分享</title>
<style>${PAGE_CSS}</style>
</head>
<body>
${body}
</body>
</html>`
}

function statePage(heading, detail) {
  return shareShell(
    `<main><div class="state"><h1>${escapeHtml(heading)}</h1><p>${escapeHtml(detail)}</p></div></main>`,
    heading,
  )
}

function sharePage(title, imagePaths) {
  const images = imagePaths
    .map((imagePath, index) => `<img src="${escapeHtml(imagePath)}" alt="第 ${index + 1} 张" loading="lazy">`)
    .join('\n')
  return shareShell(
    `<main>
<h1>${escapeHtml(title)}</h1>
<p class="meta">${imagePaths.length} 张 · 长按图片保存到相册</p>
${images}
<footer>由 叮卡 生成分享</footer>
</main>`,
    title,
  )
}

export function registerSharePage(app, options = {}) {
  const routeStmts = options.stmts ?? stmts
  const now = options.now ?? Date.now
  const render = options.renderSharePage ?? sharePage
  const renderExpired = options.renderExpiredPage
    ?? (() => statePage('分享已过期', '这份分享超过了有效期，请让分享者重新生成'))
  const renderMissing = options.renderMissingPage
    ?? (() => statePage('分享不存在', '链接不正确，或分享已被撤销'))

  app.get('/share/:token', async (request, reply) => {
    reply.header('X-Robots-Tag', 'noindex')
    const token = request.params.token
    if (typeof token !== 'string' || token === '' || token.length > 64) {
      reply.code(404).type('text/html; charset=utf-8').send(renderMissing())
      return
    }

    const row = routeStmts.shareByToken.get(token)
    if (!row) {
      reply.code(404).type('text/html; charset=utf-8').send(renderMissing())
      return
    }
    if (!Number.isFinite(row.expires_at) || row.expires_at <= now()) {
      reply.code(410).type('text/html; charset=utf-8').send(renderExpired())
      return
    }

    const imagePaths = routeStmts.shareImages.all(row.id).map((image) => image.image_path)
    if (imagePaths.length === 0) {
      reply.code(404).type('text/html; charset=utf-8').send(renderMissing())
      return
    }

    reply.type('text/html; charset=utf-8').send(render(row.title, imagePaths))
  })
}
