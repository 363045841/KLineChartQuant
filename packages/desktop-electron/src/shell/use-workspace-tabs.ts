/**
 * 标签页状态：标签顺序、活动标签与跨窗口接管。
 *
 * 单一真相是 `state`；每次变更后整份快照写回 IndexedDB，
 * 不存在“先改一半再补写”的中间态。
 */
import type { SymbolSpec } from '@363045841yyt/klinechart-core/controllers'
import { computed, ref, shallowRef } from 'vue'

import type { WorkspaceTab } from '../../electron/window-bridge'
import {
  createBlankTab,
  DEFAULT_TAB_LABEL,
  loadWorkspaceTabs,
  openWorkspaceTabsStore,
  readWorkspaceTabs,
  reorderTabs,
  saveWorkspaceTabs,
  type TabDropTarget,
  type TabPlacement,
  type WorkspaceTabs,
} from './workspace-tabs'

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

/** 新建空标签页时的初始集合。 */
function createInitialState(): WorkspaceTabs {
  const tab = createBlankTab()
  return { tabs: [tab], activeTabId: tab.id }
}

/**
 * 组装标签页状态与操作。
 *
 * @param workspaceId 本窗口的工作区身份
 */
export function useWorkspaceTabs(workspaceId: string) {
  const store = openWorkspaceTabsStore(workspaceId)
  const state = shallowRef<WorkspaceTabs>(createInitialState())
  const ready = ref(false)
  // 首帧可能没有活动图表的符号，主题同步由 App 在控制器就绪时补齐。

  const tabs = computed(() => state.value.tabs)
  const activeTabId = computed(() => state.value.activeTabId)

  /** 提交新集合并把整份快照排入落盘队列。 */
  function commit(next: WorkspaceTabs): void {
    state.value = next
    store.schedule(() => state.value)
  }

  /**
   * 恢复标签页集合。
   *
   * 拖出窗口时初始标签由主进程下发；否则读取本工作区的落盘记录。
   *
   * @param initialTabs 主进程移交的标签
   */
  async function restore(initialTabs: ReadonlyArray<WorkspaceTab> | null): Promise<void> {
    const fromHost = initialTabs ? readWorkspaceTabs({ tabs: initialTabs }) : null
    const restored = fromHost ?? (await store.load()) ?? createInitialState()
    state.value = restored
    ready.value = true
    store.schedule(() => state.value)
  }

  /** 新增一个空标签页并切换过去。 */
  function createTab(): void {
    const tab = createBlankTab()
    commit({ tabs: [...state.value.tabs, tab], activeTabId: tab.id })
  }

  /** 切换活动标签；已是活动标签时保持不动。 */
  function activate(tabId: string): void {
    if (state.value.activeTabId === tabId) return
    if (!state.value.tabs.some((tab) => tab.id === tabId)) return
    commit({ ...state.value, activeTabId: tabId })
  }

  /** 图表的品种变化回写到标签，标题始终跟随当前品种。 */
  function setSpec(tabId: string, spec: SymbolSpec | null): void {
    const current = state.value.tabs.find((tab) => tab.id === tabId)
    if (!current) return
    const label = spec?.symbol ?? DEFAULT_TAB_LABEL
    if (current.label === label && specKey(current.spec) === specKey(spec)) return
    commit({
      tabs: state.value.tabs.map((tab) => (tab.id === tabId ? { ...tab, label, spec } : tab)),
      activeTabId: state.value.activeTabId,
    })
  }

  /** 移除标签；最后一个标签不允许移除。 */
  function removeTab(tabId: string): void {
    if (state.value.tabs.length === 1) return
    const remaining = state.value.tabs.filter((tab) => tab.id !== tabId)
    commit({
      tabs: remaining,
      activeTabId: state.value.activeTabId === tabId ? remaining[0]!.id : state.value.activeTabId,
    })
  }

  /** 调整标签顺序；活动标签不变，顺序变化才落盘。 */
  function moveTab(tabId: string, targetId: string, placement: TabPlacement): void {
    const tabs = reorderTabs(state.value.tabs, tabId, targetId, placement)
    if (tabs === state.value.tabs) return
    commit({ tabs, activeTabId: state.value.activeTabId })
  }

  /**
   * 把另一个工作区的标签接管到本窗口。
   *
   * 标签数据存放在同源共享的 IndexedDB 里，因此由本窗口完成两边的写入，
   * 主进程只负责广播“工作区已变化”。
   *
   * @param fromWorkspaceId 标签原所属工作区
   * @param tabId 被拖动的标签
   * @param target 落点；缺省表示追加到末尾
   * @returns 是否接管成功，以及源工作区是否已被清空（此时宿主应关闭源窗口）
   */
  async function adopt(
    fromWorkspaceId: string,
    tabId: string,
    target: TabDropTarget | null = null,
  ): Promise<{ adopted: boolean; sourceEmptied: boolean }> {
    const ignored = { adopted: false, sourceEmptied: false }
    if (fromWorkspaceId === workspaceId) return ignored
    const source = await loadWorkspaceTabs(fromWorkspaceId)
    const moved = source?.tabs.find((tab) => tab.id === tabId)
    if (!source || !moved) return ignored
    const remaining = source.tabs.filter((tab) => tab.id !== tabId)
    await saveWorkspaceTabs(fromWorkspaceId, {
      tabs: remaining,
      activeTabId: remaining.some((tab) => tab.id === source.activeTabId)
        ? source.activeTabId
        : (remaining[0]?.id ?? ''),
    })
    // 接管必须立即落盘：主进程随后会广播，本窗口会立刻重新读取自己的记录。
    // 位置计算复用同一份 reorderTabs：先追加进本窗口，再按落点移动。
    const appended = [...state.value.tabs, moved]
    const next: WorkspaceTabs = {
      tabs: target ? reorderTabs(appended, moved.id, target.id, target.placement) : appended,
      activeTabId: moved.id,
    }
    state.value = next
    await store.save(next)
    return { adopted: true, sourceEmptied: remaining.length === 0 }
  }

  /** 重新读取本工作区的落盘记录；窗口关闭时不会走到这里。 */
  async function reload(): Promise<void> {
    const restored = await store.load()
    if (restored) state.value = restored
  }

  return {
    tabs,
    activeTabId,
    ready,
    restore,
    createTab,
    activate,
    setSpec,
    removeTab,
    moveTab,
    adopt,
    reload,
    dispose: () => store.dispose(),
  }
}
