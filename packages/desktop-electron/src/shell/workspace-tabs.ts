/**
 * 窗口工作区的纯领域模型：标签页集合、顺序、身份与标题。
 *
 * 这里只记录“开了哪些标签页”，图表自身的状态归各图表实例所有；
 * 存储与布局归档完全分离，两边互不引用。
 */
import type { SymbolSpec } from '@363045841yyt/klinechart-core/controllers'

import type { WorkspaceTab } from '../../electron/window-bridge'
import { isSymbolSpec } from '../../electron/window-bridge'

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

/** 一个工作区的标签页集合；移交完毕时允许空集合，活动身份为空字符串。 */
export interface WorkspaceTabs {
  readonly tabs: ReadonlyArray<WorkspaceTab>
  readonly activeTabId: string
}

/** 判断是否为完整标签；用于 IPC 输入与落盘数据的同一份校验。 */
function isWorkspaceTab(value: unknown): value is WorkspaceTab {
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
 * 校验标签页集合；空集合保留为移交完成的记录，不能当成不存在而复活旧标签。
 *
 * @param value 待校验数据
 * @returns 规范化后的集合；结构不成立时返回 null
 */
export function readWorkspaceTabs(value: unknown): WorkspaceTabs | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  if (!Array.isArray(record.tabs)) return null
  if (!record.tabs.every(isWorkspaceTab)) return null
  const tabs = record.tabs
  if (tabs.length === 0) return { tabs, activeTabId: '' }
  const activeTabId =
    typeof record.activeTabId === 'string' && tabs.some((tab) => tab.id === record.activeTabId)
      ? record.activeTabId
      : tabs[0]!.id
  return { tabs, activeTabId }
}

export type { WorkspaceTab }
