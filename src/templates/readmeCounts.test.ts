import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DECORATIONS } from '../freeform/decorations'
import { ICONS } from '../freeform/iconLibrary'
import { TEXT_STYLE_PRESETS } from '../freeform/textStyles'
import { TEMPLATE_FORMATS } from './formats'
import { TEMPLATE_REGISTRY, templatesForWorkspace } from './registry'

// The README's numbers are typed by hand: 0.60.0 shipped "84 套模板" in the
// header line after the registry reached 88. These read the code instead.
const readme = readFileSync('README.md', 'utf8')
const mcpSource = readFileSync('mcp/src/index.ts', 'utf8')
const HAN = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十']

describe('README counts', () => {
  const freeform = templatesForWorkspace('freeform')
  const looks = templatesForWorkspace('markdown').length
  const decks = freeform.filter((template) => template.kind === 'deck').length
  const posters = freeform.filter((template) => template.kind === 'poster').length
  const tools = mcpSource.match(/^\s*server\.tool\(/gm)?.length ?? 0

  it('match the template registry', () => {
    expect(readme).toContain(`<strong>${TEMPLATE_REGISTRY.length}</strong> 套模板`)
    expect(readme).toContain(`**${TEMPLATE_REGISTRY.length} 套模板，都在仓库里维护。**`)
    expect(readme).toContain(`**Markdown 长文版式** ${looks} 套`)
    expect(readme).toContain(`${HAN[looks]}套长文版式`)
    expect(readme).toContain(`自由画布有${HAN[decks]}套`)
    expect(readme).toContain(`**单页模板** ${posters} 张，覆盖 ${TEMPLATE_FORMATS.length} 种尺寸`)
    expect(readme).toContain(`<strong>${TEMPLATE_FORMATS.length}</strong> 种预设尺寸`)
  })

  it('match the MCP tools and the canvas libraries', () => {
    expect(tools).toBeGreaterThan(0)
    expect(readme).toContain(`<strong>${tools}</strong> 个 MCP 工具`)
    expect(readme).toContain(`提供 ${tools} 个工具`)
    expect(readme).toContain(`${TEXT_STYLE_PRESETS.length} 种花字`)
    expect(readme).toContain(`${ICONS.length} 个可搜索的线性图标`)
    expect(readme).toContain(`${DECORATIONS.length} 个手绘线条、贴纸和标签`)
  })
})
