/**
 * indicatorSelector 模块对外契约入口。
 *
 * 指标选择器契约由此模块维护，公共指标定义仍从共享类型导入。
 */

import type { ReadonlySignal, Signal } from '../../foundation/reactivity/index.js'
import type { IndicatorDefinition, IndicatorPaneRole } from '../types.js'

export interface ActiveIndicator {
  id: string
  definitionId: string
  label: string
  name: string
  role: IndicatorPaneRole
  params: Readonly<Record<string, number | string | boolean>>
}

export interface IndicatorSelectorController {
  readonly catalog: ReadonlySignal<ReadonlyArray<IndicatorDefinition>>
  readonly active: Signal<ReadonlyArray<ActiveIndicator>>
  readonly menuOpen: Signal<boolean>
  readonly searchQuery: Signal<string>
  readonly filteredMain: Signal<ReadonlyArray<IndicatorDefinition>>
  readonly filteredSub: Signal<ReadonlyArray<IndicatorDefinition>>
  add(definitionId: string): string | null
  remove(instanceId: string): boolean
  updateParams(instanceId: string, params: Record<string, number | string | boolean>): boolean
  reorder(fromInstanceId: string, toInstanceId: string): boolean
  openMenu(): void
  closeMenu(): void
  toggleMenu(): void
  setSearchQuery(q: string): void
  isActive(definitionId: string): boolean
  dispose(): void
}

/** createIndicatorSelectorController 的初始化参数。 */
export interface IndicatorSelectorInit {
  /** 指标目录信号；所有选择器实例共享注册表投影。 */
  catalog: ReadonlySignal<ReadonlyArray<IndicatorDefinition>>
  active?: ReadonlyArray<ActiveIndicator>
}
