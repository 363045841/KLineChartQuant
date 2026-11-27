/**
 * ChartPaneFacade —— Pane 容器的公开布局命令面。
 *
 * 只管理顺序、高度、可见性与边界拖拽，不承担指标实例语义；
 * 实例的创建、更新与删除走 ChartIndicatorFacade。
 */
import type { ChartPaneLayout } from '../../pane/index.js'
import type {
  PaneBoundaryResizeSession,
  PaneLayoutCommands,
  PanePatch,
  PanePlacement,
  PaneSpec,
} from '../../pane/types.js'
import type { ChartStateKernel } from '../../state/chartStateKernel.js'

/** Pane Facade 所需依赖。 */
export interface ChartPaneFacadeDependencies {
  kernel: ChartStateKernel
  layoutManager: ChartPaneLayout
  invalidateDrawingHistory: () => void
}

/** 提供 Pane 容器的业务布局操作，不管理 DOM 生命周期。 */
export class ChartPaneFacade implements PaneLayoutCommands {
  constructor(private readonly deps: ChartPaneFacadeDependencies) {}

  /** 新建空 Pane；返回身份，锚点不存在时返回 null。 */
  addPane(anchorPaneId: string, placement: PanePlacement): string | null {
    return this.deps.kernel.paneManager.actions.addPane(anchorPaneId, placement)
  }

  /** 更新单个 Pane 的布局字段。 */
  updatePane(paneId: string, patch: PanePatch): boolean {
    return this.deps.kernel.paneManager.actions.updatePane(paneId, patch)
  }

  /** 调整 Pane 显示顺序。 */
  movePane(paneId: string, targetIndex: number): boolean {
    return this.deps.kernel.paneManager.actions.movePane(paneId, targetIndex)
  }

  /** 一次提交完整 Pane 顺序。 */
  reorderPanes(paneIds: ReadonlyArray<string>): boolean {
    return this.deps.kernel.paneManager.actions.reorderPanes(paneIds)
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
  }

  /** 返回当前 Pane 布局快照。 */
  getLayoutSpecs(): PaneSpec[] {
    return this.deps.layoutManager.getPaneLayoutSpecs()
  }

  /** 调整相邻 Pane 的边界。 */
  resizeBoundary(upperPaneId: string, deltaY: number): boolean {
    return this.deps.layoutManager.resizePaneBoundary(upperPaneId, deltaY)
  }

  /** 指针按下时创建会话，后续移动提交相对起点的总位移。 */
  beginBoundaryResize(upperPaneId: string): PaneBoundaryResizeSession | null {
    return this.deps.layoutManager.beginBoundaryResize(upperPaneId)
  }

  /** 判断指定 Pane 是否存在。 */
  hasPane(paneId: string): boolean {
    return this.deps.layoutManager.hasPane(paneId)
  }
}
