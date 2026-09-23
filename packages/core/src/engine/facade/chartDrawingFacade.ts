/**
 * ChartDrawingFacade —— 绘图状态、查询与工具操作。
 */

import type { ReadonlySignal } from '../../foundation/reactivity/signal.js'
import type { ChartDataManager } from '../data/chartDataManager.js'
import type {
  DrawingCommands,
  DrawingInteractionController,
  DrawingObject,
  DrawingToolId,
  DrawingWorkspaceId,
} from '../drawing/index.js'
import type { ChartRenderer } from '../render/chartRenderer.js'
import type { ChartStateKernel } from '../state/chartStateKernel.js'
import { resolveChartWorkspaceId } from '../state/modeState.js'

/** Drawing Facade 所需依赖。 */
export interface ChartDrawingFacadeDependencies {
  kernel: ChartStateKernel
  dataManager: ChartDataManager
  renderer: ChartRenderer
  getSession: () => DrawingInteractionController | null
  scheduleDraw: () => void
  getCommands: () => DrawingCommands
}

/** 提供绘图领域的公开操作，不管理交互会话生命周期。 */
export class ChartDrawingFacade {
  constructor(private readonly deps: ChartDrawingFacadeDependencies) {}

  /** 当前绘图工具信号。 */
  get tool(): ReadonlySignal<DrawingToolId> {
    return this.deps.kernel.drawing.readonly.drawingTool
  }

  /** 当前已确认绘图对象信号。 */
  get drawings(): ReadonlySignal<ReadonlyArray<DrawingObject>> {
    return this.deps.kernel.drawing.readonly.drawings
  }

  /** 当前选中绘图 ID 信号。 */
  get selectedIds(): ReadonlySignal<ReadonlyArray<string>> {
    return this.deps.kernel.drawing.readonly.selectedDrawingIds
  }

  /** 全局绘图锁定信号。 */
  get globalLock(): ReadonlySignal<boolean> {
    return this.deps.kernel.drawing.readonly.globalDrawingLock
  }

  /** 设置全局绘图锁定；只冻结移动，不改写各图元自身 locked。 */
  setGlobalDrawingLock(locked: boolean): void {
    this.deps.kernel.drawing.actions.setGlobalDrawingLock(locked)
  }

  /** 写入已确认图元并剥离会话预览。 */
  setDrawings(drawings: ReadonlyArray<DrawingObject>): void {
    this.deps.getCommands().syncExternalDrawings(drawings)
  }

  /** 更新选中图元 ID 集合。 */
  setSelectedIds(ids: ReadonlyArray<string>): void {
    this.deps.kernel.drawing.actions.setSelectedDrawingIds(ids)
    this.deps.scheduleDraw()
  }

  /** 返回绘图只读投影。 */
  getStore() {
    return this.deps.renderer.getDrawingStore()
  }

  /** 返回当前活动数据视图的绘图锚点点列。 */
  getData(): ReadonlyArray<{ timestamp: number }> {
    return this.deps.dataManager.getRenderData()
  }

  /** 返回活动点列中指定逻辑索引的时间戳。 */
  getTimestampAtLogicalIndex(index: number): number | null {
    if (!Number.isInteger(index) || index < 0) return null
    return this.deps.dataManager.getRenderData()[index]?.timestamp ?? null
  }

  /** 返回当前数据视图的绘图工作区。 */
  getWorkspaceId(): DrawingWorkspaceId {
    return resolveChartWorkspaceId(this.deps.kernel.mode.readonly.dataView.peek())
  }

  /** 设置绘图工具，并同步清理会话副作用。 */
  setTool(tool: DrawingToolId | null): void {
    const toolId = tool ?? 'cursor'
    this.deps.kernel.drawing.actions.setDrawingTool(toolId)
    this.deps.getSession()?.applyToolSession()
    // 悬停目标只对 cursor/box-select 有效；换工具后由下一个 hover flush 重算
    this.deps.kernel.interaction.actions.setDrawingTargetHover('none')
    this.deps.scheduleDraw()
  }

  /** 删除单个已确认图元，统一经过可撤回的命令入口。 */
  remove(drawingId: string): void {
    this.deps.getCommands().remove(drawingId)
  }

  /** 清除全部已确认图元。 */
  clear(): void {
    this.deps.getSession()?.cancelPendingChanges()
    this.deps.getCommands().clear()
  }
}
