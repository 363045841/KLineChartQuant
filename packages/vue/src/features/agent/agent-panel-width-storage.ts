import { createLocalStoragePersistence, type PersistenceCodec } from '@363045841yyt/klinechart-core'
import type { AgentPanelWidthStorage } from './workbench-shell.js'

/** LocalStorage 中用于定位 Agent 面板宽度的键名。 */
export const AGENT_PANEL_WIDTH_STORAGE_KEY = 'agent.panelWidth'

const panelWidthCodec: PersistenceCodec<number> = {
  decode(value): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null
  },
  encode(value): unknown {
    return value
  },
}

/** 创建 Agent 面板宽度的公共持久化适配器。 */
export function createAgentPanelWidthStorage(): AgentPanelWidthStorage {
  const persistence = createLocalStoragePersistence({
    key: AGENT_PANEL_WIDTH_STORAGE_KEY,
    codec: panelWidthCodec,
  })
  return {
    load(): number | undefined {
      return persistence.load() ?? undefined
    },
    save(width: number): void {
      persistence.save(width)
    },
  }
}
