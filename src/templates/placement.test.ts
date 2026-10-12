import { describe, expect, it } from 'vitest'
import { TEMPLATE_REGISTRY } from './registry'

const doc = (series: string) => {
  const template = TEMPLATE_REGISTRY.find((candidate) => candidate.series === series)
  return template!.createFreeform!()
}
const node = (series: string, name: string) => {
  const found = doc(series).slides[0].nodes.find((candidate: { name: string }) => candidate.name === name)
  expect(found, `${series}: ${name}`).toBeDefined()
  return found as { x: number; y: number; width: number; height: number; type: string }
}
const inside = (series: string, inner: string, outer: string, margin: number, verticalMargin = margin) => {
  const a = node(series, inner)
  const b = node(series, outer)
  expect(a.x - b.x, `${series} ${inner} left`).toBeGreaterThanOrEqual(margin)
  expect(b.x + b.width - (a.x + a.width), `${series} ${inner} right`).toBeGreaterThanOrEqual(margin)
  expect(a.y - b.y, `${series} ${inner} top`).toBeGreaterThanOrEqual(verticalMargin)
  expect(b.y + b.height - (a.y + a.height), `${series} ${inner} bottom`).toBeGreaterThanOrEqual(verticalMargin)
}
const clear = (series: string, a: string, b: string) => {
  const first = node(series, a)
  const second = node(series, b)
  const overlap = first.x < second.x + second.width && second.x < first.x + first.width
    && first.y < second.y + second.height && second.y < first.y + first.height
  expect(overlap, `${series}: ${a} overlaps ${b}`).toBe(false)
}

describe('template placement', () => {
  it('centres the button copy on its plate', () => {
    // The copy shares the plate's width and centres itself, as price-list does.
    inside('launch-poster', '按钮文字', '按钮底板', 0, 16)
    inside('wedding-invitation', '按钮文字', '按钮底板', 0, 16)
    inside('talk-poster', '按钮文字', '按钮底板', 0, 16)
  })

  it('keeps the words clear of the pictures, the chart and the table', () => {
    clear('data-roundup', '角标', '标题')
    clear('data-roundup', '图表', '信息一')
    clear('data-roundup', '图表', '标签三')
    clear('compare-table', '对比表', '结论')
    clear('compare-table', '刊头色块', '对比表')
    clear('exhibition-poster', '英文标语', '标题')
    clear('dessert-menu', '主图', '菜品一')
    clear('dessert-menu', '花束', '价格八')
    clear('dessert-menu', '花束', '品牌')
    clear('portfolio-cover', '英文标语', '标题')
    clear('solar-term', '标题', '副标题')
  })
})
