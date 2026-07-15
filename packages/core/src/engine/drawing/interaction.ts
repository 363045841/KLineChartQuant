import type { DrawingChartAdapter } from '../../controllers/types'
import type { DrawingObject, DrawingKind, DrawingStyle } from '../../foundation/plugin/index'

import { AnchorCollector } from './AnchorCollector'
import { DragHandler } from './DragHandler'
import { DrawingState, PREVIEW_ID } from './DrawingState'
import { HitTester } from './HitTester'
import { PreviewRenderer } from './PreviewRenderer'
import { resolveAnchorFromPointer } from './coordinateUtils'
import type { DrawingAnchorInput } from './coordinateUtils'
import type { DrawingToolId } from './toolConfig'
import { getAnchorCountForTool, getDrawingKind, CHANNEL_KINDS } from './toolConfig'

// Re-export types so index.ts re-exports work unchanged
export type { DrawingToolId } from './toolConfig'
export type { DrawingAnchorInput } from './coordinateUtils'

export interface DrawingInteractionCallbacks {
  onDrawingCreated?: (drawing: DrawingObject) => void
  onToolChange?: (toolId: DrawingToolId) => void
  onDrawingSelected?: (drawing: DrawingObject | null) => void
}

/**
 * 绘图交互控制器 v2 — 精简事件路由，组合子模块。
 *
 * ┌─────────────────────────────────────┐
 * │ DrawingInteractionController        │
 * │  ├─ DrawingState     (图元 CRUD)   │
 * │  ├─ AnchorCollector  (锚点累积)    │
 * │  ├─ PreviewRenderer  (预览构建)    │
 * │  ├─ HitTester        (命中检测)    │
 * │  └─ DragHandler      (拖拽管理)    │
 * └─────────────────────────────────────┘
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

  // ============ 配置 ============

  /** 注册回调（创建/选中/工具切换事件通知） */
  setCallbacks(callbacks: DrawingInteractionCallbacks) {
    this.callbacks = callbacks
  }

  // ============ 工具状态 ============

  /** 返回当前激活的绘图工具 ID（读 kernel SSOT） */
  getActiveTool(): DrawingToolId {
    return this.adapter.getDrawingToolId()
  }

  /**
   * 会话副作用：清锚点/预览/拖拽/选中。仅 Chart 在写完 kernel 后调用。
   */
  applyToolSession(toolId: DrawingToolId): void {
    this.anchorCollector.reset()
    this.drawingState.removePreview()
    this.dragHandler.endDrag()
    this.setSelected(null)
    this.callbacks.onToolChange?.(toolId)
  }

  /**
   * 切换绘图工具 —— 经 adapter 写 kernel（Chart 单写路径）。
   */
  setTool(toolId: DrawingToolId) {
    this.adapter.setDrawingToolId(toolId)
  }

  // ============ 图元 CRUD（委托 DrawingState） ============

  /** 返回所有图元（含预览） */
  getDrawings(): DrawingObject[] {
    return this.drawingState.getAll()
  }

  /** 整体替换图元列表 */
  setDrawings(drawings: DrawingObject[]) {
    this.drawingState.setDrawings(drawings)
  }

  /** 清空锚点累积、预览、拖拽状态及所有图元 */
  clear() {
    this.anchorCollector.reset()
    this.drawingState.removePreview()
    this.dragHandler.endDrag()
    this.drawingState.clear()
  }

  /** 更新指定图元的样式（合并） */
  updateDrawingStyle(drawingId: string, style: Partial<DrawingStyle>): void {
    this.drawingState.updateDrawingStyle(drawingId, style)
  }

  /** 删除指定图元 */
  removeDrawing(drawingId: string): void {
    this.drawingState.removeDrawing(drawingId)
  }

  // ============ 选中状态 ============

  /** 返回当前选中的图元 */
  getSelectedDrawing(): DrawingObject | null {
    return this.drawingState.getSelected()
  }

  // ============ 事件处理 ============

  /**
   * 指针移动事件入口。
   * 拖拽中 → 委托 DragHandler 更新锚点；绘图模式 → 构建预览图元。
   * @returns true 表示事件已消费，需要重绘
   */
  onPointerMove(e: PointerEvent, container: HTMLElement): boolean {
    // 1) 正在拖拽
    if (this.dragHandler.isDragging()) {
      const drawing = this.drawingState.getById(this.dragHandler.getDraggingDrawingId() ?? '')
      if (!drawing) {
        this.dragHandler.endDrag()
        return false
      }
      const updated = this.dragHandler.handleDragMove(drawing, e, container, this.adapter)
      if (!updated) return false
      this.drawingState.addOrUpdate(updated)
      return true
    }

    // 2) 绘图工具预览
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
   * 指针按下事件入口。
   * 光标模式 → 命中检测 + 选中 + 拖拽开始；绘图模式 → 创建或累积锚点。
   * @returns true 表示事件已消费
   */
  onPointerDown(e: PointerEvent, container: HTMLElement): boolean {
    const activeTool = this.getActiveTool()
    // 光标模式：命中检测 → 选中 → 开始拖拽
    if (activeTool === 'cursor') {
      return this.handleCursorDown(e, container)
    }

    // 绘图模式
    const anchor = resolveAnchorFromPointer(e, container, this.adapter)
    if (!anchor) return false

    const anchorCount = getAnchorCountForTool(activeTool)

    // 单锚点工具：点击即创建
    if (anchorCount === 1) {
      this.createSingleAnchorDrawing(anchor, activeTool)
      return true
    }

    // 多锚点工具：累积
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
   * 指针抬起事件入口。结束拖拽。
   * @returns true 表示事件已消费
   */
  onPointerUp(_e: PointerEvent, _container: HTMLElement): boolean {
    if (!this.dragHandler.isDragging()) return false
    this.dragHandler.endDrag()
    return true
  }

  // ============ 私有方法 ============

  /** 光标模式下指针按下：命中检测 → 选中 → 开始拖拽 */
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

  /** 设置选中图元并通知回调 */
  private setSelected(drawing: DrawingObject | null) {
    this.drawingState.setSelected(drawing)
    this.callbacks.onDrawingSelected?.(drawing)
  }

  /** 单锚点工具：点击即创建图元，完成后切回光标模式 */
  private createSingleAnchorDrawing(anchor: DrawingAnchorInput, activeTool: DrawingToolId) {
    this.drawingState.removePreview()

    const drawing: DrawingObject = {
      id: `drawing-${Date.now()}`,
      kind: getDrawingKind(activeTool),
      paneId: 'main',
      visible: true,
      anchors: [
        {
          id: `${Date.now()}-a`,
          index: anchor.index,
          time: anchor.time,
          price: anchor.price,
        },
      ],
      params: {},
      style: {
        stroke: '#2962ff',
        strokeWidth: 1,
        strokeStyle: 'solid',
      },
    }

    this.drawingState.addOrUpdate(drawing)
    this.callbacks.onDrawingCreated?.(drawing)
    this.adapter.setDrawingToolId('cursor')
  }

  /** 多锚点工具（2-3 锚点）：锚点累积满后创建图元，完成后切回光标模式 */
  private createMultiAnchorDrawing(anchors: DrawingAnchorInput[], activeTool: DrawingToolId) {
    this.drawingState.removePreview()

    const kind = getDrawingKind(activeTool)
    const params: Record<string, unknown> = kind === 'regression-channel' ? { sigma: 2 } : {}

    const normalizedAnchors =
      kind === 'flat-line' && anchors.length >= 3
        ? [
            anchors[0]!,
            anchors[1]!,
            {
              index: anchors[1]!.index,
              time: anchors[1]!.time,
              price: anchors[2]!.price,
            },
          ]
        : anchors

    const isChannel = CHANNEL_KINDS.includes(kind)

    const drawing: DrawingObject = {
      id: `drawing-${Date.now()}`,
      kind,
      paneId: 'main',
      visible: true,
      anchors: normalizedAnchors.map((a, i) => ({
        id: `${Date.now()}-${String.fromCharCode(97 + i)}`,
        index: a.index,
        time: a.time,
        price: a.price,
      })),
      params,
      style: {
        stroke: '#2962ff',
        strokeWidth: 1,
        strokeStyle: 'solid',
        ...(isChannel ? { fillOpacity: 0.1 } : {}),
      },
    }

    this.drawingState.addOrUpdate(drawing)
    this.callbacks.onDrawingCreated?.(drawing)
    this.adapter.setDrawingToolId('cursor')
  }
}
