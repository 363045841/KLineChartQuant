/**
 * 窗口工作区：标签页集合的领域模型与 IndexedDB 持久化。
 *
 * 这里只记录“开了哪些标签页”，图表自身的状态归各图表实例所有；
 * 存储与布局归档完全分离，两边互不引用。
 */
import type { SymbolSpec } from '@363045841yyt/klinechart-core/controllers'
import {
  createIndexedDbPersistence,
  type IndexedDbPersistence,
  type PersistenceCodec,
} from '@363045841yyt/klinechart-core/persistence'

import type { WorkspaceTab } from '../../electron/window-bridge'
import { isSymbolSpec } from '../../electron/window-bridge'

/** 标签页所属数据库；与布局归档分开，避免两套功能的生命周期互相牵制。 */
export const WORKSPACE_TABS_DATABASE = '@363045841yyt/klinechart-desktop'
const WORKSPACE_TABS_DATABASE_VERSION = 1
const WORKSPACE_TABS_STORE = 'workspaces'

/** 空标签页的标题；由 `tabLabelForSpec` 统一输出。 */
const DEFAULT_TAB_LABEL = '新图表'

/**
 * 由品种描述派生标签标题，形如 `600519 · 贵州茅台`。
 *
 * @param spec 图表当前品种；空标签页为 null
 */
export function tabLabelForSpec(spec: SymbolSpec | null): string {
  if (!spec) return DEFAULT_TAB_LABEL
  // 部分数据源用代码充当名称，拼起来会得到 `BTCUSDT · BTCUSDT`，此时只显示代码。
  const name = spec.instrument?.name
  return name && name !== spec.symbol ? `${spec.symbol} · ${name}` : spec.symbol
}

/** 拖拽插入位置：相对目标标签的前或后。 */
export type TabPlacement = 'before' | 'after'

/** 插入落点：目标标签 + 前/后，用于画指示线与接管定位。 */
export interface TabDropTarget {
  readonly id: string
  readonly placement: TabPlacement
}

/**
 * 调整标签顺序。
 *
 * 顺序的唯一真相是标签数组；这里只做纯位置计算，无变化时返回入参本身，
 * 调用方据此跳过落盘。
 *
 * @param tabs 当前标签列表
 * @param tabId 被移动的标签
 * @param targetId 落点标签
 * @param placement 插在落点标签之前还是之后
 */
export function reorderTabs(
  tabs: ReadonlyArray<WorkspaceTab>,
  tabId: string,
  targetId: string,
  placement: TabPlacement,
): ReadonlyArray<WorkspaceTab> {
  if (tabId === targetId) return tabs
  const from = tabs.findIndex((tab) => tab.id === tabId)
  if (from < 0 || !tabs.some((tab) => tab.id === targetId)) return tabs
  const next = [...tabs]
  const [moved] = next.splice(from, 1)
  const insertAt = next.findIndex((tab) => tab.id === targetId)
  next.splice(placement === 'after' ? insertAt + 1 : insertAt, 0, moved!)
  // 位置没变时返回入参本身，调用方据此跳过落盘。
  return next.every((tab, index) => tab.id === tabs[index]!.id) ? tabs : next
}

/** 一个窗口的标签页集合；`activeTabId` 必须存在于 `tabs` 中。 */
export interface WorkspaceTabs {
  readonly tabs: ReadonlyArray<WorkspaceTab>
  readonly activeTabId: string
}

/** 判断是否为完整标签；用于 IPC 输入与落盘数据的同一份校验。 */
export function isWorkspaceTab(value: unknown): value is WorkspaceTab {
  if (typeof value !== 'object' || value === null) return false
  const tab = value as Record<string, unknown>
  if (typeof tab.id !== 'string' || tab.id.length === 0) return false
  return tab.spec === null || isSymbolSpec(tab.spec)
}

/** 生成一个空标签页（新建图表）。 */
export function createBlankTab(): WorkspaceTab {
  return { id: globalThis.crypto.randomUUID(), spec: null }
}

/**
 * 校验标签页集合：至少一个标签，且活动标签必须存在。
 *
 * @param value 待校验数据
 * @returns 规范化后的集合；结构不成立时返回 null
 */
export function readWorkspaceTabs(value: unknown): WorkspaceTabs | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  if (!Array.isArray(record.tabs) || record.tabs.length === 0) return null
  if (!record.tabs.every(isWorkspaceTab)) return null
  const tabs = record.tabs as ReadonlyArray<WorkspaceTab>
  const activeTabId =
    typeof record.activeTabId === 'string' && tabs.some((tab) => tab.id === record.activeTabId)
      ? record.activeTabId
      : tabs[0]!.id
  return { tabs, activeTabId }
}

/** 只有单个标签且活动标签合法时才是可用的落盘记录。 */
const workspaceTabsCodec: PersistenceCodec<WorkspaceTabs> = {
  decode(value): WorkspaceTabs | null {
    return readWorkspaceTabs(value)
  },
  encode(value): unknown {
    return value
  },
}

/** 单个工作区的标签页存储。 */
export interface WorkspaceTabsStore {
  load(): Promise<WorkspaceTabs | null>
  save(value: WorkspaceTabs): Promise<void>
  /** 安排一次延迟写入；实际写入时才读取当前快照。 */
  schedule(get: () => WorkspaceTabs): void
  dispose(): Promise<void>
}

/** 按工作区身份缓存存储实例；存储实例与工作区一一对应。 */
const stores = new Map<string, WorkspaceTabsStore>()

/**
 * 打开（或复用）某个工作区的标签页存储。
 *
 * @param workspaceId 工作区身份
 */
export function openWorkspaceTabsStore(workspaceId: string): WorkspaceTabsStore {
  const existing = stores.get(workspaceId)
  if (existing) return existing
  const persistence: IndexedDbPersistence<WorkspaceTabs> = createIndexedDbPersistence({
    databaseName: WORKSPACE_TABS_DATABASE,
    databaseVersion: WORKSPACE_TABS_DATABASE_VERSION,
    storeName: WORKSPACE_TABS_STORE,
    key: `workspace:${workspaceId}`,
    codec: workspaceTabsCodec,
  })
  const store: WorkspaceTabsStore = {
    load: () => persistence.load(),
    async save(value) {
      await persistence.save(value)
    },
    schedule: (get) => persistence.schedule(get),
    dispose: () => persistence.dispose(),
  }
  stores.set(workspaceId, store)
  return store
}

/** 直接读取某个工作区的标签页集合，供跨窗口接管时使用。 */
export function loadWorkspaceTabs(workspaceId: string): Promise<WorkspaceTabs | null> {
  return openWorkspaceTabsStore(workspaceId).load()
}

/** 直接写入某个工作区的标签页集合，供跨窗口接管时使用。 */
export async function saveWorkspaceTabs(workspaceId: string, value: WorkspaceTabs): Promise<void> {
  await openWorkspaceTabsStore(workspaceId).save(value)
}

export type { WorkspaceTab }
