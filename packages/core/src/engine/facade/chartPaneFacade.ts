/**
 * ChartPaneFacade —— Pane 业务操作与布局查询。
 */

import type { PaneSpec } from '../chartTypes.js'
import type { ChartPaneLayout } from '../layout/chartPaneLayout.js'
import type { CreatePaneInput, PanePatch } from '../paneManager.js'
import type { ChartStateKernel } from '../state/chartStateKernel.js'

/** Pane Facade 所需依赖。 */
export interface ChartPaneFacadeDependencies {
  kernel: ChartStateKernel
  layoutManager: ChartPaneLayout
  ensureScaleTypes: () => void
  schedulePersistence: () => void
  invalidateDrawingHistory: () => void
}

/** 提供 Pane 的公开业务操作，不管理 DOM 生命周期。 */
export class ChartPaneFacade {
  constructor(private readonly deps: ChartPaneFacadeDependencies) {}

  /** 从受控导入路径替换完整布局。 */
  importLayout(panes: ReadonlyArray<PaneSpec>): void {
    this.deps.kernel.paneManager.replaceLayoutForImport(panes)
    this.deps.invalidateDrawingHistory()
    this.deps.ensureScaleTypes()
    this.deps.schedulePersistence()
  }

  /** 创建绑定副图指标内容的 Pane。 */
  create(input: CreatePaneInput): boolean {
    return this.persistIfChanged(this.deps.kernel.paneManager.actions.create(input))
  }

  /** 更新单个 Pane 的布局字段。 */
  update(paneId: string, patch: PanePatch): boolean {
    return this.persistIfChanged(this.deps.kernel.paneManager.actions.update(paneId, patch))
  }

  /** 删除 Pane 及其用户副图内容。 */
  remove(paneId: string): boolean {
    const removed = this.persistIfChanged(this.deps.kernel.paneManager.actions.remove(paneId))
    if (removed) this.deps.invalidateDrawingHistory()
    return removed
  }

  /** 调整 Pane 显示顺序。 */
  move(paneId: string, targetIndex: number): boolean {
    return this.persistIfChanged(this.deps.kernel.paneManager.actions.move(paneId, targetIndex))
  }

  /** 替换 Pane 的副图指标内容。 */
  replaceContent(paneId: string, indicatorId: string, params: Record<string, unknown>): boolean {
    return this.persistIfChanged(
      this.deps.kernel.paneManager.actions.replaceContent(paneId, indicatorId, params),
    )
  }

  /** 更新 Pane 副图指标的完整参数。 */
  updateContent(paneId: string, params: Record<string, unknown>): boolean {
    return this.persistIfChanged(this.deps.kernel.paneManager.actions.updateContent(paneId, params))
  }

  /** 删除全部用户创建的副图 Pane。 */
  clear(): void {
    this.deps.kernel.paneManager.actions.clear()
    this.deps.invalidateDrawingHistory()
    this.deps.schedulePersistence()
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
  has(paneId: string): boolean {
    return this.deps.layoutManager.hasPane(paneId)
  }

  /** 状态发生变化时调度工作区持久化。 */
  private persistIfChanged(changed: boolean): boolean {
    if (changed) this.deps.schedulePersistence()
    return changed
  }
}
