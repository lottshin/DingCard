import type { User } from '../auth'
import { templatesForWorkspace } from '../templates/registry'
import type { TemplateDefinition, TemplateWorkspace } from '../templates/types'
import { listUserTemplates, userTemplateToDefinition } from '../templates/userTemplates'
import type { WorkspaceMode } from '../workspaces/types'

export function templateWorkspace(system: WorkspaceMode): TemplateWorkspace {
  return system === 'markdown-card' ? 'markdown' : 'freeform'
}

export function templateSystem(template: TemplateDefinition): WorkspaceMode {
  return template.workspace === 'markdown' ? 'markdown-card' : 'freeform-slide'
}

/** The user's own templates first, then the built-ins, for one system. */
export function templatesFor(system: WorkspaceMode, user: User | null): TemplateDefinition[] {
  const workspace = templateWorkspace(system)
  const mine = user
    ? listUserTemplates(user.id).map(userTemplateToDefinition).filter((template) => template.workspace === workspace)
    : []
  return [...mine, ...templatesForWorkspace(workspace)]
}

export function findTemplate(system: WorkspaceMode, id: string, user: User | null): TemplateDefinition | null {
  return templatesFor(system, user).find((template) => template.id === id) ?? null
}
