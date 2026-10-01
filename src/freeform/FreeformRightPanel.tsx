import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from 'react'
import { t } from '../i18n'
import { CloseIcon } from '../ui/icons'

export type FreeformRightPanelTab = 'properties' | 'layers' | 'history'

export interface FreeformRightPanelProps {
  children: ReactNode
  layers: ReactNode
  history: ReactNode
  propertiesTabRef?: Ref<HTMLButtonElement>
  disabled?: boolean
  /** The tab on show; the editor opens the panel on a given tab. */
  activeTab: FreeformRightPanelTab
  onTabChange: (tab: FreeformRightPanelTab) => void
  onClose: () => void
}

const TABS: Array<{ id: FreeformRightPanelTab; label: string }> = [
  { id: 'properties', label: '属性' },
  { id: 'layers', label: '图层' },
  { id: 'history', label: '历史' },
]

/** The settings panel beside the canvas: properties, layers and history, opened on demand. */
export function FreeformRightPanel({
  children,
  layers,
  history,
  propertiesTabRef,
  disabled = false,
  activeTab,
  onTabChange,
  onClose,
}: FreeformRightPanelProps) {
  const rootRef = useRef<HTMLElement>(null)
  const [focusedTab, setFocusedTab] = useState<FreeformRightPanelTab>(activeTab)
  const setActiveTab = onTabChange

  useEffect(() => {
    setFocusedTab(activeTab)
  }, [activeTab])
  const baseId = useId().replace(/:/g, '')
  const tabId = (tab: FreeformRightPanelTab) => `freeform-${baseId}-${tab}-tab`
  const panelId = (tab: FreeformRightPanelTab) => `freeform-${baseId}-${tab}-panel`

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    if (disabled) root.setAttribute('inert', '')
    else root.removeAttribute('inert')
  }, [disabled])

  function moveTab(tab: FreeformRightPanelTab, event: KeyboardEvent<HTMLButtonElement>) {
    const currentIndex = TABS.findIndex((candidate) => candidate.id === tab)
    let nextIndex = currentIndex
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % TABS.length
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + TABS.length) % TABS.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = TABS.length - 1
    if (nextIndex === currentIndex) return
    event.preventDefault()
    event.stopPropagation()
    const next = TABS[nextIndex].id
    setFocusedTab(next)
    setActiveTab(next)
    requestAnimationFrame(() => document.getElementById(tabId(next))?.focus())
  }

  return (
    <aside
      ref={rootRef}
      className={`freeform-inspector freeform-right-panel${disabled ? ' is-disabled' : ''}`}
      aria-label={t('属性和图层面板')}
      aria-disabled={disabled || undefined}
    >
      <div className="freeform-right-head">
      <div className="freeform-right-tabs" role="tablist" aria-label={t('自由编辑面板')}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            ref={tab.id === 'properties' ? propertiesTabRef : undefined}
            id={tabId(tab.id)}
            className={tab.id === activeTab ? 'freeform-right-tab is-active' : 'freeform-right-tab'}
            type="button"
            role="tab"
            aria-selected={tab.id === activeTab}
            aria-controls={panelId(tab.id)}
            tabIndex={tab.id === focusedTab ? 0 : -1}
            onClick={() => {
              setActiveTab(tab.id)
              setFocusedTab(tab.id)
            }}
            onFocus={() => setFocusedTab(tab.id)}
            onKeyDown={(event) => moveTab(tab.id, event)}
          >
            {t(tab.label)}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="icon-btn freeform-right-close"
        data-testid="freeform-panel-close"
        aria-label={t('收起面板')}
        title={t('收起面板')}
        onClick={onClose}
      >
        <CloseIcon />
      </button>
      </div>
      <div
        id={panelId('properties')}
        className="freeform-right-tabpanel freeform-properties-tabpanel"
        role="tabpanel"
        aria-labelledby={tabId('properties')}
        hidden={activeTab !== 'properties'}
      >
        {children}
      </div>
      <div
        id={panelId('layers')}
        className="freeform-right-tabpanel freeform-layers-tabpanel"
        role="tabpanel"
        aria-labelledby={tabId('layers')}
        hidden={activeTab !== 'layers'}
      >
        {layers}
      </div>
      <div
        id={panelId('history')}
        className="freeform-right-tabpanel freeform-history-tabpanel"
        role="tabpanel"
        aria-labelledby={tabId('history')}
        hidden={activeTab !== 'history'}
      >
        {history}
      </div>
    </aside>
  )
}
