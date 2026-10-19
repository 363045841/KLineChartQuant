// Agent 面板停靠侧的 LocalStorage 持久化适配器。

import { createLocalStoragePersistence, type PersistenceCodec } from '@363045841yyt/klinechart-core'
import type { AgentPanelSide, AgentPanelSideStorage } from '../types.js'

/** LocalStorage 中用于定位 Agent 面板停靠侧的键名。 */
const AGENT_PANEL_SIDE_STORAGE_KEY = 'agent.panelSide'

const panelSideCodec: PersistenceCodec<AgentPanelSide> = {
  decode(value): AgentPanelSide | null {
    return value === 'left' || value === 'right' ? value : null
  },
  encode(value): unknown {
    return value
  },
}

/** 创建 Agent 面板停靠侧的公共持久化适配器。 */
export function createAgentPanelSideStorage(): AgentPanelSideStorage {
  const persistence = createLocalStoragePersistence({
    key: AGENT_PANEL_SIDE_STORAGE_KEY,
    codec: panelSideCodec,
  })
  return {
    load(): AgentPanelSide | undefined {
      return persistence.load() ?? undefined
    },
    save(side: AgentPanelSide): void {
      persistence.save(side)
    },
  }
}
