import { useId, useState, type KeyboardEvent, type ReactNode, type Ref } from 'react'

export type FreeformRightPanelTab = 'properties' | 'layers'

export interface FreeformRightPanelProps {
  children: ReactNode
  layers: ReactNode
  propertiesTabRef?: Ref<HTMLButtonElement>
}

const TABS: Array<{ id: FreeformRightPanelTab; label: string }> = [
  { id: 'properties', label: '属性' },
  { id: 'layers', label: '图层' },
]

/** Right-side property/layers switcher. Tab state is intentionally UI-only. */
export function FreeformRightPanel({
  children,
  layers,
  propertiesTabRef,
}: FreeformRightPanelProps) {
  const [activeTab, setActiveTab] = useState<FreeformRightPanelTab>('properties')
  const [focusedTab, setFocusedTab] = useState<FreeformRightPanelTab>('properties')
  const baseId = useId().replace(/:/g, '')
  const tabId = (tab: FreeformRightPanelTab) => `freeform-${baseId}-${tab}-tab`
  const panelId = (tab: FreeformRightPanelTab) => `freeform-${baseId}-${tab}-panel`

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
      className="freeform-inspector freeform-right-panel"
      aria-label="属性和图层面板"
    >
      <div className="freeform-right-tabs" role="tablist" aria-label="自由编辑面板">
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
            {tab.label}
          </button>
        ))}
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
    </aside>
  )
}
