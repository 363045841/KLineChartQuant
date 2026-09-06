import type { DrawingChartAdapter } from '../../controllers/types'
import type { DrawingObject, DrawingStyle } from '../../foundation/plugin/index'
import { ChartWorkspaceId } from '../../foundation/types/chartView'

import { AnchorCollector } from './AnchorCollector'
import { DragHandler } from './DragHandler'
import { DrawingState, PREVIEW_ID } from './DrawingState'
import { clearDrawingSelection, toggleDrawingSelection } from './DrawingSelection'
import { HitTester } from './HitTester'
import type { HitResult } from './HitTester'
import {
  drawingIntersectsSelectionMarquee,
  hasSelectionMarqueeArea,
  type DrawingSelectionMarquee,
} from './selectionMarquee'
import { PreviewRenderer } from './PreviewRenderer'
import { resolveDrawingPointer } from './coordinateUtils'
import type { ResolvedInteractionAnchor, DrawingPointerAnchor } from './coordinateUtils'
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

/** 命中线段中心后供宿主渲染就地文本编辑器的几何快照。 */
export interface DrawingLineLabelTarget {
  readonly drawingId: string
  readonly targetKind: 'line' | 'area'
  readonly lineIndex: number
  readonly x: number
  readonly y: number
  readonly rotation: number
  readonly text: string
}

