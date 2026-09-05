import type { DrawingChartAdapter } from '../../controllers/types'
import type { DrawingObject, DrawingStyle } from '../../foundation/plugin/index'
import { ChartWorkspaceId } from '../../foundation/types/chartView'

import { AnchorCollector } from './AnchorCollector'
import { DragHandler } from './DragHandler'
import { DrawingState, PREVIEW_ID } from './DrawingState'
import { HitTester } from './HitTester'
import { PreviewRenderer } from './PreviewRenderer'
import { resolveDrawingPointer } from './coordinateUtils'
import type { InteractionDrawingAnchor, DrawingPointerAnchor } from './coordinateUtils'
import type { DrawingToolId } from './toolConfig'
import { getAnchorCountForTool, getDrawingKind } from './toolConfig'

// Re-export types so index.ts re-exports work unchanged
export type { DrawingToolId } from './toolConfig'
export type { InteractionDrawingAnchor } from './coordinateUtils'

export interface DrawingInteractionCallbacks {
  onDrawingCreated?: (drawing: DrawingObject) => void
  onToolChange?: (toolId: DrawingToolId) => void
  onDrawingSelected?: (drawings: ReadonlyArray<DrawingObject>) => void
}

/**
 * 绘图交互控制器 —— 精简事件路由，组合子模块。
 *
 * 已确认图元只写 kernel；预览与拖拽覆盖只在 DrawingState 会话层。
 */
export class DrawingInteractionController {
  private adapter: DrawingChartAdapter
  private callbacks: DrawingInteractionCallbacks = {}

  private drawingState: DrawingState
  private anchorCollector: AnchorCollector
  private previewRenderer: PreviewRenderer
  private hitTester: HitTester
  private dragHandler: DragHandler
  private pendingPaneId: string | null = null

  constructor(adapter: DrawingChartAdapter) {
    this.adapter = adapter
    this.drawingState = new DrawingState(adapter)
    this.anchorCollector = new AnchorCollector()
    this.previewRenderer = new PreviewRenderer()
    this.hitTester = new HitTester()
    this.dragHandler = new DragHandler()
  }

  /** 渲染合成用：拖拽覆盖 + 预览 */
  getPaintOverlay(): DrawingObject[] {
    return this.drawingState.getPaintOverlay()
  }

  // ============ 配置 ============

  setCallbacks(callbacks: DrawingInteractionCallbacks) {
    this.callbacks = callbacks
  }

  // ============ 工具状态 ============

  getActiveTool(): DrawingToolId {
    return this.adapter.getDrawingToolId()
  }

  /**
   * 会话副作用：清锚点/预览/拖拽/选中。仅 Chart 在写完 kernel 后调用。
   */
  applyToolSession(toolId: DrawingToolId): void {
    this.anchorCollector.reset()
    this.pendingPaneId = null
    this.drawingState.removePreview()
    if (this.dragHandler.isDragging()) {
      this.drawingState.clearDragOverride()
      this.dragHandler.endDrag()
    }
    this.setSelected([])
    this.callbacks.onToolChange?.(toolId)
  }

  setTool(toolId: DrawingToolId) {
    this.adapter.setDrawingToolId(toolId)
  }

  // ============ 图元 CRUD ============

  getDrawings(): DrawingObject[] {
    return this.drawingState.getAll()
  }

  setDrawings(drawings: DrawingObject[]) {
    this.drawingState.clearSession()
    this.adapter.replaceDrawings(drawings)
  }

  clear() {
    this.anchorCollector.reset()
    this.pendingPaneId = null
    this.drawingState.removePreview()
    if (this.dragHandler.isDragging()) {
      this.drawingState.clearDragOverride()
      this.dragHandler.endDrag()
    }
    this.drawingState.clearSession()
    this.adapter.clearDrawings()
  }

  updateDrawingStyle(drawingId: string, style: Partial<DrawingStyle>): void {
    this.adapter.updateDrawing(drawingId, { style })
  }

  /** 原子更新一批图元的公共属性。 */
  updateBatch(ids: ReadonlyArray<string>, patch: { style?: Partial<DrawingStyle> }): void {
    this.adapter.updateBatch(ids, patch)
  }

  removeDrawing(drawingId: string): void {
    this.adapter.removeDrawing(drawingId)
  }

  /** 原子移除一批图元。 */
  removeBatch(ids: ReadonlyArray<string>): void {
    this.adapter.removeBatch(ids)
  }

  // ============ 选中状态 ============

  getSelectedDrawings(): DrawingObject[] {
    return this.drawingState.getSelectedDrawings()
  }

  // ============ 事件处理 ============

