import { describe, expect, it } from 'vitest'

import { fontOptions, fontPickerValue, fontLabel, IMPORT_FONT_OPTION } from '../fontChoices'
import { createFontLibrary, createMemoryFontBackend, type FontRegistry } from '../fontLibrary'

function ttf(name: string): File {
  // The name table reader needs a real table; a bare TrueType header leaves the file name to name it.
  const bytes = new Uint8Array(64)
  new DataView(bytes.buffer).setUint32(0, 0x00010000)
  return new File([bytes], name)
}

function fakeRegistry(reject = new Set<string>()) {
  const added: string[] = []
  const registry: FontRegistry = {
    async add(family) {
      if (reject.has(family)) throw new Error('浏览器读不了这个字体文件，换一个试试')
      added.push(family)
    },
    remove(family) {
      added.splice(added.indexOf(family), 1)
    },
  }
  return { registry, added }
}

describe('font library', () => {
  it('imports, lists newest first, replaces a font imported again under its name, and removes', async () => {
    const backend = createMemoryFontBackend()
    const { registry, added } = fakeRegistry()
    let clock = 1
    const library = createFontLibrary(backend, registry, () => clock++)
    const changes: number[] = []
    library.subscribe(() => changes.push(library.list().length))

    const first = await library.importFile(ttf('Smiley Sans.ttf'))
    const second = await library.importFile(ttf('Chalk.otf'))
    expect(library.list().map((font) => font.family)).toEqual(['Chalk', 'Smiley Sans'])
    expect(first).toMatchObject({ family: 'Smiley Sans', format: 'truetype', bytes: 64 })

    const again = await library.importFile(ttf('Smiley Sans.ttf'))
    expect(again.id).toBe(first.id)
    expect(library.list().map((font) => font.family)).toEqual(['Smiley Sans', 'Chalk'])
    expect((await backend.all())).toHaveLength(2)

    expect(library.fontFor("'Chalk', sans-serif")?.id).toBe(second.id)
    expect(library.fontFor('Chalk')?.id).toBe(second.id)
    expect(library.fontFor("'Noto Sans SC', sans-serif")).toBeUndefined()

    await library.remove(second.id)
    expect(library.list().map((font) => font.family)).toEqual(['Smiley Sans'])
    expect(added).toEqual(['Smiley Sans', 'Smiley Sans'])
    expect(changes.length).toBeGreaterThanOrEqual(4)
  })

  it('turns away what is not a font, too big, or unreadable, and saves nothing for it', async () => {
    const backend = createMemoryFontBackend()
    const { registry } = fakeRegistry(new Set(['Broken']))
    const library = createFontLibrary(backend, registry)
    await expect(library.importFile(new File(['<svg/>   '], 'logo.ttf'))).rejects.toThrow('不是可用的字体文件')
    await expect(library.importFile(ttf('Broken.ttf'))).rejects.toThrow('浏览器读不了')
    const huge = ttf('Huge.ttf')
    Object.defineProperty(huge, 'size', { value: 41 * 1024 * 1024 })
    await expect(library.importFile(huge)).rejects.toThrow('字体文件太大')
    expect(await backend.all()).toEqual([])
    expect(library.list()).toEqual([])
  })

  it('keeps a built-in font its name and numbers the import', async () => {
    const library = createFontLibrary(createMemoryFontBackend(), fakeRegistry().registry)
    expect((await library.importFile(ttf('Noto Sans SC.woff'))).family).toBe('Noto Sans SC 2')
  })

  it('loads saved fonts once, registering each, and skips one the browser no longer reads', async () => {
    const backend = createMemoryFontBackend()
    await createFontLibrary(backend, fakeRegistry().registry, () => 1).importFile(ttf('Old.ttf'))
    await createFontLibrary(backend, fakeRegistry().registry, () => 2).importFile(ttf('Good.ttf'))
    const { registry, added } = fakeRegistry(new Set(['Old']))
    const library = createFontLibrary(backend, registry)
    await Promise.all([library.load(), library.load()])
    expect(added).toEqual(['Good'])
    expect(library.list().map((font) => font.family)).toEqual(['Good'])
  })

  it('names fonts in the pickers, imported ones after the built-in ones, then the import action', async () => {
    const library = createFontLibrary(createMemoryFontBackend(), fakeRegistry().registry)
    await library.importFile(ttf('Smiley Sans.ttf'))
    expect(fontLabel('PingFang SC, Microsoft YaHei, system-ui, sans-serif')).toBe('苹方 PingFang')
    expect(fontPickerValue('PingFang SC, Microsoft YaHei, system-ui, sans-serif')).toBe('PingFang SC')
    expect(fontLabel("'Smiley Sans', sans-serif")).toBe('Smiley Sans')
    const options = fontOptions(library.list(), { current: "'Elsewhere', sans-serif", withImport: true })
    expect(options.slice(-3).map((option) => option.label)).toEqual(['Smiley Sans', 'Elsewhere', '导入字体…'])
    expect(options[options.length - 3].id).toBe("'Smiley Sans', sans-serif")
    expect(options[options.length - 1].id).toBe(IMPORT_FONT_OPTION)
    // A family the list already has adds nothing.
    expect(fontOptions([], { current: 'PingFang SC, Microsoft YaHei, system-ui, sans-serif' })).toHaveLength(7)
  })
})
