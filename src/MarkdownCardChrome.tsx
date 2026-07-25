import {
  formatMarkdownPageNumber,
  isMarkdownTemplateTheme,
  type MarkdownPageRole,
} from './templates/markdownPresentation'

interface MarkdownCardChromeProps {
  themeId: string
  pageRole: MarkdownPageRole
  pageIndex: number
  pageCount: number
}

const chromeLabels = {
  'template-editorial-archive': 'DING / ARCHIVE',
  'template-public-theatre': 'PUBLIC / ACT',
  'template-issue-cover': 'DING / ISSUE 07',
} as const

export function MarkdownCardChrome({
  themeId,
  pageRole,
  pageIndex,
  pageCount,
}: MarkdownCardChromeProps) {
  if (!isMarkdownTemplateTheme(themeId)) return null

  const themeClass = themeId.replace(/^template-/, '')
  const pageNumber = formatMarkdownPageNumber(pageIndex, pageCount)

  return (
    <div
      className={`markdown-card-chrome markdown-card-chrome--${themeClass}`}
      data-chrome-role={pageRole}
      aria-hidden="true"
    >
      <span className="markdown-chrome-grid" />
      <span className="markdown-chrome-rail" />
      <span className="markdown-chrome-signal" />
      <span className="markdown-chrome-orbit" />
      <span className="markdown-chrome-label">{chromeLabels[themeId]}</span>
      <span className="markdown-chrome-folio">{pageNumber}</span>
      <span className="markdown-chrome-tab">07</span>
      <span className="markdown-chrome-proof">校样</span>
    </div>
  )
}
