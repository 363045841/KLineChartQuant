import type { DrawingChartAdapter } from '../../controllers/types'
import type { DrawingObject, DrawingStyle } from '../../foundation/plugin/index'

import { AnchorCollector } from './AnchorCollector'
import { DragHandler } from './DragHandler'
import { DrawingState, PREVIEW_ID } from './DrawingState'
import { HitTester } from './HitTester'
import { PreviewRenderer } from './PreviewRenderer'
import { resolveAnchorFromPointer } from './coordinateUtils'
import type { DrawingAnchorInput } from './coordinateUtils'
import type { DrawingToolId } from './toolConfig'
import { getAnchorCountForTool, getDrawingKind } from './toolConfig'

// Re-export types so index.ts re-exports work unchanged
export type { DrawingToolId } from './toolConfig'
export type { DrawingAnchorInput } from './coordinateUtils'

export interface DrawingInteractionCallbacks {
  onDrawingCreated?: (drawing: DrawingObject) => void
  onToolChange?: (toolId: DrawingToolId) => void
  onDrawingSelected?: (drawing: DrawingObject | null) => void
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
    this.drawingState.removePreview()
    if (this.dragHandler.isDragging()) {
      this.drawingState.clearDragOverride()
      this.dragHandler.endDrag()
    }
    this.setSelected(null)
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

  removeDrawing(drawingId: string): void {
    this.adapter.removeDrawing(drawingId)
  }

  // ============ 选中状态 ============

  getSelectedDrawing(): DrawingObject | null {
    return this.drawingState.getSelected()
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
      const anchor = resolveAnchorFromPointer(e, container, this.adapter)
      if (!anchor) {
        this.drawingState.removePreview()
        return false
      }

      const preview = this.previewRenderer.buildPreview(
        activeTool,
        this.anchorCollector.pendingAnchors,
        anchor,
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

    const anchor = resolveAnchorFromPointer(e, container, this.adapter)
    if (!anchor) return false

    const anchorCount = getAnchorCountForTool(activeTool)

    if (anchorCount === 1) {
      this.createSingleAnchorDrawing(anchor, activeTool)
      return true
    }

    if (anchorCount === 2 || anchorCount === 3) {
      const result = this.anchorCollector.addAnchor(anchor, activeTool)
      if (result) {
        this.createMultiAnchorDrawing(result, activeTool)
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
    const rect = container.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    const hit = this.hitTester.hitTest(
      mouseX,
      mouseY,
      this.drawingState.getNonPreview(),
      this.adapter,
    )
    if (!hit) {
      this.setSelected(null)
      return false
    }

    this.setSelected(hit.drawing)

    this.dragHandler.startDrag(
      hit.drawing,
      'anchorIndex' in hit ? hit.anchorIndex : undefined,
      mouseX,
      mouseY,
    )
    return true
  }

  private setSelected(drawing: DrawingObject | null) {
    this.drawingState.setSelected(drawing)
    this.callbacks.onDrawingSelected?.(drawing)
  }

  private createSingleAnchorDrawing(anchor: DrawingAnchorInput, activeTool: DrawingToolId) {
    this.drawingState.removePreview()

    const drawing = this.adapter.createDrawing({
      kind: getDrawingKind(activeTool),
      paneId: 'main',
      anchors: [{ timestamp: Number(anchor.time), price: anchor.price }],
    })
    this.callbacks.onDrawingCreated?.(drawing)
    this.adapter.setDrawingToolId('cursor')
  }

  private createMultiAnchorDrawing(anchors: DrawingAnchorInput[], activeTool: DrawingToolId) {
    this.drawingState.removePreview()

    const drawing = this.adapter.createDrawing({
      kind: getDrawingKind(activeTool),
      paneId: 'main',
      anchors: anchors.map((anchor) => ({ timestamp: Number(anchor.time), price: anchor.price })),
    })
    this.callbacks.onDrawingCreated?.(drawing)
    this.adapter.setDrawingToolId('cursor')
  }
}

export { PREVIEW_ID }
