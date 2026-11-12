/**
 * ChartPaneFacade —— 实例归属与 Pane 布局的公开命令面。
 *
 * 主图与副图共用同一套实例身份；图例、Agent 和宿主都从这里写入，
 * 不允许再绕过 facade 直接改指标状态或 Pane 容器。
 */
import type { ChartPaneLayout } from '../../../pane/index.js'
import type {
  InstanceMoveTarget,
  PaneLayoutCommands,
  PanePatch,
  PaneSpec,
} from '../../../pane/types.js'
import type { ChartStateKernel } from '../../../state/chartStateKernel.js'
import type { IndicatorInstancePatch } from '../../../state/indicatorState.js'

/** Pane Facade 所需依赖。 */
export interface ChartPaneFacadeDependencies {
  kernel: ChartStateKernel
  layoutManager: ChartPaneLayout
  ensureScaleTypes: () => void
  invalidateDrawingHistory: () => void
}

/** 提供实例迁移与 Pane 容器的公开业务操作，不管理 DOM 生命周期。 */
export class ChartPaneFacade implements PaneLayoutCommands {
  constructor(private readonly deps: ChartPaneFacadeDependencies) {}

  /** 按定义创建实例；返回实例身份，主副图语义一致。 */
  add(
    definitionId: string,
    params?: Readonly<Record<string, unknown>>,
    target?: InstanceMoveTarget,
  ): string | null {
    return this.deps.kernel.paneManager.actions.add(definitionId, params, target)
  }

  /** 迁移实例归属；源副图变空时自动回收。 */
  moveInstance(instanceId: string, target: InstanceMoveTarget): boolean {
    const moved = this.deps.kernel.paneManager.actions.moveInstance(instanceId, target)
    if (moved) this.deps.invalidateDrawingHistory()
    return moved
  }

  /** 删除实例；空副图一并回收。 */
  removeInstance(instanceId: string): boolean {
    const removed = this.deps.kernel.paneManager.actions.removeInstance(instanceId)
    if (removed) this.deps.invalidateDrawingHistory()
    return removed
  }

  /** 删除指定定义创建的全部实例；定义注销时与空副图回收一起提交。 */
  removeInstancesByDefinition(definitionId: string): void {
    this.deps.kernel.paneManager.actions.removeInstancesByDefinition(definitionId)
    this.deps.invalidateDrawingHistory()
  }

  /** 删除当前工作区全部指标实例；副图回收后只保留主图与系统 Pane。 */
  clearAllIndicators(): void {
    this.deps.kernel.paneManager.actions.clearAllIndicators()
    this.deps.invalidateDrawingHistory()
  }

  /** 更新实例参数、显隐、排序或定义。 */
  updateInstance(instanceId: string, patch: IndicatorInstancePatch): boolean {
    return this.deps.kernel.paneManager.actions.updateInstance(instanceId, patch)
  }

  /** 更新单个 Pane 的布局字段。 */
  updatePane(paneId: string, patch: PanePatch): boolean {
    return this.deps.kernel.paneManager.actions.updatePane(paneId, patch)
  }

  /** 调整 Pane 显示顺序。 */
  movePane(paneId: string, targetIndex: number): boolean {
    return this.deps.kernel.paneManager.actions.movePane(paneId, targetIndex)
  }

  /** 删除 Pane 及其用户实例。 */
  removePane(paneId: string): boolean {
    const removed = this.deps.kernel.paneManager.actions.removePane(paneId)
    if (removed) this.deps.invalidateDrawingHistory()
    return removed
  }

  /** 删除全部用户创建的副图 Pane。 */
  clearPanes(): void {
    this.deps.kernel.paneManager.actions.clearPanes()
    this.deps.invalidateDrawingHistory()
  }

  /** 从受控导入路径替换完整布局。 */
  importLayout(panes: ReadonlyArray<PaneSpec>): void {
    this.deps.kernel.paneManager.actions.importLayout(panes)
    this.deps.invalidateDrawingHistory()
    this.deps.ensureScaleTypes()
  }

  /** 返回当前 Pane 布局快照。 */
  getLayoutSpecs(): PaneSpec[] {
    return this.deps.layoutManager.getPaneLayoutSpecs()
  }

  /** 调整相邻 Pane 的边界。 */
  resizeBoundary(upperPaneId: string, deltaY: number): boolean {
    return this.deps.layoutManager.resizePaneBoundary(upperPaneId, deltaY)
  }

  /** 判断指定 Pane 是否存在。 */
  hasPane(paneId: string): boolean {
    return this.deps.layoutManager.hasPane(paneId)
  }
}
