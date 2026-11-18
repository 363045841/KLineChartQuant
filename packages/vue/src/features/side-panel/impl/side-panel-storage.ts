/** 侧边面板宽度与停靠侧的 LocalStorage 持久化适配器。 */

import { createLocalStoragePersistence, type PersistenceCodec } from '@363045841yyt/klinechart-core'
import type { SidePanelSide, SidePanelSideStorage, SidePanelWidthStorage } from '../types.js'

/** 宽度与停靠侧使用独立键，任一读取失败都不影响另一项。 */
const SIDE_PANEL_WIDTH_STORAGE_KEY = 'workbench.sidePanel.width'
const SIDE_PANEL_SIDE_STORAGE_KEY = 'workbench.sidePanel.side'

/** 旧 Agent 面板的键名：面板合并进通用侧栏前用的是它们，首次读取时迁移一次。 */
const LEGACY_AGENT_PANEL_WIDTH_KEY = 'agent.panelWidth'
const LEGACY_AGENT_PANEL_SIDE_KEY = 'agent.panelSide'

const widthCodec: PersistenceCodec<number> = {
  decode(value): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null
  },
  encode(value): unknown {
    return value
  },
}

const sideCodec: PersistenceCodec<SidePanelSide> = {
  decode(value): SidePanelSide | null {
    return value === 'left' || value === 'right' ? value : null
  },
  encode(value): unknown {
    return value
  },
}

/** 创建面板宽度的公共持久化适配器；旧键只读一次并写回新键。 */
export function createSidePanelWidthStorage(storage?: Storage): SidePanelWidthStorage {
  const persistence = createLocalStoragePersistence({
    key: SIDE_PANEL_WIDTH_STORAGE_KEY,
    codec: widthCodec,
    storage,
  })
  const legacy = createLocalStoragePersistence({
    key: LEGACY_AGENT_PANEL_WIDTH_KEY,
    codec: widthCodec,
    storage,
  })
  return {
    load(): number | undefined {
      const current = persistence.load()
      if (current !== null) return current
      const previous = legacy.load()
      if (previous === null) return undefined
      persistence.save(previous)
      return previous
    },
    save(width: number): void {
      persistence.save(width)
    },
  }
}

/** 创建面板停靠侧的公共持久化适配器；旧键只读一次并写回新键。 */
export function createSidePanelSideStorage(storage?: Storage): SidePanelSideStorage {
  const persistence = createLocalStoragePersistence({
    key: SIDE_PANEL_SIDE_STORAGE_KEY,
    codec: sideCodec,
    storage,
  })
  const legacy = createLocalStoragePersistence({
    key: LEGACY_AGENT_PANEL_SIDE_KEY,
    codec: sideCodec,
    storage,
  })
  return {
    load(): SidePanelSide | undefined {
      const current = persistence.load()
      if (current !== null) return current
      const previous = legacy.load()
      if (previous === null) return undefined
      persistence.save(previous)
      return previous
    },
    save(side: SidePanelSide): void {
      persistence.save(side)
    },
  }
}
