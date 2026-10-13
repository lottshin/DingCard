import { markdownChromeText } from './markdownLooks'
import type { MarkdownPageRole } from './templates/markdownPresentation'
import type { MarkdownLookId } from './theme'

interface MarkdownCardChromeProps {
  look: MarkdownLookId | null
  pageRole: MarkdownPageRole
  pageIndex: number
  pageCount: number
  /** The article's title, for the running head. */
  title?: string
}

/**
 * A look's page furniture, drawn behind the words in the card's margins:
 * the running head (the article's title), the folio, a date and the look's
 * own mark. Which of them shows, and where, is the look's stylesheet's call.
 */
export function MarkdownCardChrome({ look, pageRole, pageIndex, pageCount, title = '' }: MarkdownCardChromeProps) {
  if (!look) return null
  const { folio, date } = markdownChromeText(look, pageIndex, pageCount)

  return (
    <div
      className={`markdown-card-chrome markdown-card-chrome--${look}`}
      data-chrome-role={pageRole}
      aria-hidden="true"
    >
      <span className="markdown-chrome-mark" />
      {title && <span className="markdown-chrome-head">{title}</span>}
      {date && <span className="markdown-chrome-date">{date}</span>}
      <span className="markdown-chrome-folio">{folio}</span>
    </div>
  )
}