/** 指针会话的唯一状态：框选和拖拽互斥，禁止通过多个可空字段推导行为。 */
type DrawingPointerSession =
  | { kind: 'idle' }
  | { kind: 'marquee'; marquee: DrawingSelectionMarquee }
  | { kind: 'drag' }

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
  private pointerSession: DrawingPointerSession = { kind: 'idle' }

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

  /** 返回当前框选会话，供渲染期投影为临时 primitive。 */
  getSelectionMarquee(): DrawingSelectionMarquee | null {
    return this.pointerSession.kind === 'marquee' ? this.pointerSession.marquee : null
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
    this.resetPointerSession()
    this.drawingState.removePreview()
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
    this.resetPointerSession()
    this.drawingState.removePreview()
    this.drawingState.clearSession()
    this.adapter.clearDrawings()
  }

  updateDrawingStyle(drawingId: string, style: Partial<DrawingStyle>): void {
    const drawing = this.adapter.getFullDrawings().find((item) => item.id === drawingId)
    if (drawing) this.adapter.updateDrawing({ ...drawing, style: { ...drawing.style, ...style } })
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

  /** 查找指针命中的线段中心文本区域；只在光标模式且非拖拽时可编辑。 */
  getLineLabelTarget(e: PointerEvent, container: HTMLElement): DrawingLineLabelTarget | null {
    if (this.getActiveTool() !== 'cursor' || this.dragHandler.isDragging()) return null
    const pointer = resolveDrawingPointer(e, container, this.adapter)
    if (!pointer) return null
    const drawings = this.drawingState
      .getNonPreview()
      .filter(
        (drawing) =>
          drawing.paneId === pointer.paneId &&
          (drawing.workspaceId ?? ChartWorkspaceId.KLine) === this.adapter.getDrawingWorkspaceId(),
      )
    return (
      this.hitTester.findLineLabelTarget(pointer.x, pointer.y, drawings, this.adapter) ??
      this.hitTester.findAreaLabelTarget(pointer.x, pointer.y, drawings, this.adapter)
    )
  }

  // ============ 事件处理 ============

  /**
   * 指针移动：拖拽只写会话覆盖；绘图模式只写预览。均不写 kernel。
   * @returns true 表示事件已消费，需要重绘
   */
  onPointerMove(e: PointerEvent, container: HTMLElement): boolean {
    if (this.pointerSession.kind === 'drag') return this.handleDragMove(e, container)
    if (this.pointerSession.kind === 'marquee') return this.handleSelectionMarqueeMove(e, container)

    const activeTool = this.getActiveTool()
    if (activeTool === 'box-select') return false
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

    if (activeTool === 'box-select') {
      return this.handleBoxSelectDown(e, container)
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
    const session = this.pointerSession
    this.pointerSession = { kind: 'idle' }
    if (session.kind === 'marquee') {
      this.adapter.requestDraw?.()
      this.commitSelectionMarquee(session.marquee)
      return true
    }
    if (session.kind !== 'drag') return false
    this.drawingState.commitDrags()
    this.dragHandler.endDrag()
    return true
  }

  // ============ 私有方法 ============

  private handleCursorDown(e: PointerEvent, container: HTMLElement): boolean {
    const result = this.findDrawingHit(e, container)
    if (!result) {
      if (!e.ctrlKey) this.clearSelection()
      return false
    }
    const { pointer, hit } = result

    if (e.ctrlKey) {
      this.toggleSelected([hit.drawing])
      return true
    }

    const selectedDrawings = this.drawingState.getSelectedDrawings()
    const isSelected = selectedDrawings.some((drawing) => drawing.id === hit.drawing.id)
    const dragTargets = isSelected ? selectedDrawings : [hit.drawing]
    if (!isSelected) this.setSelected(dragTargets)

    this.startDrag(pointer, hit, dragTargets)
    return true
  }

  /** 框选工具优先拖拽已选图元，其他位置才进入框选会话。 */
  private handleBoxSelectDown(e: PointerEvent, container: HTMLElement): boolean {
    const result = this.findDrawingHit(e, container)
    if (result && this.adapter.getSelectedDrawingIds().includes(result.hit.drawing.id)) {
      const selectedDrawings = this.drawingState.getSelectedDrawings()
      this.startDrag(result.pointer, result.hit, selectedDrawings)
      return true
    }
    return this.startSelectionMarquee(e, container)
  }

  /** 查找当前 Pane 和工作区内被指针命中的图元。 */
  private findDrawingHit(
    e: PointerEvent,
    container: HTMLElement,
  ): { pointer: DrawingPointerAnchor; hit: HitResult } | null {
    const pointer = resolveDrawingPointer(e, container, this.adapter)
    if (!pointer) return null
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
    return hit ? { pointer, hit } : null
  }

  /** 进入拖拽会话；锚点命中只拖动命中图元，主体命中拖动整个选择组。 */
  private startDrag(
    pointer: DrawingPointerAnchor,
    hit: HitResult,
    selectedDrawings: ReadonlyArray<DrawingObject>,
  ): void {
    const isAnchorHit = 'anchorIndex' in hit
    this.dragHandler.startDrag(
      isAnchorHit ? [hit.drawing] : selectedDrawings,
      isAnchorHit ? hit.anchorIndex : undefined,
      pointer.x,
      pointer.y,
    )
    this.pointerSession = { kind: 'drag' }
  }

  /** 开始框选，坐标只在按下所在 Pane 内解释。 */
  private startSelectionMarquee(e: PointerEvent, container: HTMLElement): boolean {
    const pointer = resolveDrawingPointer(e, container, this.adapter)
    if (!pointer) return false
    this.pointerSession = {
      kind: 'marquee',
      marquee: {
        paneId: pointer.paneId,
        start: { x: pointer.x, y: pointer.y },
        end: { x: pointer.x, y: pointer.y },
      },
    }
    this.adapter.requestDraw?.()
    return true
  }

  /** 更新框选末端；跨 Pane 时保持起始 Pane 的框选范围。 */
  private handleSelectionMarqueeMove(e: PointerEvent, container: HTMLElement): boolean {
    if (this.pointerSession.kind !== 'marquee') return false
    const marquee = this.pointerSession.marquee
    const pointer = resolveDrawingPointer(e, container, this.adapter)
    if (pointer?.paneId === marquee.paneId) {
      marquee.end = { x: pointer.x, y: pointer.y }
      this.adapter.requestDraw?.()
    }
    return true
  }

  /** 提交框选命中的图元，按 Ctrl 多选规则切换其选中状态。 */
  private commitSelectionMarquee(marquee: DrawingSelectionMarquee): void {
    if (!hasSelectionMarqueeArea(marquee)) {
      this.clearSelection()
      return
    }

    const candidates = this.drawingState
      .getNonPreview()
      .filter(
        (drawing) =>
          drawing.visible &&
          drawing.paneId === marquee.paneId &&
          (drawing.workspaceId ?? ChartWorkspaceId.KLine) === this.adapter.getDrawingWorkspaceId(),
      )
      .filter((drawing) =>
        drawingIntersectsSelectionMarquee(drawing, marquee, this.hitTester, this.adapter),
      )
    if (candidates.length === 0) return

    this.toggleSelected(candidates)
  }

  /** 取消当前指针会话并清理其临时渲染覆盖。 */
  private resetPointerSession(): void {
    const session = this.pointerSession
    this.pointerSession = { kind: 'idle' }
    if (session.kind === 'drag') {
      this.drawingState.clearDragOverride()
      this.dragHandler.endDrag()
    }
    this.adapter.requestDraw?.()
  }

  /** 更新拖拽会话的整组临时覆盖。 */
  private handleDragMove(e: PointerEvent, container: HTMLElement): boolean {
    const draggingIds = this.dragHandler.getDraggingDrawingIds()
    if (draggingIds.some((id) => this.drawingState.getById(id) === undefined)) {
      this.resetPointerSession()
      return false
    }
    const updated = this.dragHandler.handleDragMove(e, container, this.adapter)
    if (!updated) return false
    this.drawingState.setDragOverrides(updated)
    return true
  }

  private setSelected(drawings: ReadonlyArray<DrawingObject>) {
    this.setSelectedIds(drawings.map((drawing) => drawing.id))
  }

  /** 将选中 ID 写回唯一状态，并通知交互宿主。 */
  private setSelectedIds(ids: ReadonlyArray<string>): void {
    this.adapter.setSelectedDrawingIds(ids)
    this.callbacks.onDrawingSelected?.(this.drawingState.getSelectedDrawings())
  }

  /** 清空当前选择；光标和框选的空白点击共用此入口。 */
  private clearSelection(): void {
    this.setSelectedIds(clearDrawingSelection())
  }

  /** 按 Ctrl 语义批量切换图元；同一图元不会重复处理。 */
  private toggleSelected(drawings: ReadonlyArray<DrawingObject>): void {
    this.setSelectedIds(
      toggleDrawingSelection(
        this.adapter.getSelectedDrawingIds(),
        drawings.map((drawing) => drawing.id),
      ),
    )
  }

  private createSingleAnchorDrawing(anchor: DrawingPointerAnchor, activeTool: DrawingToolId) {
    this.drawingState.removePreview()

    const drawing = this.adapter.createDrawing({
      kind: getDrawingKind(activeTool),
      paneId: anchor.paneId,
      anchors: [
        {
          timestamp: anchor.time,
          futureOffset: anchor.futureOffset,
          price: anchor.price,
        },
      ],
    })
    this.callbacks.onDrawingCreated?.(drawing)
    this.adapter.setDrawingToolId('cursor')
  }

  private createMultiAnchorDrawing(
    anchors: ResolvedInteractionAnchor[],
    activeTool: DrawingToolId,
    paneId: string,
  ) {
    this.drawingState.removePreview()

    const drawing = this.adapter.createDrawing({
      kind: getDrawingKind(activeTool),
      paneId,
      anchors: anchors.map((anchor) => ({
        timestamp: anchor.time,
        futureOffset: anchor.futureOffset,
        price: anchor.price,
      })),
    })
    this.callbacks.onDrawingCreated?.(drawing)
    this.adapter.setDrawingToolId('cursor')
  }
}

export { PREVIEW_ID }
