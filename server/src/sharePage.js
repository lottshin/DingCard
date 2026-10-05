// The public share page: GET /share/:token, no authentication.
//
// Anyone with the unguessable token sees the deck's exported pages on a
// phone-friendly page: pages snap while scrolling with a position pill,
// each page carries its own save button (long-press saving stays available
// too), and the first page doubles as the social preview image. An expired
// share answers 410, an unknown or revoked one 404; both render the same
// plain shell so the page never leaks whether a token ever existed.

import { stmts } from './db.js'

const PAGE_CSS = `
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  html { scroll-snap-type: y proximity; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', system-ui, sans-serif;
    background: #f4f2ee;
    color: #26241f;
  }
  @media (prefers-color-scheme: dark) {
    body { background: #17160f; color: #f0ede4; }
  }
  main { max-width: 520px; margin: 0 auto; padding: 28px 16px 96px; }
  h1 { font-size: 20px; line-height: 1.4; margin: 0 0 6px; }
  .meta { font-size: 13px; opacity: 0.62; margin: 0 0 20px; }
  .page {
    scroll-snap-align: start;
    margin: 0 0 14px;
  }
  img {
    display: block;
    width: 100%;
    height: auto;
    border-radius: 10px;
    background: #fff;
  }
  @media (prefers-color-scheme: dark) { img { background: #211f17; } }
  .save {
    display: block;
    width: 100%;
    margin: 10px 0 24px;
    padding: 10px 16px;
    font-family: inherit;
    font-size: 14px;
    font-weight: 500;
    line-height: 1;
    border: 1px solid rgba(128, 122, 102, 0.45);
    border-radius: 999px;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }
  .save:active { transform: translateY(1px); }
  .save:disabled { opacity: 0.5; }
  .pager {
    position: fixed;
    left: 50%;
    bottom: 18px;
    transform: translateX(-50%);
    padding: 6px 14px;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    border-radius: 999px;
    background: rgba(38, 36, 31, 0.72);
    color: #f4f2ee;
    -webkit-backdrop-filter: blur(8px);
    backdrop-filter: blur(8px);
    user-select: none;
  }
  @media (prefers-color-scheme: dark) {
    .pager { background: rgba(240, 237, 228, 0.78); color: #26241f; }
  }
  footer { font-size: 12px; opacity: 0.5; text-align: center; margin-top: 26px; }
  .state { text-align: center; padding: 72px 16px; }
  .state h1 { margin-bottom: 10px; }
  .state p { font-size: 14px; opacity: 0.62; margin: 0; }
`

const PAGE_SCRIPT = `
(function () {
  var pages = document.querySelectorAll('.page')
  var pager = document.getElementById('pager')
  if (pages.length > 1 && pager && 'IntersectionObserver' in window) {
    var visible = new Map()
    var io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) visible.set(entries[i].target, entries[i].intersectionRatio)
        else visible.delete(entries[i].target)
      }
      var best = null, ratio = -1
      visible.forEach(function (value, key) { if (value > ratio) { ratio = value; best = key } })
      if (best) pager.textContent = (Array.prototype.indexOf.call(pages, best) + 1) + ' / ' + pages.length
    }, { threshold: [0.25, 0.5] })
    for (var i = 0; i < pages.length; i++) io.observe(pages[i])
  } else if (pager) pager.hidden = true
  document.addEventListener('click', function (event) {
    var button = event.target && event.target.closest ? event.target.closest('.save') : null
    if (!button || button.disabled) return
    var src = button.getAttribute('data-src')
    if (!src) return
    button.disabled = true
    fetch(src).then(function (response) { return response.blob() }).then(function (blob) {
      var url = URL.createObjectURL(blob)
      var link = document.createElement('a')
      link.href = url
      link.download = src.split('/').pop() || 'card.png'
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(function () { URL.revokeObjectURL(url) }, 4000)
      button.disabled = false
    }).catch(function () {
      // Wherever programmatic downloads are blocked (some in-app browsers),
      // the image still opens in a tab and long-press saves it.
      window.open(src, '_blank')
      button.disabled = false
    })
  })
})()
`

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function formatDate(at) {
  const date = new Date(at)
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
    : ''
}

function shareShell(body, title, head = '', script = '') {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)} · 叮卡分享</title>
${head}
<style>${PAGE_CSS}</style>
</head>
<body>
${body}
<script>${script}</script>
</body>
</html>`
}

function statePage(heading, detail) {
  return shareShell(
    `<main><div class="state"><h1>${escapeHtml(heading)}</h1><p>${escapeHtml(detail)}</p></div></main>`,
    heading,
  )
}

function sharePage(title, imagePaths, meta = {}) {
  const expiresAt = Number.isFinite(meta.expiresAt) ? meta.expiresAt : null
  const origin = typeof meta.origin === 'string' ? meta.origin.replace(/\/+$/, '') : ''
  const token = typeof meta.token === 'string' ? meta.token : ''
  const expiry = expiresAt === null ? '' : formatDate(expiresAt)
  const firstImage = imagePaths[0] ?? ''
  const ogImage = firstImage === '' ? '' : (origin === '' ? firstImage : `${origin}${firstImage}`)
  const socialHead = [
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${imagePaths.length} 张卡片">`,
    ogImage === '' ? '' : `<meta property="og:image" content="${escapeHtml(ogImage)}">`,
    origin === '' || token === '' ? '' : `<meta property="og:url" content="${escapeHtml(`${origin}/share/${token}`)}">`,
    ogImage === '' ? '' : '<meta name="twitter:card" content="summary_large_image">',
  ].filter(Boolean).join('\n')

  const pages = imagePaths
    .map((imagePath, index) => `<section class="page" id="page-${index + 1}">
<img src="${escapeHtml(imagePath)}" alt="第 ${index + 1} 张" loading="${index === 0 ? 'eager' : 'lazy'}">
<button class="save" type="button" data-src="${escapeHtml(imagePath)}">保存这张</button>
</section>`)
    .join('\n')

  return shareShell(
    `<main>
<h1>${escapeHtml(title)}</h1>
<p class="meta">${imagePaths.length} 张${expiry ? ` · 有效期至 ${escapeHtml(expiry)}` : ''} · 长按图片保存到相册</p>
${pages}
<div class="pager" id="pager" aria-hidden="true">1 / ${imagePaths.length}</div>
<footer>由 叮卡 生成分享</footer>
</main>`,
    title,
    socialHead,
    PAGE_SCRIPT,
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

    // The owner sees this counter in the share dialog: one per successful
    // page render, never for a 404 or the expired notice.
    routeStmts.incrementShareViews.run(row.id)

    const host = typeof request.headers.host === 'string' ? request.headers.host : ''
    const origin = host === '' ? '' : `${request.protocol}://${host}`
    reply.type('text/html; charset=utf-8').send(render(row.title, imagePaths, {
      expiresAt: row.expires_at,
      origin,
      token,
    }))
  })
}
