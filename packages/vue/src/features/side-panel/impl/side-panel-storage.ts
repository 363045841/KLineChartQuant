/** 侧边面板宽度与停靠侧的 LocalStorage 持久化适配器。 */

import { createLocalStoragePersistence, type PersistenceCodec } from '@363045841yyt/klinechart-core'
import type { SidePanelSide, SidePanelSideStorage, SidePanelWidthStorage } from '../types.js'

/** 宽度与停靠侧使用独立键，任一读取失败都不影响另一项。 */
const SIDE_PANEL_WIDTH_STORAGE_KEY = 'workbench.sidePanel.width'
const SIDE_PANEL_SIDE_STORAGE_KEY = 'workbench.sidePanel.side'

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

/** 创建面板宽度的公共持久化适配器。 */
export function createSidePanelWidthStorage(): SidePanelWidthStorage {
  const persistence = createLocalStoragePersistence({
    key: SIDE_PANEL_WIDTH_STORAGE_KEY,
    codec: widthCodec,
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

/** 创建面板停靠侧的公共持久化适配器。 */
export function createSidePanelSideStorage(): SidePanelSideStorage {
  const persistence = createLocalStoragePersistence({
    key: SIDE_PANEL_SIDE_STORAGE_KEY,
    codec: sideCodec,
  })
  return {
    load(): SidePanelSide | undefined {
      return persistence.load() ?? undefined
    },
    save(side: SidePanelSide): void {
      persistence.save(side)
    },
  }
}
