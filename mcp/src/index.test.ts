// MCP-layer test: connects a real SDK client to the server over in-memory
// transport and exercises every offline tool end to end (tool registration,
// zod argument parsing, JSON result payloads). render_document, render_markdown
// and check_document need a browser and are covered by the pipeline test instead.

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createDingcardServer } from './index'
import { instantiateTemplate } from './core/templates'

function parseContent(result: { content: Array<{ type: string; text?: string }> }): unknown {
  expect(result.content).toHaveLength(1)
  expect(result.content[0].type).toBe('text')
  return JSON.parse(result.content[0].text ?? '')
}

type Content = { content: Array<{ type: string; text?: string }> }

/** Call a tool and parse its JSON answer. */
async function call<T = Record<string, unknown>>(client: Client, name: string, args: Record<string, unknown>): Promise<T> {
  return parseContent((await client.callTool({ name, arguments: args })) as Content) as T
}

async function connect(): Promise<Client> {
  const server: McpServer = createDingcardServer()
  const client = new Client({ name: 'dingcard-mcp-test', version: '0.0.0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  return client
}

describe('dingcard-mcp tool layer', () => {
  test('exposes the nineteen tools', async () => {
    const client = await connect()
    const listing = await client.listTools()
    const names = listing.tools.map((tool) => tool.name).sort()
    expect(names).toEqual([
      'add_decorations',
      'apply_actions',
      'check_document',
      'create_document_from_content',
      'create_document_from_outline',
      'create_document_from_template',
      'create_poster_from_content',
      'get_document',
      'inspect_document',
      'list_decorations',
      'list_filter_presets',
      'list_icons',
      'list_styles',
      'list_templates',
      'list_text_styles',
      'open_in_editor',
      'render_document',
      'render_markdown',
      'validate_document',
    ])
    for (const tool of listing.tools) {
      expect(tool.description?.length ?? 0).toBeGreaterThan(40)
    }
    await client.close()
  })

  test('list_templates returns the registry', async () => {
    const client = await connect()
    const response = await client.callTool({ name: 'list_templates', arguments: {} })
    const parsed = parseContent(response as { content: Array<{ type: string; text?: string }> })
    const templates = (parsed as { templates: Array<{ id: string; capacity?: { sectionPoints: number; sectionQuote: boolean } }> }).templates
    expect(templates.map((template) => template.id)).toContain('editorial-freeform')
    // Freeform templates say how much a page holds, so a client can pick one for its content.
    expect(templates.find((template) => template.id === 'editorial-freeform')?.capacity)
      .toMatchObject({ sectionPoints: 3, sectionQuote: true })
    expect(templates.find((template) => template.id === 'editorial-archive-markdown')?.capacity).toBeUndefined()
    await client.close()
  })

  test('create → inspect → apply_actions round trip, passing the documentId the server keeps', async () => {
    const client = await connect()

    const created = await call<{ workspace: string; documentId: string; version: number; slides: Array<{ id: string; name: string }>; document?: unknown }>(
      client, 'create_document_from_template', { templateId: 'editorial-freeform' },
    )
    expect(created.workspace).toBe('freeform')
    expect(created.documentId).toMatch(/^doc_[0-9a-f]{12}$/)
    expect(created.version).toBe(1)
    expect(created.slides).toHaveLength(3)
    // No whole document unless asked for.
    expect(created.document).toBeUndefined()

    const inspected = await call<{ ok: boolean; documentId: string; slides: Array<{ nodes: Array<{ id: string; name: string }> }> }>(
      client, 'inspect_document', { documentId: created.documentId },
    )
    expect(inspected.ok).toBe(true)
    expect(inspected.documentId).toBe(created.documentId)
    const titleNode = inspected.slides[0].nodes.find((node) => node.name === '主标题')
    expect(titleNode).toBeDefined()

    const edited = await call<{ ok: boolean; documentId: string; version: number; changes: boolean[] }>(client, 'apply_actions', {
      documentId: created.documentId,
      actions: [{
        type: 'node/update-content',
        slideId: created.slides[0].id,
        updates: [{ path: [titleNode!.id], patch: { text: 'AI 改写的标题' } }],
      }],
    })
    expect(edited).toMatchObject({ ok: true, documentId: created.documentId, version: 2, changes: [true] })

    // The kept document has the edit; get_document hands it back, or writes it to a file.
    const fetched = await call<{ ok: boolean; document: { slides: Array<{ nodes: Array<{ id: string; text?: string }> }> } }>(
      client, 'get_document', { documentId: created.documentId },
    )
    expect(fetched.document.slides[0].nodes.find((node) => node.id === titleNode!.id)?.text).toBe('AI 改写的标题')
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'dingcard-doc-')), 'deck', 'cards.json')
    const written = await call<{ ok: boolean; path: string; bytes: number }>(client, 'get_document', { documentId: created.documentId, path: file })
    expect(written).toMatchObject({ ok: true, path: file })
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(fetched.document)

    // A file comes back in by documentPath, kept under a new id.
    const reopened = await call<{ ok: boolean; documentId: string; version: number }>(client, 'validate_document', { documentPath: file })
    expect(reopened.ok).toBe(true)
    expect(reopened.documentId).not.toBe(created.documentId)
    expect((await call<{ ok: boolean; documentId: string }>(client, 'validate_document', { documentId: created.documentId })).documentId)
      .toBe(created.documentId)
    await client.close()
  })

  test('says what is wrong with a document input instead of guessing', async () => {
    const client = await connect()
    const missing = await call<{ ok: boolean; error: string }>(client, 'inspect_document', { documentId: 'doc_000000000000' })
    expect(missing.ok).toBe(false)
    expect(missing.error).toContain('doc_000000000000')
    const both = await call<{ ok: boolean; error: string }>(client, 'inspect_document', { documentId: 'doc_1', document: {} })
    expect(both.error).toContain('只给')
    const unreadable = await call<{ ok: boolean; error: string }>(client, 'inspect_document', { documentPath: '/nonexistent/cards.json' })
    expect(unreadable.error).toContain('/nonexistent/cards.json')
    await client.close()
  })

  test('reads pictures given as file paths into the document', async () => {
    const client = await connect()
    const folder = mkdtempSync(path.join(tmpdir(), 'dingcard-pictures-'))
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
    writeFileSync(path.join(folder, 'dot.png'), png)
    const created = await call<{ documentId: string; slides: Array<{ id: string }> }>(client, 'create_document_from_template', { templateId: 'editorial-freeform' })
    const picture = {
      id: 'photo', name: '照片', locked: false, hidden: false, type: 'image', x: 0, y: 0, width: 200, height: 200,
      rotation: 0, scale: 1, src: path.join(folder, 'dot.png'), alt: '', fit: 'cover', framing: { focusX: 0.5, focusY: 0.5, zoom: 1 },
    }
    const applied = await call<{ ok: boolean; changes: boolean[] }>(client, 'apply_actions', {
      documentId: created.documentId,
      actions: [
        { type: 'node/insert-children', slideId: created.slides[0].id, parentPath: [], nodes: [picture] },
        { type: 'slide/update', slideId: created.slides[1].id, patch: { background: { type: 'image', src: `file://${path.join(folder, 'dot.png')}`, fit: 'cover', framing: { focusX: 0.5, focusY: 0.5, zoom: 1 } } } },
      ],
    })
    expect(applied).toMatchObject({ ok: true, changes: [true, true] })
    const fetched = await call<{ document: { slides: Array<{ background: { src?: string }; nodes: Array<{ id: string; src?: string }> }> } }>(
      client, 'get_document', { documentId: created.documentId },
    )
    const embedded = `data:image/png;base64,${png.toString('base64')}`
    expect(fetched.document.slides[0].nodes.find((node) => node.id === 'photo')?.src).toBe(embedded)
    expect(fetched.document.slides[1].background.src).toBe(embedded)

    // A path that names a file that isn't there is an error, not a broken picture.
    const broken = await call<{ ok: boolean; error: string }>(client, 'apply_actions', {
      documentId: created.documentId,
      actions: [{ type: 'node/insert-children', slideId: created.slides[0].id, parentPath: [], nodes: [{ ...picture, id: 'gone', src: `${folder}/../missing.png`.replace(folder, './nowhere') }] }],
    })
    expect(broken.ok).toBe(false)
    expect(broken.error).toContain('missing.png')
    await client.close()
  })

  test('creates a multi-slide card set from a markdown outline', async () => {
    const client = await connect()

    const created = parseContent(
      (await client.callTool({
        name: 'create_document_from_outline',
        arguments: {
          outline: '# 大纲标题\n\n## 第一节\n- 要点一\n- 要点二\n\n## 第二节\n正文一行',
          templateId: 'editorial-freeform',
        },
      })) as { content: Array<{ type: string; text?: string }> },
    ) as {
      ok: boolean
      documentId: string
      summary: { slideCount: number; coverTitle: string; pages: Array<{ title: string; role: string }> }
    }
    expect(created.ok).toBe(true)
    const kept = await call<{ document: { documentVersion: number; slides: unknown[] } }>(client, 'get_document', { documentId: created.documentId })
    expect(kept.document.documentVersion).toBe(18)
    // Cover and two sections: the outline asked for no closing page.
    expect(kept.document.slides).toHaveLength(3)
    expect(created.summary.slideCount).toBe(3)
    expect(created.summary.coverTitle).toBe('大纲标题')
    expect(created.summary.pages.map((page) => page.title)).toEqual(['大纲标题', '第一节', '第二节'])

    const validated = parseContent(
      (await client.callTool({
        name: 'validate_document',
        arguments: { documentId: created.documentId },
      })) as { content: Array<{ type: string; text?: string }> },
    ) as { ok: boolean }
    expect(validated.ok).toBe(true)
    await client.close()
  })

  test('creates a card set from structured content', async () => {
    const client = await connect()
    const created = parseContent(
      (await client.callTool({
        name: 'create_document_from_content',
        arguments: {
          templateId: 'checklist-freeform',
          content: {
            title: '开工清单',
            subtitle: '三件事做完再动手',
            pages: [{ title: '准备', points: ['列目标：一句话写清楚', '找素材'] }],
            ending: { title: '可以开工了', points: ['目标清楚', '素材齐全'] },
          },
        },
      })) as { content: Array<{ type: string; text?: string }> },
    ) as { ok: boolean; documentId: string; document?: unknown; summary: { slideCount: number; pages: Array<{ role: string }> } }
    expect(created.ok).toBe(true)
    expect(created.documentId).toMatch(/^doc_/)
    expect(created.document).toBeUndefined()
    expect(created.summary.slideCount).toBe(3)
    expect(created.summary.pages.map((page) => page.role)).toEqual(['cover', 'section', 'ending'])

    const rejected = parseContent(
      (await client.callTool({
        name: 'create_document_from_content',
        arguments: { templateId: 'no-such-template', content: { title: 'a', pages: [{ title: 'b' }] } },
      })) as { content: Array<{ type: string; text?: string }> },
    ) as { ok: boolean; error: string }
    expect(rejected.ok).toBe(false)
    expect(rejected.error).toContain('list_templates')
    await client.close()
  })

  test('exposes schema, templates, and examples as MCP resources', async () => {
    const client = await connect()
    const listing = await client.listResources()
    const uris = listing.resources.map((resource) => resource.uri).sort()
    expect(uris).toEqual([
      'dingcard://decorations',
      'dingcard://examples/freeform',
      'dingcard://examples/markdown',
      'dingcard://icons',
      'dingcard://schema/actions',
      'dingcard://schema/freeform',
      'dingcard://templates',
    ])
    for (const resource of listing.resources) {
      expect(resource.description?.length ?? 0).toBeGreaterThan(4)
    }

    const readText = async (uri: string): Promise<string> => {
      const result = await client.readResource({ uri })
      expect(result.contents).toHaveLength(1)
      const content = result.contents[0]
      if (!('text' in content) || typeof content.text !== 'string') {
        throw new Error(`resource ${uri} did not return text`)
      }
      return content.text
    }

    const templates = JSON.parse(await readText('dingcard://templates')) as {
      templates: Array<{ id: string }>
    }
    expect(templates.templates.map((template) => template.id)).toContain('editorial-freeform')

    expect(await readText('dingcard://schema/freeform')).toContain('documentVersion')
    expect(await readText('dingcard://schema/freeform')).toContain('- path：')
    expect(await readText('dingcard://schema/freeform')).toContain('highlight?')
    expect(await readText('dingcard://schema/freeform')).toContain("{ type: 'image', src")

    const icons = JSON.parse(await readText('dingcard://icons')) as {
      style: { viewBox: { width: number } }
      icons: Array<{ id: string; d: string }>
    }
    expect(icons.style.viewBox.width).toBe(24)
    expect(icons.icons.length).toBeGreaterThan(90)
    expect(icons.icons.every((icon) => icon.d.startsWith('M'))).toBe(true)

    const decorations = JSON.parse(await readText('dingcard://decorations')) as { decorations: Array<{ id: string }> }
    expect(decorations.decorations.map((decoration) => decoration.id)).toContain('circle-scribble')

    const document = JSON.parse(await readText('dingcard://examples/freeform')) as {
      documentVersion: number
    }
    expect(document.documentVersion).toBe(18)

    const envelope = JSON.parse(await readText('dingcard://examples/markdown')) as {
      source: string
    }
    expect(envelope.source).toContain('#')
    await client.close()
  })

  test('add_decorations places library pieces on a kept document', async () => {
    const client = await connect()
    const call = async <T>(name: string, args: Record<string, unknown>) => parseContent(
      (await client.callTool({ name, arguments: args })) as { content: Array<{ type: string; text?: string }> },
    ) as T
    const created = await call<{ documentId: string; version: number; slides: Array<{ id: string }> }>('create_document_from_template', { templateId: 'quote-card-freeform' })
    const placed = await call<{ ok: boolean; documentId: string; version: number; slideId: string; added: Array<{ decoration: string; path: string[] }> }>(
      'add_decorations',
      { documentId: created.documentId, items: [{ decoration: 'sparkles', x: 900, y: 80, width: 120 }, { decoration: 'pill', x: 96, y: 60, text: '每日一句' }] },
    )
    expect(placed).toMatchObject({ ok: true, documentId: created.documentId, version: 2, slideId: created.slides[0].id })
    expect(placed.added.map((entry) => entry.decoration)).toEqual(['sparkles', 'pill'])
    const inspected = await call<{ slides: Array<{ nodes: Array<{ id: string; name: string; text?: string }> }> }>('inspect_document', { documentId: created.documentId })
    const names = inspected.slides[0].nodes.map((node) => node.name)
    expect(names.slice(-2)).toEqual(['闪闪', '胶囊标签'])
    const listed = await call<{ total: number }>('list_decorations', { category: 'sticker' })
    expect(listed.total).toBeGreaterThanOrEqual(10)
    await client.close()
  })

  test('list_icons lists names, searches drawings, and its example inserts as a path', async () => {
    const client = await connect()
    const call = async (args: Record<string, unknown>) => parseContent(
      (await client.callTool({ name: 'list_icons', arguments: args })) as { content: Array<{ type: string; text?: string }> },
    ) as {
      ok: boolean
      total: number
      icons: Array<{ id: string; zh: string; d?: string }>
      missing?: string[]
      example?: Record<string, unknown>
    }

    const catalogue = await call({})
    expect(catalogue.total).toBe(catalogue.icons.length)
    expect(catalogue.icons.find((icon) => icon.id === 'check')).toEqual({ id: 'check', zh: '对勾', en: 'Check' })

    const found = await call({ query: '勾' })
    expect(found.icons[0]).toMatchObject({ id: 'check', d: 'M20 6 9 17l-5-5' })
    expect((await call({ query: '没有这种图标' })).icons).toEqual([])

    const picked = await call({ ids: ['star', 'nope'] })
    expect(picked.icons.map((icon) => icon.id)).toEqual(['star'])
    expect(picked.missing).toEqual(['nope'])

    const created = instantiateTemplate('editorial-freeform')
    if (created.workspace !== 'freeform') throw new Error('expected a freeform template')
    const slideId = created.document.slides[0].id
    const applied = parseContent(
      (await client.callTool({
        name: 'apply_actions',
        arguments: {
          document: created.document,
          actions: [{ type: 'node/insert-children', slideId, parentPath: [], nodes: [picked.example] }],
        },
      })) as { content: Array<{ type: string; text?: string }> },
    ) as { ok: boolean; changes: boolean[]; documentId: string }
    expect(applied.changes).toEqual([true])

    const inspected = parseContent(
      (await client.callTool({ name: 'inspect_document', arguments: { documentId: applied.documentId } })) as {
        content: Array<{ type: string; text?: string }>
      },
    ) as { slides: Array<{ nodes: Array<{ id: string; type: string; icon?: string }> }> }
    expect(inspected.slides[0].nodes.at(-1)).toMatchObject({ id: 'icon-star', type: 'path', icon: 'star' })
    await client.close()
  })

  test('list_styles offers palettes and font sets that document/restyle takes, and inspect_document shows the deck\'s own', async () => {
    const client = await connect()
    const styles = await call(client, 'list_styles', {}) as unknown as {
      looks: Array<{ id: string; palette: string; fontSet: string }>
      palettes: Array<{ id: string; background: string; text: string; accents: string[] }>
      fontSets: Array<{ id: string; heading: string; body: string }>
      headingScale: number
    }
    expect(styles.palettes.length).toBeGreaterThanOrEqual(8)
    expect(styles.fontSets.length).toBeGreaterThanOrEqual(5)
    // Every look names a palette and a font set the list has.
    expect(styles.looks.length).toBeGreaterThanOrEqual(6)
    for (const look of styles.looks) {
      expect(styles.palettes.some((palette) => palette.id === look.palette), look.id).toBe(true)
      expect(styles.fontSets.some((set) => set.id === look.fontSet), look.id).toBe(true)
    }
    expect(styles.headingScale).toBeGreaterThan(1)
    const night = styles.palettes.find((palette) => palette.id === 'night-flight')!

    const created = await call<{ documentId: string }>(client, 'create_document_from_template', { templateId: 'editorial-freeform' })
    const before = await call(client, 'inspect_document', { documentId: created.documentId }) as unknown as {
      style: { colors: Array<{ color: string; share: number; uses: string[] }>; fonts: Array<{ fontFamily: string; texts: number }>; bodySize: number }
    }
    expect(before.style.colors[0]).toMatchObject({ color: '#f6f3ea' })
    expect(before.style.colors[0].uses).toContain('background')
    expect(before.style.fonts.map((font) => font.fontFamily)).toContain("'Noto Serif SC', serif")
    expect(before.style.bodySize).toBeGreaterThan(0)

    const restyled = await call(client, 'apply_actions', {
      documentId: created.documentId,
      includeDocument: true,
      actions: [
        { type: 'document/restyle', palette: 'night-flight', fontSet: 'editorial' },
        { type: 'document/restyle', fonts: { "'Noto Sans SC', sans-serif": 'PingFang SC' } },
        { type: 'document/restyle', palette: 'no-such-palette' },
      ],
    }) as unknown as { ok: boolean; changes: boolean[]; document: { slides: Array<{ background: { type: string; color?: string } }> } }
    expect(restyled.ok).toBe(true)
    expect(restyled.changes).toEqual([true, true, false])
    expect(restyled.document.slides[0].background).toEqual({ type: 'solid', color: night.background })
    const after = await call(client, 'inspect_document', { documentId: created.documentId }) as unknown as { style: { fonts: Array<{ fontFamily: string }> } }
    expect(after.style.fonts.map((font) => font.fontFamily).sort()).toEqual(["'Noto Serif SC', serif", 'PingFang SC'])
    await client.close()
  })

  test('open_in_editor hands the document to the editor at a loopback URL', async () => {
    // An editor of the client's own, so the test needs no built frontend; any free port.
    process.env.DINGCARD_APP_URL = 'http://127.0.0.1:5173'
    process.env.DINGCARD_APP_PORT = '0'
    const client = await connect()
    const created = await call<{ documentId: string }>(client, 'create_document_from_template', { templateId: 'editorial-freeform' })
    const opened = await call<{ ok: boolean; url: string; documentUrl: string; appUrl: string; opened: boolean; documentId: string }>(
      client, 'open_in_editor', { documentId: created.documentId, title: '编辑部试稿', open: false },
    )
    expect(opened).toMatchObject({ ok: true, opened: false, appUrl: 'http://127.0.0.1:5173', documentId: created.documentId })
    const link = new URL(opened.url)
    expect(link.origin).toBe('http://127.0.0.1:5173')
    const query = new URLSearchParams(link.hash.replace(/^#\/edit\/canvas\/import\?/, ''))
    expect(query.get('url')).toBe(opened.documentUrl)
    expect(query.get('title')).toBe('编辑部试稿')
    expect(new URL(opened.documentUrl).hostname).toBe('127.0.0.1')

    // The editor reads it from any origin; the document is the kept one.
    const fetched = await fetch(opened.documentUrl)
    expect(fetched.status).toBe(200)
    expect(fetched.headers.get('access-control-allow-origin')).toBe('*')
    const kept = await call<{ document: unknown }>(client, 'get_document', { documentId: created.documentId })
    expect(await fetched.json()).toEqual(kept.document)
    const preflight = await fetch(opened.documentUrl, { method: 'OPTIONS' })
    expect(preflight.headers.get('access-control-allow-private-network')).toBe('true')
    expect((await fetch(opened.documentUrl.replace(/[0-9a-f]{12}\.json$/, '000000000000.json'))).status).toBe(404)
    await client.close()
  })

  test('list_text_styles gives 花字 patches that node/update-style applies', async () => {
    const client = await connect()
    const listed = await call<{ styles: Array<{ id: string; name: string; backdrop: string; patch: Record<string, unknown> }> }>(client, 'list_text_styles', {})
    expect(listed.styles.length).toBeGreaterThanOrEqual(12)
    const label = listed.styles.find((style) => style.id === 'label')!
    expect(label.patch).toMatchObject({ effect: { type: 'background' }, fontWeight: 'bold', stroke: null, shadow: null })

    const created = await call<{ documentId: string; slides: Array<{ id: string }> }>(client, 'create_document_from_template', { templateId: 'editorial-freeform' })
    const inspected = await call<{ slides: Array<{ nodes: Array<{ id: string; name: string }> }> }>(client, 'inspect_document', { documentId: created.documentId })
    const title = inspected.slides[0].nodes.find((node) => node.name === '主标题')!
    const applied = await call<{ ok: boolean; changes: boolean[] }>(client, 'apply_actions', {
      documentId: created.documentId,
      actions: [{ type: 'node/update-style', slideId: created.slides[0].id, updates: [{ path: [title.id], patch: label.patch }] }],
    })
    expect(applied).toMatchObject({ ok: true, changes: [true] })
    const kept = await call<{ document: { documentVersion: number; slides: Array<{ nodes: Array<{ id: string; effect?: unknown }> }> } }>(client, 'get_document', { documentId: created.documentId })
    expect(kept.document.documentVersion).toBe(18)
    expect(kept.document.slides[0].nodes.find((node) => node.id === title.id)?.effect).toEqual(label.patch.effect)
    await client.close()
  })

  test('list_filter_presets gives photo looks that node/update-style applies', async () => {
    const client = await connect()
    const listed = await call<{ presets: Array<{ id: string; name: string; patch: Record<string, unknown> }> }>(client, 'list_filter_presets', {})
    expect(listed.presets.length).toBeGreaterThanOrEqual(8)
    const mono = listed.presets.find((preset) => preset.id === 'mono')!
    expect(mono.patch).toMatchObject({ filter: { grayscale: 1 } })

    const created = await call<{ documentId: string; slides: Array<{ id: string }> }>(client, 'create_document_from_template', { templateId: 'editorial-freeform' })
    const inspected = await call<{ slides: Array<{ nodes: Array<{ id: string; name: string }> }> }>(client, 'inspect_document', { documentId: created.documentId })
    const title = inspected.slides[0].nodes.find((node) => node.name === '主标题')!
    const applied = await call<{ ok: boolean; changes: boolean[] }>(client, 'apply_actions', {
      documentId: created.documentId,
      actions: [{ type: 'node/update-style', slideId: created.slides[0].id, updates: [{ path: [title.id], patch: mono.patch }] }],
    })
    expect(applied).toMatchObject({ ok: true, changes: [true] })
    const kept = await call<{ document: { documentVersion: number; slides: Array<{ nodes: Array<{ id: string; filter?: unknown }> }> } }>(client, 'get_document', { documentId: created.documentId })
    expect(kept.document.documentVersion).toBe(18)
    expect(kept.document.slides[0].nodes.find((node) => node.id === title.id)?.filter).toEqual(mono.patch.filter)

    // The v18-only keys are rejected on older input versions.
    const legacy = await client.callTool({
      name: 'validate_document',
      arguments: { document: { documentVersion: 17, activeSlideId: 's', slides: [{ id: 's', name: '第 1 页', width: 1080, height: 1440, background: { type: 'solid', color: '#ffffff' }, nodes: [{ id: 'n', name: 'N', locked: false, hidden: false, x: 0, y: 0, width: 100, height: 100, rotation: 0, scale: 1, type: 'shape', shape: 'rect', fill: { type: 'solid', color: '#ffffff' }, stroke: '#000000', strokeWidth: 2, filter: { hue: 345 } }] }] } },
    })
    const legacyText = (legacy as { content: Array<{ type: string; text?: string }> }).content[0].text ?? ''
    // The v18-only hue key on a v17 document fails strict validation.
    expect(legacyText).toContain('"ok": false')
    await client.close()
  })

  test('invalid template ids return isError results with available ids', async () => {
    const client = await connect()
    const response = await client.callTool({
      name: 'create_document_from_template',
      arguments: { templateId: 'does-not-exist' },
    })
    expect((response as { isError?: boolean }).isError).toBe(true)
    const content = (response as { content: Array<{ type: string; text?: string }> }).content
    expect(content[0].text ?? '').toContain('可用模板')
    await client.close()
  })

  test('validate_document rejects malformed payloads with ok=false (not a protocol error)', async () => {
    const client = await connect()
    const response = await client.callTool({
      name: 'validate_document',
      arguments: { document: { documentVersion: 4, slides: 'nope' } },
    })
    expect((response as { isError?: boolean }).isError).not.toBe(true)
    const parsed = parseContent(response as { content: Array<{ type: string; text?: string }> })
    expect(parsed).toMatchObject({ ok: false })
    await client.close()
  })
})

describe('server module guards', () => {
  test('does not start stdio when imported (server exported for testing)', () => {
    // If the entry guard failed, connecting stdio in a test process would hang
    // or consume stdin; importing the module (done above) without hanging is
    // the assertion. StdioServerTransport import stays unused otherwise.
    expect(StdioServerTransport).toBeDefined()
    expect(typeof instantiateTemplate).toBe('function')
  })
})
