/** 标签仓库：每项操作读取事务内的最新记录，跨窗口移交一次提交两边，禁止延迟快照覆盖。 */
import { scopedPersistenceName } from '@363045841yyt/klinechart-core/persistence-scope'
import {
  createBlankTab,
  readWorkspaceTabs,
  reorderTabs,
  type TabDropTarget,
  type WorkspaceTab,
  type WorkspaceTabs,
} from './workspace-tabs'

const DATABASE_NAME = '@363045841yyt/klinechart-desktop'
const DATABASE_VERSION = 1
const STORE_NAME = 'workspaces'

/** 跨窗口提交结果；失败或重复接管时没有可发布的目标快照。 */
interface AdoptionResult {
  readonly adopted: boolean
  readonly sourceEmptied: boolean
  readonly destination: WorkspaceTabs | null
}

/** 打开既有标签数据库，沿用原记录键和 schema，不迁移或复制用户数据。 */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(scopedPersistenceName(DATABASE_NAME), DATABASE_VERSION)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** 数据库键只由工作区身份派生，与旧版本保持一致。 */
function workspaceKey(id: string): string {
  return `workspace:${id}`
}

/** 在同一读写事务中完成读取、纯计算与写回；任一同步写入或异步请求失败都会整体回滚。 */
async function transact<T>(
  ids: readonly string[],
  change: (records: ReadonlyMap<string, WorkspaceTabs | null>) => {
    writes: ReadonlyMap<string, WorkspaceTabs>
    result: T
  },
): Promise<T> {
  const database = await openDatabase()
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const records = new Map<string, WorkspaceTabs | null>()
      let result: T
      let failure: unknown
      transaction.oncomplete = () => resolve(result)
      transaction.onabort = () => reject(failure ?? transaction.error)
      for (const id of ids) {
        const request = store.get(workspaceKey(id))
        request.onsuccess = () => {
          records.set(id, readWorkspaceTabs(request.result))
          if (records.size !== ids.length) return
          try {
            const changed = change(records)
            result = changed.result
            for (const [workspaceId, value] of changed.writes) {
              store.put(value, workspaceKey(workspaceId))
            }
          } catch (error) {
            failure = error
            transaction.abort()
          }
        }
      }
    })
  } finally {
    database.close()
  }
}

/** 绑定工作区身份；不缓存可变快照，也不注册页面退出时的旧快照补写。 */
export function openWorkspaceTabsStore(workspaceId: string) {
  return {
    /** 读取最新提交记录，读取失败直接传播，不能解释成空白工作区。 */
    load(): Promise<WorkspaceTabs | null> {
      return transact([workspaceId], (records) => ({
        writes: new Map(),
        result: records.get(workspaceId)!,
      }))
    },
    /** 只在记录不存在时创建；空记录表示已移交，不会自动复活。 */
    initialize(initialTabs: readonly WorkspaceTab[] | null): Promise<WorkspaceTabs> {
      return transact([workspaceId], (records) => {
        const existing = records.get(workspaceId)
        if (existing) return { writes: new Map(), result: existing }
        const tabs = initialTabs ?? [createBlankTab()]
        const initial: WorkspaceTabs = { tabs, activeTabId: tabs[0]?.id ?? '' }
        return { writes: new Map([[workspaceId, initial]]), result: initial }
      })
    },
    /** 对最新记录执行领域操作；调用方不能用缓存的整份快照覆盖其他窗口的修改。 */
    update(change: (current: WorkspaceTabs) => WorkspaceTabs): Promise<WorkspaceTabs> {
      return transact([workspaceId], (records) => {
        const current = records.get(workspaceId)
        if (!current) throw new Error('The workspace has not been initialized.')
        const next = change(current)
        return {
          writes: current === next ? new Map() : new Map([[workspaceId, next]]),
          result: next,
        }
      })
    },
    /** 移交两个工作区；只有事务提交后调用方才能发布目标内存状态或关闭源窗口。 */
    adopt(
      fromWorkspaceId: string,
      tabId: string,
      target: TabDropTarget | null,
    ): Promise<AdoptionResult> {
      if (fromWorkspaceId === workspaceId) {
        return Promise.resolve({ adopted: false, sourceEmptied: false, destination: null })
      }
      return transact<AdoptionResult>([fromWorkspaceId, workspaceId], (records) => {
        const source = records.get(fromWorkspaceId)
        const destination = records.get(workspaceId)
        const moved = source?.tabs.find((tab) => tab.id === tabId)
        if (!source || !destination || !moved || destination.tabs.some((tab) => tab.id === tabId)) {
          return {
            writes: new Map(),
            result: { adopted: false, sourceEmptied: false, destination: null },
          }
        }
        const remaining = source.tabs.filter((tab) => tab.id !== tabId)
        const sourceNext: WorkspaceTabs = {
          tabs: remaining,
          activeTabId: remaining.some((tab) => tab.id === source.activeTabId)
            ? source.activeTabId
            : (remaining[0]?.id ?? ''),
        }
        const appended = [...destination.tabs, moved]
        const destinationNext: WorkspaceTabs = {
          tabs: target ? reorderTabs(appended, moved.id, target.id, target.placement) : appended,
          activeTabId: moved.id,
        }
        return {
          writes: new Map([
            [fromWorkspaceId, sourceNext],
            [workspaceId, destinationNext],
          ]),
          result: {
            adopted: true,
            sourceEmptied: remaining.length === 0,
            destination: destinationNext,
          },
        }
      })
    },
  }
}
