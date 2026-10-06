/** 布局文档中视图工作区切片的浏览器持久化：恢复快照并合并延迟写入。 */

import type { LayoutPersistence, LayoutWorkspaces } from '../../../engine/layout/index.js'
import {
  bindSnapshotPersistence,
  createLocalStoragePersistence,
  getBrowserLocalStorage,
  type KeyValueStorage,
  type PersistenceCodec,
} from '../../../foundation/persistence/index.js'

/** localStorage 键名。 */
export const VIEW_WORKSPACES_STORAGE_KEY = 'kline-chart-view-workspaces'

function isLayoutWorkspaces(value: unknown): value is LayoutWorkspaces {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

const layoutWorkspacesCodec: PersistenceCodec<LayoutWorkspaces> = {
  decode(value): LayoutWorkspaces | null {
    return isLayoutWorkspaces(value) ? value : null
  },
  encode(value): unknown {
    return value
  },
}

function createPersistence(storage?: KeyValueStorage | null) {
  return createLocalStoragePersistence({
    key: VIEW_WORKSPACES_STORAGE_KEY,
    codec: layoutWorkspacesCodec,
    storage,
  })
}

/** 读取工作区快照；无数据或 JSON 损坏时回退默认布局。 */
export function loadStoredViewWorkspaces(
  storage: KeyValueStorage | null = getBrowserLocalStorage(),
): LayoutWorkspaces | null {
  return createPersistence(storage).load()
}

/** 创建浏览器工作区持久化适配器。 */
export function createViewWorkspacePersistence(
  getSnapshot: () => LayoutWorkspaces,
  storage: KeyValueStorage | null = getBrowserLocalStorage(),
): LayoutPersistence {
  return bindSnapshotPersistence(createPersistence(storage), getSnapshot)
}
