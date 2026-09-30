import { useMemo, useSyncExternalStore } from 'react'
import type { WorkspaceMode } from '../workspaces/types'

// Hash routes keep deep links working on any static host (Docker, Vercel,
// `vite preview`) without server-side SPA fallbacks.
export type AppRoute =
  | { name: 'login' }
  | { name: 'home' }
  | { name: 'projects'; system: WorkspaceMode | null }
  | { name: 'templates'; system: WorkspaceMode | null }
  | { name: 'assets' }
  | {
      name: 'edit'
      system: WorkspaceMode | null
      /** `open:<id>`, `new`, or `template:<id>`; consumed once, then dropped from the URL. */
      intent: EditIntent | null
    }

export type EditIntent =
  | { kind: 'open'; draftId: string }
  | { kind: 'new'; platformId: string | null; width: number | null; height: number | null }
  | { kind: 'template'; templateId: string }

const SYSTEM_SEGMENTS: Record<string, WorkspaceMode> = { md: 'markdown-card', canvas: 'freeform-slide' }

export function systemSegment(system: WorkspaceMode): 'md' | 'canvas' {
  return system === 'markdown-card' ? 'md' : 'canvas'
}

function systemFromParam(value: string | null): WorkspaceMode | null {
  return value ? SYSTEM_SEGMENTS[value] ?? null : null
}

function positiveInt(value: string | null): number | null {
  if (!value) return null
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

export function parseRoute(hash: string): AppRoute {
  const raw = hash.replace(/^#/, '')
  const [pathPart, queryPart = ''] = raw.split('?')
  const segments = pathPart.split('/').filter(Boolean)
  const query = new URLSearchParams(queryPart)

  switch (segments[0]) {
    case undefined:
      return { name: 'home' }
    case 'login':
      return { name: 'login' }
    case 'projects':
      return { name: 'projects', system: systemFromParam(query.get('system')) }
    case 'templates':
      return { name: 'templates', system: systemFromParam(query.get('system')) }
    case 'assets':
      return { name: 'assets' }
    case 'edit': {
      const system = systemFromParam(segments[1] ?? null)
      const action = segments[2]
      let intent: EditIntent | null = null
      if (system && action === 'new') {
        intent = {
          kind: 'new',
          platformId: query.get('platform'),
          width: positiveInt(query.get('w')),
          height: positiveInt(query.get('h')),
        }
      } else if (system && action === 'template' && segments[3]) {
        intent = { kind: 'template', templateId: decodeURIComponent(segments[3]) }
      } else if (system && action) {
        intent = { kind: 'open', draftId: decodeURIComponent(action) }
      }
      return { name: 'edit', system, intent }
    }
    default:
      return { name: 'home' }
  }
}

export function navigate(path: string, options: { replace?: boolean } = {}) {
  const hash = path.startsWith('#') ? path : `#${path}`
  if (options.replace) {
    history.replaceState(history.state, '', hash)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    return
  }
  if (location.hash === hash) return
  location.hash = hash
}

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

function snapshot() {
  return location.hash
}

export function useRoute(): AppRoute {
  const hash = useSyncExternalStore(subscribe, snapshot, snapshot)
  return useMemo(() => parseRoute(hash), [hash])
}

export const routes = {
  home: '/',
  login: '/login',
  projects: (system?: WorkspaceMode) => (system ? `/projects?system=${systemSegment(system)}` : '/projects'),
  templates: (system?: WorkspaceMode) => (system ? `/templates?system=${systemSegment(system)}` : '/templates'),
  assets: '/assets',
  editor: (system?: WorkspaceMode) => (system ? `/edit/${systemSegment(system)}` : '/edit'),
  openProject: (system: WorkspaceMode, draftId: string) =>
    `/edit/${systemSegment(system)}/${encodeURIComponent(draftId)}`,
  newProject: (system: WorkspaceMode, options: { platformId?: string; width?: number; height?: number } = {}) => {
    const query = new URLSearchParams()
    if (options.platformId) query.set('platform', options.platformId)
    if (options.width) query.set('w', String(options.width))
    if (options.height) query.set('h', String(options.height))
    const suffix = query.toString()
    return `/edit/${systemSegment(system)}/new${suffix ? `?${suffix}` : ''}`
  },
  fromTemplate: (system: WorkspaceMode, templateId: string) =>
    `/edit/${systemSegment(system)}/template/${encodeURIComponent(templateId)}`,
}
