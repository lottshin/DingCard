import { useEffect, useMemo, useRef, useState } from 'react'
import type { Draft } from '../drafts'
import type { TemplateDefinition } from '../templates/types'
import { AssetsIcon, FreeformMarkIcon, MarkdownMarkIcon, MoonIcon, ProjectsIcon, SearchIcon, TemplatesIcon } from '../ui/icons'
import { DocumentPreview } from './DocumentPreview'
import { templatePreviewSource } from './LoginPage'
import { projectSource, relativeTime } from './ProjectCard'

export interface PaletteAction {
  id: string
  label: string
  hint?: string
  icon: 'markdown' | 'freeform' | 'projects' | 'templates' | 'assets' | 'theme'
  run: () => void
}

interface CommandPaletteProps {
  projects: Draft[]
  templates: TemplateDefinition[]
  actions: PaletteAction[]
  onOpenProject: (draft: Draft) => void
  onUseTemplate: (template: TemplateDefinition) => void
  onClose: () => void
}

type Item =
  | { type: 'project'; key: string; draft: Draft }
  | { type: 'template'; key: string; template: TemplateDefinition }
  | { type: 'action'; key: string; action: PaletteAction }

const ACTION_ICONS = {
  markdown: <MarkdownMarkIcon className="sys-md" />,
  freeform: <FreeformMarkIcon className="sys-ff" />,
  projects: <ProjectsIcon />,
  templates: <TemplatesIcon />,
  assets: <AssetsIcon />,
  theme: <MoonIcon />,
}

function matches(text: string, query: string) {
  return !query || text.toLocaleLowerCase().includes(query.toLocaleLowerCase())
}

export function CommandPalette({ projects, templates, actions, onOpenProject, onUseTemplate, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const q = query.trim()

  const groups = useMemo(() => {
    const projectItems: Item[] = projects.filter((draft) => matches(draft.title, q)).slice(0, 5)
      .map((draft) => ({ type: 'project', key: `p:${draft.id}`, draft }))
    const templateItems: Item[] = templates.filter((template) => matches(`${template.title} ${template.tags.join(' ')}`, q)).slice(0, 4)
      .map((template) => ({ type: 'template', key: `t:${template.id}`, template }))
    const actionItems: Item[] = actions.filter((action) => matches(action.label, q))
      .map((action) => ({ type: 'action', key: `a:${action.id}`, action }))
    return [
      { label: '项目', items: projectItems },
      { label: '模板', items: templateItems },
      { label: '操作', items: actionItems },
    ].filter((group) => group.items.length > 0)
  }, [actions, projects, q, templates])
  const flat = groups.flatMap((group) => group.items)

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    inputRef.current?.focus()
    return () => previous?.focus()
  }, [])
  useEffect(() => setActive(0), [q])
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  function run(item: Item) {
    onClose()
    if (item.type === 'project') onOpenProject(item.draft)
    else if (item.type === 'template') onUseTemplate(item.template)
    else item.action.run()
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((index) => Math.min(flat.length - 1, index + 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((index) => Math.max(0, index - 1))
    } else if (event.key === 'Enter' && flat[active]) {
      event.preventDefault()
      run(flat[active])
    }
  }

  let cursor = -1
  return (
    <div className="palette-back" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="搜索与命令" onKeyDown={onKeyDown}>
        <div className="palette-input">
          <SearchIcon />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索项目、模板，或输入操作"
            aria-label="搜索项目、模板和操作"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
          />
          <kbd>Esc</kbd>
        </div>
        <div className="palette-list" id="palette-list" role="listbox" ref={listRef}>
          {groups.length === 0 && <div className="palette-empty">没有找到“{q}”</div>}
          {groups.map((group) => (
            <div key={group.label} role="group" aria-label={group.label}>
              <div className="palette-group">{group.label}</div>
              {group.items.map((item) => {
                cursor += 1
                const index = cursor
                const selected = index === active
                return (
                  <button
                    key={item.key}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    data-active={selected}
                    className="palette-item"
                    onMouseEnter={() => setActive(index)}
                    onClick={() => run(item)}
                  >
                    {item.type === 'project' && (
                      <>
                        <span className="palette-thumb"><DocumentPreview source={projectSource(item.draft)} width={24} /></span>
                        <span className="palette-label">{item.draft.title}</span>
                        <small className="tnum">{relativeTime(item.draft.updatedAt)}</small>
                      </>
                    )}
                    {item.type === 'template' && (() => {
                      const source = templatePreviewSource(item.template)
                      return (
                        <>
                          <span className="palette-thumb">{source && <DocumentPreview source={source} width={24} />}</span>
                          <span className="palette-label">{item.template.title}</span>
                          <small>{item.template.workspace === 'markdown' ? 'Markdown 卡片模板' : '自由编辑模板'}</small>
                        </>
                      )
                    })()}
                    {item.type === 'action' && (
                      <>
                        <span className="palette-icon">{ACTION_ICONS[item.action.icon]}</span>
                        <span className="palette-label">{item.action.label}</span>
                        {item.action.hint && <small>{item.action.hint}</small>}
                      </>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
