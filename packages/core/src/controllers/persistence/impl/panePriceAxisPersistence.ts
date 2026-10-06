/** 布局文档中各 Pane 价格轴范围模式切片的浏览器持久化：只存自动/手动开关，不存具体范围值。 */

import type { LayoutPanePriceAxisModes, LayoutPersistence } from '../../../engine/layout/index.js'
import {
  PRICE_AXIS_RANGE_MODE,
  type PriceAxisRangeMode,
} from '../../../foundation/config/priceAxisRangeMode.js'
import {
  bindSnapshotPersistence,
  createLocalStoragePersistence,
  getBrowserLocalStorage,
  type KeyValueStorage,
  type PersistenceCodec,
} from '../../../foundation/persistence/index.js'

/** localStorage 键名。 */
export const PANE_PRICE_AXIS_MODES_STORAGE_KEY = 'kline-chart-pane-price-axis-modes'

function isRangeMode(value: unknown): value is PriceAxisRangeMode {
  return value === PRICE_AXIS_RANGE_MODE.AUTO || value === PRICE_AXIS_RANGE_MODE.HAND
}

const layoutPanePriceAxisModesCodec: PersistenceCodec<LayoutPanePriceAxisModes> = {
  decode(value): LayoutPanePriceAxisModes | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const modes: Record<string, PriceAxisRangeMode> = {}
    for (const [paneId, mode] of Object.entries(value)) {
      if (isRangeMode(mode)) modes[paneId] = mode
    }
    return modes
  },
  encode(value): unknown {
    return value
  },
}

function createPersistence(storage?: KeyValueStorage | null) {
  return createLocalStoragePersistence({
    key: PANE_PRICE_AXIS_MODES_STORAGE_KEY,
    codec: layoutPanePriceAxisModesCodec,
    storage,
  })
}

/** 读取各 Pane 的范围模式；无数据、损坏或不可用时回退 null。 */
export function loadStoredPanePriceAxisModes(
  storage: KeyValueStorage | null = getBrowserLocalStorage(),
): LayoutPanePriceAxisModes | null {
  return createPersistence(storage).load()
}

/** 创建浏览器范围模式持久化适配器。 */
export function createPanePriceAxisPersistence(
  getSnapshot: () => LayoutPanePriceAxisModes,
  storage: KeyValueStorage | null = getBrowserLocalStorage(),
): LayoutPersistence {
  return bindSnapshotPersistence(createPersistence(storage), getSnapshot)
}
