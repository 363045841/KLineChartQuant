/** 各 Pane 价格轴范围模式的浏览器持久化：只保存自动/手动开关，不保存具体范围值。 */

import type {
  PanePriceAxisModePersistence,
  PanePriceAxisModesSnapshot,
} from '../engine/state/mainPriceAxisState.js'
import {
  PRICE_AXIS_RANGE_MODE,
  type PriceAxisRangeMode,
} from '../foundation/config/priceAxisRangeMode.js'
import {
  bindSnapshotPersistence,
  createLocalStoragePersistence,
  getBrowserLocalStorage,
  type KeyValueStorage,
  type PersistenceCodec,
} from '../foundation/persistence/index.js'

/** localStorage 键名。 */
export const PANE_PRICE_AXIS_MODES_STORAGE_KEY = 'kline-chart-pane-price-axis-modes'

function isRangeMode(value: unknown): value is PriceAxisRangeMode {
  return value === PRICE_AXIS_RANGE_MODE.AUTO || value === PRICE_AXIS_RANGE_MODE.HAND
}

const panePriceAxisModesCodec: PersistenceCodec<PanePriceAxisModesSnapshot> = {
  decode(value): PanePriceAxisModesSnapshot | null {
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
    codec: panePriceAxisModesCodec,
    storage,
  })
}

/** 读取各 Pane 的范围模式；无数据、损坏或不可用时回退 null。 */
export function loadStoredPanePriceAxisModes(
  storage: KeyValueStorage | null = getBrowserLocalStorage(),
): PanePriceAxisModesSnapshot | null {
  return createPersistence(storage).load()
}

/** 创建浏览器范围模式持久化适配器。 */
export function createPanePriceAxisPersistence(
  getSnapshot: () => PanePriceAxisModesSnapshot,
  storage: KeyValueStorage | null = getBrowserLocalStorage(),
): PanePriceAxisModePersistence {
  return bindSnapshotPersistence(createPersistence(storage), getSnapshot)
}
