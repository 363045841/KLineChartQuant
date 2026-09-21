/** 图表视图工作区的浏览器持久化：恢复快照并合并延迟写入。 */

import type {
  ViewWorkspacePersistence,
  ViewWorkspacesSnapshot,
} from '../engine/state/viewWorkspace.js'
import {
  createLocalStoragePersistence,
  getBrowserLocalStorage,
  type KeyValueStorage,
  type PersistenceCodec,
} from '../foundation/persistence/index.js'

/** localStorage 键名。 */
export const VIEW_WORKSPACES_STORAGE_KEY = 'kline-chart-view-workspaces'

function isViewWorkspacesSnapshot(value: unknown): value is ViewWorkspacesSnapshot {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

const viewWorkspacesCodec: PersistenceCodec<ViewWorkspacesSnapshot> = {
  decode(value): ViewWorkspacesSnapshot | null {
    return isViewWorkspacesSnapshot(value) ? value : null
  },
  encode(value): unknown {
    return value
  },
}

function createPersistence(storage?: KeyValueStorage | null) {
  return createLocalStoragePersistence({
    key: VIEW_WORKSPACES_STORAGE_KEY,
    codec: viewWorkspacesCodec,
    storage,
  })
}

/** 读取工作区快照；无数据或 JSON 损坏时回退默认布局。 */
export function loadStoredViewWorkspaces(
  storage: KeyValueStorage | null = getBrowserLocalStorage(),
): ViewWorkspacesSnapshot | null {
  return createPersistence(storage).load()
}

/** 创建浏览器工作区持久化适配器。 */
export function createViewWorkspacePersistence(
  getSnapshot: () => ViewWorkspacesSnapshot,
  storage: KeyValueStorage | null = getBrowserLocalStorage(),
): ViewWorkspacePersistence {
  const persistence = createPersistence(storage)

  return {
    schedule(): void {
      persistence.schedule(getSnapshot)
    },
    dispose(): void {
      persistence.dispose()
    },
  }
}
