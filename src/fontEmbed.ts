// Minimal, character-aware web-font embedding for PNG export.
//
// The problem: Google Fonts serves CJK families (Noto Sans SC, etc.) split
// into 100+ `unicode-range` subset files EACH. html-to-image's built-in
// `getFontEmbedCSS` fetches and base64-encodes EVERY subset of EVERY loaded
// family — for 4 CJK families that's 400+ network round-trips and megabytes of
// base64 on every export, which is the ~20s stall.
//
// The fix: a card only contains a few hundred distinct characters. We fetch the
// Google Fonts stylesheet text, keep only the @font-face blocks for the SELECTED
// family whose `unicode-range` actually covers a character present in the card,
// and embed just those handful of subset files. System fonts (PingFang, etc.)
// need no embedding at all, so export becomes instant.

// Cache raw stylesheet CSS text by href (stable for the session).
const cssTextCache = new Map<string, string>()
// Cache fetched woff2 → data URL (subset files are reused across exports).
const fontDataCache = new Map<string, string>()
// Cache the final built CSS by family + character signature.
const builtCache = new Map<string, string>()

/** Extract the primary family name from a CSS font-family value. */
export function primaryFamily(fontFamily: string): string {
  const first = fontFamily.split(',')[0] ?? ''
  return first.trim().replace(/^['"]|['"]$/g, '')
}

/** Fetch a URL and return it as a base64 data URL (with in-memory cache). */
async function fetchAsDataUrl(url: string): Promise<string> {
  const cached = fontDataCache.get(url)
  if (cached) return cached
  const res = await fetch(url)
  const blob = await res.blob()
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result as string)
    fr.onerror = reject
    fr.readAsDataURL(blob)
  })
  fontDataCache.set(url, dataUrl)
  return dataUrl
}

/** Parse a `unicode-range` value into a list of [lo, hi] codepoint ranges. */
function parseUnicodeRange(value: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = []
  for (const raw of value.split(',')) {
    const token = raw.trim()
    const m = token.match(/^U\+([0-9A-Fa-f?]+)(?:-([0-9A-Fa-f]+))?$/)
    if (!m) continue
    if (m[1].includes('?')) {
      const lo = parseInt(m[1].replace(/\?/g, '0'), 16)
      const hi = parseInt(m[1].replace(/\?/g, 'F'), 16)
      ranges.push([lo, hi])
    } else {
      const lo = parseInt(m[1], 16)
      const hi = m[2] ? parseInt(m[2], 16) : lo
      ranges.push([lo, hi])
    }
  }
  return ranges
}

/** True if any of `codepoints` falls inside one of the ranges. */
function rangeCoversAny(ranges: Array<[number, number]>, codepoints: Set<number>): boolean {
  for (const cp of codepoints) {
    for (const [lo, hi] of ranges) {
      if (cp >= lo && cp <= hi) return true
    }
  }
  return false
}

/** Grab every Google Fonts stylesheet <link> href currently in the document. */
function googleFontHrefs(): string[] {
  const links = document.querySelectorAll<HTMLLinkElement>(
    'link[rel="stylesheet"][href*="fonts.googleapis.com"]',
  )
  return Array.from(links).map((l) => l.href)
}

async function stylesheetText(href: string): Promise<string> {
  const cached = cssTextCache.get(href)
  if (cached != null) return cached
  try {
    const res = await fetch(href)
    const text = await res.text()
    cssTextCache.set(href, text)
    return text
  } catch {
    cssTextCache.set(href, '')
    return ''
  }
}

/** Split a stylesheet into individual @font-face block bodies. */
function fontFaceBlocks(css: string): string[] {
  const blocks: string[] = []
  const re = /@font-face\s*\{([^}]*)\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(css))) blocks.push(m[1])
  return blocks
}

function pick(prop: string, block: string): string | null {
  const m = block.match(new RegExp(prop + '\\s*:\\s*([^;]+);', 'i'))
  return m ? m[1].trim() : null
}

/**
 * Build a minimal @font-face CSS embedding only the subsets of `fontFamily`
 * needed to render `text`. Returns '' for system fonts (nothing to embed),
 * which makes html-to-image skip font work entirely.
 */
export async function buildFontEmbedCSS(text: string, fontFamily: string): Promise<string> {
  const family = primaryFamily(fontFamily)
  if (!family) return ''

  // Unique codepoints used in the card.
  const codepoints = new Set<number>()
  for (const ch of text) codepoints.add(ch.codePointAt(0)!)
  // Always include basic Latin + common CJK punctuation so headers/meta render.
  for (let c = 0x20; c <= 0x7e; c++) codepoints.add(c)

  const sig = family + '|' + [...codepoints].sort((a, b) => a - b).join(',')
  const cached = builtCache.get(sig)
  if (cached != null) return cached

  const hrefs = googleFontHrefs()
  const texts = await Promise.all(hrefs.map(stylesheetText))
  const allCss = texts.join('\n')

  const kept: string[] = []
  const fetches: Array<Promise<void>> = []

  for (const block of fontFaceBlocks(allCss)) {
    const famRaw = pick('font-family', block)
    if (!famRaw) continue
    const fam = famRaw.replace(/^['"]|['"]$/g, '')
    if (fam.toLowerCase() !== family.toLowerCase()) continue // only the selected family

    const range = pick('unicode-range', block)
    // Keep a face if it has no range (whole font) or its range covers used chars.
    if (range && !rangeCoversAny(parseUnicodeRange(range), codepoints)) continue

    const srcRaw = pick('src', block)
    if (!srcRaw) continue
    const urlMatch = srcRaw.match(/url\(([^)]+)\)/)
    if (!urlMatch) continue
    const url = urlMatch[1].replace(/^['"]|['"]$/g, '')

    // Rewrite the src url to an embedded data URL (fetched in parallel).
    const idx = kept.length
    kept.push(block) // placeholder, filled after fetch
    fetches.push(
      fetchAsDataUrl(url).then((dataUrl) => {
        const rewritten = block.replace(/url\([^)]+\)/, `url(${dataUrl})`)
        kept[idx] = `@font-face {${rewritten}}`
      }),
    )
  }

  await Promise.all(fetches)
  const css = kept.filter((b) => b.startsWith('@font-face')).join('\n')
  builtCache.set(sig, css)
  return css
}
