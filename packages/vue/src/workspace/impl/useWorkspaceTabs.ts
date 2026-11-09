/** 标签状态只发布成功提交的快照；本地操作有序，跨窗口操作由 IndexedDB 事务串行化。 */
import type { SymbolSpec } from '@363045841yyt/klinechart-core/controllers'
import { computed, ref, shallowRef } from 'vue'
import {
  createBlankTab,
  reorderTabs,
  type TabDropTarget,
  type TabPlacement,
  type WorkspaceTab,
  type WorkspaceTabs,
} from './workspace-tabs.js'
import { openWorkspaceTabsStore } from './workspace-tabs-store.js'

/** 品种身份：只有这些字段变化才需要改写标签。 */
function specKey(spec: SymbolSpec | null): string {
  if (!spec) return ''
  return [
    spec.source ?? '',
    spec.id ?? '',
    spec.symbol,
    spec.market,
    spec.period ?? '',
    spec.adjust ?? '',
  ].join('|')
}

/** 组装某个工作区的标签操作；所有操作均返回提交完成的 Promise。 */
export function useWorkspaceTabs(workspaceId: string) {
  const store = openWorkspaceTabsStore(workspaceId)
  const state = shallowRef<WorkspaceTabs>({ tabs: [], activeTabId: '' })
  const ready = ref(false)
  let queue: Promise<unknown> = Promise.resolve()

  /** 按调用顺序执行，包括初始化、重读和移交；失败不会卡住后续操作。 */
  function run<T>(operation: () => Promise<T>): Promise<T> {
    const result = queue.then(operation)
    queue = result.catch(() => {})
    return result
  }

  /** 在最新持久化集合上修改，成功后才刷新本窗口。 */
  function commit(change: (current: WorkspaceTabs) => WorkspaceTabs): Promise<void> {
    return run(async () => {
      state.value = await store.update(change)
    })
  }

  /** 初始化落盘完成后才挂载图表，刚创建的标签可以立即被其他窗口接管。 */
  function restore(initialTabs: readonly WorkspaceTab[] | null): Promise<void> {
    return run(async () => {
      state.value = await store.initialize(initialTabs)
      ready.value = true
    })
  }

  /** 创建标签并切换；在其他窗口修改之后也不会覆盖其提交。 */
  function createTab(): Promise<void> {
    const tab = createBlankTab()
    return commit((current) => ({ tabs: [...current.tabs, tab], activeTabId: tab.id }))
  }

  /** 只激活当前仍存在的标签。 */
  function activate(tabId: string): Promise<void> {
    return commit((current) =>
      current.activeTabId === tabId || !current.tabs.some((tab) => tab.id === tabId)
        ? current
        : { ...current, activeTabId: tabId },
    )
  }

  /** 品种通知可能晚于标签移交；查找事务内记录，已移交标签不再写回。 */
  function setSpec(tabId: string, spec: SymbolSpec | null): Promise<void> {
    return commit((current) => {
      const tab = current.tabs.find((candidate) => candidate.id === tabId)
      if (!tab || specKey(tab.spec) === specKey(spec)) return current
      return {
        ...current,
        tabs: current.tabs.map((entry) => (entry.id === tabId ? { ...entry, spec } : entry)),
      }
    })
  }

  /** 用户不能关闭最后一个标签；不存在的标签不触发写入。 */
  function removeTab(tabId: string): Promise<void> {
    return commit((current) => {
      if (current.tabs.length <= 1 || !current.tabs.some((tab) => tab.id === tabId)) return current
      const remaining = current.tabs.filter((tab) => tab.id !== tabId)
      return {
        tabs: remaining,
        activeTabId: current.activeTabId === tabId ? remaining[0]!.id : current.activeTabId,
      }
    })
  }

  /** 在当前提交顺序上重排，活动标签不变。 */
  function moveTab(tabId: string, targetId: string, placement: TabPlacement): Promise<void> {
    return commit((current) => {
      const tabs = reorderTabs(current.tabs, tabId, targetId, placement)
      return tabs === current.tabs ? current : { ...current, tabs }
    })
  }

  /** 原子移交源、目标；事务失败时内存和数据库两边都保持原状态。 */
  function adopt(
    fromWorkspaceId: string,
    tabId: string,
    target: TabDropTarget | null = null,
  ): Promise<{ adopted: boolean; sourceEmptied: boolean }> {
    return run(async () => {
      if (fromWorkspaceId === workspaceId) return { adopted: false, sourceEmptied: false }
      const result = await store.adopt(fromWorkspaceId, tabId, target)
      if (result.destination) state.value = result.destination
      return { adopted: result.adopted, sourceEmptied: result.sourceEmptied }
    })
  }

  /** 只发布最新提交的快照，不把空的源工作区重新初始化。 */
  function reload(): Promise<void> {
    return run(async () => {
      const restored = await store.load()
      if (restored) state.value = restored
    })
  }

  return {
    tabs: computed(() => state.value.tabs),
    activeTabId: computed(() => state.value.activeTabId),
    ready,
    restore,
    createTab,
    activate,
    setSpec,
    removeTab,
    moveTab,
    adopt,
    reload,
    dispose: () => queue,
  }
}
