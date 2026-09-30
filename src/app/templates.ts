import { templatesForWorkspace } from '../templates/registry'
import type { TemplateDefinition, TemplateWorkspace } from '../templates/types'
import type { WorkspaceMode } from '../workspaces/types'

export function templateWorkspace(system: WorkspaceMode): TemplateWorkspace {
  return system === 'markdown-card' ? 'markdown' : 'freeform'
}

export function templateSystem(template: TemplateDefinition): WorkspaceMode {
  return template.workspace === 'markdown' ? 'markdown-card' : 'freeform-slide'
}

/** The templates that ship with DingCard for one system (see docs/templates.md). */
export function templatesFor(system: WorkspaceMode): readonly TemplateDefinition[] {
  return templatesForWorkspace(templateWorkspace(system))
}

export function findTemplate(system: WorkspaceMode, id: string): TemplateDefinition | null {
  return templatesFor(system).find((template) => template.id === id) ?? null
}