  /**
   * 指针移动：拖拽只写会话覆盖；绘图模式只写预览。均不写 kernel。
   * @returns true 表示事件已消费，需要重绘
   */
  onPointerMove(e: PointerEvent, container: HTMLElement): boolean {
    if (this.dragHandler.isDragging()) {
      const drawing = this.drawingState.getById(this.dragHandler.getDraggingDrawingId() ?? '')
      if (!drawing) {
        this.drawingState.clearDragOverride()
        this.dragHandler.endDrag()
        return false
      }
      const updated = this.dragHandler.handleDragMove(drawing, e, container, this.adapter)
      if (!updated) return false
      this.drawingState.setDragOverride(updated)
      return true
    }

    const activeTool = this.getActiveTool()
    if (activeTool !== 'cursor') {
      const pointer = resolveDrawingPointer(e, container, this.adapter)
      if (!pointer || (this.pendingPaneId !== null && pointer.paneId !== this.pendingPaneId)) {
        this.drawingState.removePreview()
        return false
      }

      const preview = this.previewRenderer.buildPreview(
        activeTool,
        this.anchorCollector.pendingAnchors,
        pointer,
        pointer.paneId,
        this.adapter.getDrawingWorkspaceId(),
      )
      if (!preview) {
        this.drawingState.removePreview()
        return false
      }

      this.drawingState.setPreview(preview)
      return true
    }

    return false
  }

  /**
   * 指针按下：光标模式命中+选中+开拖；绘图模式创建或累积锚点。
   * @returns true 表示事件已消费
   */
  onPointerDown(e: PointerEvent, container: HTMLElement): boolean {
    const activeTool = this.getActiveTool()
    if (activeTool === 'cursor') {
      return this.handleCursorDown(e, container)
    }

    const pointer = resolveDrawingPointer(e, container, this.adapter)
    if (!pointer || (this.pendingPaneId !== null && pointer.paneId !== this.pendingPaneId))
      return false

    const anchorCount = getAnchorCountForTool(activeTool)

    if (anchorCount === 1) {
      this.createSingleAnchorDrawing(pointer, activeTool)
      return true
    }

    if (anchorCount === 2 || anchorCount === 3) {
      if (this.pendingPaneId === null) this.pendingPaneId = pointer.paneId
      const result = this.anchorCollector.addAnchor(pointer, activeTool)
      if (result) {
        this.createMultiAnchorDrawing(result, activeTool, pointer.paneId)
        this.pendingPaneId = null
      }
      return true
    }

    return false
  }

  /**
   * 指针抬起：拖拽结果一次 commit 到 kernel。
   * @returns true 表示事件已消费
   */
  onPointerUp(_e: PointerEvent, _container: HTMLElement): boolean {
    if (!this.dragHandler.isDragging()) return false
    this.drawingState.commitDrag()
    this.dragHandler.endDrag()
    return true
  }

  // ============ 私有方法 ============

  private handleCursorDown(e: PointerEvent, container: HTMLElement): boolean {
    const pointer = resolveDrawingPointer(e, container, this.adapter)
    if (!pointer) return false

    const hit = this.hitTester.hitTest(
      pointer.x,
      pointer.y,
      this.drawingState
        .getNonPreview()
        .filter(
          (drawing) =>
            drawing.paneId === pointer.paneId &&
            (drawing.workspaceId ?? ChartWorkspaceId.KLine) === this.adapter.getDrawingWorkspaceId(),
        ),
      this.adapter,
    )
    if (!hit) {
      if (!e.ctrlKey) this.setSelected([])
      return false
    }

    if (e.ctrlKey) {
      this.toggleSelected(hit.drawing)
      return true
    }

    this.setSelected([hit.drawing])

    this.dragHandler.startDrag(
      hit.drawing,
      'anchorIndex' in hit ? hit.anchorIndex : undefined,
      pointer.x,
      pointer.y,
    )
    return true
  }

  private setSelected(drawings: ReadonlyArray<DrawingObject>) {
    this.drawingState.setSelected(drawings)
    this.callbacks.onDrawingSelected?.(this.drawingState.getSelectedDrawings())
  }

  /** Ctrl 点击将命中图元加入或移出当前选择，不启动拖拽。 */
  private toggleSelected(drawing: DrawingObject): void {
    const selectedDrawings = this.drawingState.getSelectedDrawings()
    const isSelected = selectedDrawings.some((selected) => selected.id === drawing.id)
    this.setSelected(
      isSelected
        ? selectedDrawings.filter((selected) => selected.id !== drawing.id)
        : [...selectedDrawings, drawing],
    )
  }

  private createSingleAnchorDrawing(anchor: DrawingPointerAnchor, activeTool: DrawingToolId) {
    this.drawingState.removePreview()

    const drawing = this.adapter.createDrawing({
      kind: getDrawingKind(activeTool),
      paneId: anchor.paneId,
      anchors: [
        {
          timestamp: Number(anchor.time),
          futureOffset: anchor.futureOffset,
          price: anchor.price,
        },
      ],
    })
    this.callbacks.onDrawingCreated?.(drawing)
    this.adapter.setDrawingToolId('cursor')
  }

  private createMultiAnchorDrawing(
    anchors: InteractionDrawingAnchor[],
    activeTool: DrawingToolId,
    paneId: string,
  ) {
    this.drawingState.removePreview()

    const drawing = this.adapter.createDrawing({
      kind: getDrawingKind(activeTool),
      paneId,
      anchors: anchors.map((anchor) => ({
        timestamp: Number(anchor.time),
        futureOffset: anchor.futureOffset,
        price: anchor.price,
      })),
    })
    this.callbacks.onDrawingCreated?.(drawing)
    this.adapter.setDrawingToolId('cursor')
  }
}

export { PREVIEW_ID }
