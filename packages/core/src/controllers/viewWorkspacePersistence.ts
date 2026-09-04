/** 图表视图工作区的浏览器持久化：恢复快照并合并延迟写入。 */
import type {
  ViewWorkspacePersistence,
  ViewWorkspacesSnapshot,
} from '../engine/state/viewWorkspace'

/** localStorage 键名。 */
export const VIEW_WORKSPACES_STORAGE_KEY = 'kline-chart-view-workspaces'
const SAVE_DELAY_MS = 1_000

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

/** 获取浏览器 localStorage；服务端或受限环境返回 null。 */
function getStorage(): StorageLike | null {
  if (typeof globalThis === 'undefined' || !('localStorage' in globalThis)) return null
  try {
    return globalThis.localStorage
  } catch {
    return null
  }
}

/** 读取工作区快照；无数据或 JSON 损坏时回退默认布局。 */
export function loadStoredViewWorkspaces(
  storage: StorageLike | null = getStorage(),
): ViewWorkspacesSnapshot | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(VIEW_WORKSPACES_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as ViewWorkspacesSnapshot
  } catch {
    return null
  }
}

/** 创建浏览器工作区持久化适配器。 */
export function createViewWorkspacePersistence(
  getSnapshot: () => ViewWorkspacesSnapshot,
  storage: StorageLike | null = getStorage(),
): ViewWorkspacePersistence {
  let timer: ReturnType<typeof setTimeout> | null = null

  /** 写入当前快照，并忽略存储受限或配额异常。 */
  const flush = (): void => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
    if (!storage) return
    try {
      storage.setItem(VIEW_WORKSPACES_STORAGE_KEY, JSON.stringify(getSnapshot()))
    } catch {
      // localStorage 在隐私模式或配额不足时不可用，不影响图表运行。
    }
  }

  /** 页面离开时同步补写最后一次尚未完成的变更。 */
  const onPageHide = (): void => {
    if (timer !== null) flush()
  }
  globalThis.addEventListener?.('pagehide', onPageHide)

  return {
    schedule(): void {
      if (!storage) return
      if (timer !== null) clearTimeout(timer)
      timer = setTimeout(flush, SAVE_DELAY_MS)
    },
    dispose(): void {
      globalThis.removeEventListener?.('pagehide', onPageHide)
      if (timer !== null) flush()
    },
  }
}
