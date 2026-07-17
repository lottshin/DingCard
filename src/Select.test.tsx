import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test, vi } from 'vitest'
import { Select } from './Select'

describe('Select', () => {
  test('renders an inert empty state without listbox relationships', () => {
    const onChange = vi.fn()

    let markup = ''
    expect(() => {
      markup = renderToStaticMarkup(
        <Select
          value="missing"
          options={[]}
          onChange={onChange}
          testId="empty-select"
          previewFonts
        />,
      )
    }).not.toThrow()

    expect(markup).toContain('data-testid="empty-select"')
    expect(markup).toContain('disabled=""')
    expect(markup).toContain('暂无选项')
    expect(markup).not.toContain('aria-controls')
    expect(markup).not.toContain('aria-activedescendant')
    expect(markup).not.toContain('role="listbox"')
    expect(onChange).not.toHaveBeenCalled()
  })
})
