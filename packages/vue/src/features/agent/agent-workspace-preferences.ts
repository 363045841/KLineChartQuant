import { createLocalStoragePersistence, type PersistenceCodec } from '@363045841yyt/klinechart-core'

export interface AgentWorkspacePreferences {
  readonly locale: 'en' | 'zh-CN'
  readonly readOnly: boolean
  readonly collapseReasoning: boolean
}

const AGENT_WORKSPACE_PREFERENCES_STORAGE_KEY = 'agent.workspace-preferences'

function isAgentWorkspacePreferences(value: unknown): value is AgentWorkspacePreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const locale = Object.getOwnPropertyDescriptor(value, 'locale')?.value
  const readOnly = Object.getOwnPropertyDescriptor(value, 'readOnly')?.value
  const collapseReasoning = Object.getOwnPropertyDescriptor(value, 'collapseReasoning')?.value
  return (
    (locale === 'en' || locale === 'zh-CN') &&
    typeof readOnly === 'boolean' &&
    typeof collapseReasoning === 'boolean'
  )
}

const agentWorkspacePreferencesCodec: PersistenceCodec<AgentWorkspacePreferences> = {
  decode(value): AgentWorkspacePreferences | null {
    return isAgentWorkspacePreferences(value) ? value : null
  },
  encode(value): unknown {
    return value
  },
}

export const agentWorkspacePreferencesPersistence = createLocalStoragePersistence({
  key: AGENT_WORKSPACE_PREFERENCES_STORAGE_KEY,
  codec: agentWorkspacePreferencesCodec,
})

export function defaultAgentWorkspacePreferences(): AgentWorkspacePreferences {
  return {
    locale:
      typeof navigator !== 'undefined' && navigator.language.startsWith('zh') ? 'zh-CN' : 'en',
    readOnly: false,
    collapseReasoning: false,
  }
}
