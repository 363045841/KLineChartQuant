/**
 * ChartIndicatorFacade —— 指标实例与主图指标的公开操作。
 */
import type { Computed } from '../../foundation/reactivity/signal'
import type { ChartIndicatorManager } from '../indicators/chartIndicatorManager'
import type { IndicatorInstance, SubPaneInfo } from '../chartTypes'

/** Indicator Facade 所需依赖。 */
export interface ChartIndicatorFacadeDependencies {
  manager: ChartIndicatorManager
  schedulePersistence: () => void
}

/** 提供指标领域的公开操作，并在状态变化后持久化工作区。 */
export class ChartIndicatorFacade {
  constructor(private readonly deps: ChartIndicatorFacadeDependencies) {}

  /** 返回全部指标实例的派生信号。 */
  get instances(): Computed<ReadonlyArray<IndicatorInstance>> {
    return this.deps.manager.indicatorsComputed
  }

  /** 返回副图指标信息的派生信号。 */
  get subPanes(): Computed<ReadonlyArray<SubPaneInfo>> {
    return this.deps.manager.subPanesComputed
  }

  /** 启用主图指标。 */
  enableMain(id: string, params?: Record<string, number | boolean | string>): boolean {
    return this.persistIfChanged(this.deps.manager.enableMainIndicator(id, params))
  }

  /** 禁用主图指标。 */
  disableMain(id: string): boolean {
    return this.persistIfChanged(this.deps.manager.disableMainIndicator(id))
  }

  /** 设置主图指标启用状态。 */
  toggleMain(id: string, enabled: boolean): void {
    this.deps.manager.toggleMainIndicator(id, enabled)
    this.deps.schedulePersistence()
  }

  /** 返回当前启用的主图指标 ID。 */
  getActiveMain(): string[] {
    return this.deps.manager.getActiveMainIndicators()
  }

  /** 判断主图指标是否启用。 */
  isMainActive(id: string): boolean {
    return this.deps.manager.isMainIndicatorActive(id)
  }

  /** 更新已启用主图指标的参数。 */
  updateMainParams(id: string, params: Record<string, number | boolean | string>): void {
    this.deps.manager.updateMainIndicatorParams(id, params)
    this.deps.schedulePersistence()
  }

  /** 返回已启用主图指标的参数。 */
  getMainParams(id: string): Record<string, number | boolean | string> | null {
    return this.deps.manager.getMainIndicatorParams(id)
  }

  /** 清除所有主图指标。 */
  clearMain(): void {
    this.deps.manager.clearMainIndicators()
    this.deps.schedulePersistence()
  }

  /** 兼容导入路径，直接替换主图指标集合。 */
  setActiveMain(indicators: string[]): void {
    this.deps.manager.setActiveMainIndicators(indicators)
    this.deps.schedulePersistence()
  }

  /** 添加主图或副图指标实例。 */
  add(definitionId: string, role: 'main' | 'sub', params?: Record<string, unknown>): string | null {
    const instanceId = this.deps.manager.addIndicator(definitionId, role, params)
    if (instanceId) this.deps.schedulePersistence()
    return instanceId
  }

  /** 删除指定指标实例。 */
  remove(instanceId: string): boolean {
    return this.persistIfChanged(this.deps.manager.removeIndicator(instanceId))
  }

  /** 更新指定指标实例的参数。 */
  updateParams(instanceId: string, params: Record<string, unknown>): boolean {
    return this.persistIfChanged(this.deps.manager.updateIndicatorParams(instanceId, params))
  }

  /** 调整指标实例顺序。 */
  reorder(orderedInstanceIds: string[]): boolean {
    return this.persistIfChanged(this.deps.manager.reorderIndicators(orderedInstanceIds))
  }

  /** 状态发生变化时调度工作区持久化。 */
  private persistIfChanged(changed: boolean): boolean {
    if (changed) this.deps.schedulePersistence()
    return changed
  }
}
