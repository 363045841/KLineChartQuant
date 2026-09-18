import type { DrawingChartAdapter } from '../../controllers/types.js'
import type { DrawingObject, DrawingStyle } from '../../foundation/plugin/index.js'
import { ChartWorkspaceId } from '../../foundation/types/chartView.js'

import { AnchorCollector } from './AnchorCollector.js'
import type {
  DrawingPointerAnchor,
  ResolveDrawingPointerOptions,
  ResolvedInteractionAnchor,
} from './coordinateUtils.js'
import { resolveDrawingPointer } from './coordinateUtils.js'
import type { DrawingDragTarget } from './DragHandler.js'
import { DragHandler } from './DragHandler.js'
import { clearDrawingSelection, toggleDrawingSelection } from './DrawingSelection.js'
import { DrawingState, PREVIEW_ID } from './DrawingState.js'
import { isDrawingLocked } from './drawingAccess.js'
import type { HitResult, LineLabelTarget } from './HitTester.js'
import { HitTester } from './HitTester.js'
import type { MagnetMode } from './magnetSnapper.js'
import { PreviewRenderer } from './PreviewRenderer.js'
import {
  type DrawingSelectionMarquee,
  drawingIntersectsSelectionMarquee,
  hasSelectionMarqueeArea,
} from './selectionMarquee.js'
import type { DrawingToolId } from './toolConfig.js'
import { getAnchorCountForTool, getDrawingKind } from './toolConfig.js'

export type { InteractionDrawingAnchor } from './coordinateUtils.js'
// Re-export types so index.ts re-exports work unchanged
export type { DrawingToolId } from './toolConfig.js'

/** 命中标签后供宿主渲染就地编辑器的几何快照；与 HitTester 的命中结果同一类型。 */
export type DrawingLineLabelTarget = LineLabelTarget

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
  private drawingState: DrawingState
  private anchorCollector: AnchorCollector
  private previewRenderer: PreviewRenderer
  private hitTester: HitTester
  private dragHandler: DragHandler
  private pendingPaneId: string | null = null
  private pointerSession: DrawingPointerSession = { kind: 'idle' }
  /** 磁吸档位（会话级交互配置，不进 StateKernel；见 docs/design 引擎绘图硬化文档）。 */
  private magnetMode: MagnetMode = 'off'

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

  // ============ 工具状态 ============

  getActiveTool(): DrawingToolId {
    return this.adapter.getDrawingToolId()
  }

  /**
   * 会话副作用：清锚点/预览/拖拽/选中。仅 Chart 在写完 kernel 后调用。
   */
  applyToolSession(): void {
    this.anchorCollector.reset()
    this.pendingPaneId = null
    this.resetPointerSession()
    this.drawingState.removePreview()
    this.setSelected([])
  }

  setTool(toolId: DrawingToolId) {
    this.adapter.setDrawingToolId(toolId)
  }

  /**
   * 设置磁吸档位（off/weak/strong），仅影响绘图模式的锚点落点与预览路径。
   * cursor 命中、框选、标签路径不受磁吸影响。
   */
  setMagnetMode(mode: MagnetMode): void {
    this.magnetMode = mode
  }

  /** 读取当前磁吸档位。 */
  getMagnetMode(): MagnetMode {
    return this.magnetMode
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

  /** 查找指针命中的文本热点（线段中点/填充中心）；只在光标模式且非拖拽时可编辑。 */
  getLineLabelTarget(e: PointerEvent, container: HTMLElement): DrawingLineLabelTarget | null {
    if (this.getActiveTool() !== 'cursor' || this.dragHandler.isDragging()) return null
    const pointer = resolveDrawingPointer(e, container, this.adapter)
    if (!pointer) return null
    return this.hitTester.findLabelTarget(
      pointer.x,
      pointer.y,
      this.getEditableDrawings(pointer.paneId),
      this.adapter,
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
      const pointer = resolveDrawingPointer(
        e,
        container,
        this.adapter,
        this.resolveMagnetOptions(e),
      )
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
        this.adapter,
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

    const pointer = resolveDrawingPointer(e, container, this.adapter, this.resolveMagnetOptions(e))
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

  /**
   * 解析当前指针事件的磁吸配置。
   * Shift 按住时不吸附——与宿主 Shift 锁角互斥，锁角改写后的坐标不得再被磁吸改写；
   * Ctrl/Meta 按住时取反磁吸（TV 官方 Magnet Mode 语义）：off 临时开启（取 strong，
   * TV 对磁吸开的定义即吸附 OHLC 四值），weak/strong 临时关闭；无修饰键按当前档位执行。
   */
  private resolveMagnetOptions(e: PointerEvent): ResolveDrawingPointerOptions | undefined {
    if (e.shiftKey) return undefined
    if (e.ctrlKey || e.metaKey) {
      return this.magnetMode === 'off' ? { magnet: { mode: 'strong' } } : undefined
    }
    return this.magnetMode === 'off' ? undefined : { magnet: { mode: this.magnetMode } }
  }

  private handleCursorDown(e: PointerEvent, container: HTMLElement): boolean {
    // Shift 与 Ctrl 同语义：按住时点击切换选中，空白处不清空选择。
    const isMultiSelect = e.ctrlKey || e.shiftKey
    const result = this.findDrawingHit(e, container)
    if (!result) {
      if (!isMultiSelect) this.clearSelection()
      return false
    }
    const { pointer, hit } = result

    if (isMultiSelect) {
      this.toggleSelected([hit.drawing])
      return true
    }

    const selectedDrawings = this.drawingState.getSelectedDrawings()
    const isSelected = selectedDrawings.some((drawing) => drawing.id === hit.drawing.id)
    if (!isSelected) this.setSelected([hit.drawing])

    this.startDrag(pointer, hit, isSelected ? selectedDrawings : [hit.drawing])
    return true
  }

  /** 框选工具优先拖拽已选图元，其他位置才进入框选会话。 */
  private handleBoxSelectDown(e: PointerEvent, container: HTMLElement): boolean {
    const result = this.findDrawingHit(e, container)
    if (result && this.adapter.getSelectedDrawingIds().includes(result.hit.drawing.id)) {
      this.startDrag(result.pointer, result.hit, this.drawingState.getSelectedDrawings())
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
      this.getSelectableDrawings(pointer.paneId),
      this.adapter,
    )
    return hit ? { pointer, hit } : null
  }

  /**
   * 公开命中查询：返回容器局部坐标 (x, y) 处的图元，供橡皮擦、对象树 hover 等宿主交互使用。
   * 过滤口径与光标点选一致（当前 Pane + 当前工作区 + 可见）；锁定图元同样命中，编辑策略由调用方决定。
   * @param x 容器局部 X 坐标（px）
   * @param y 容器局部 Y 坐标（px）
   * @returns 命中的图元；未命中或 Pane 不可解析时返回 null
   */
  hitTestAt(x: number, y: number): DrawingObject | null {
    const pane = this.adapter.getPaneAtY(y)
    if (!pane) return null
    const hit = this.hitTester.hitTest(
      x,
      y - pane.top,
      this.getSelectableDrawings(pane.paneId),
      this.adapter,
    )
    return hit ? hit.drawing : null
  }

  /** 当前 Pane 与工作区内可被选中/命中的图元（可见且非预览；锁定图元也在内）。 */
  private getSelectableDrawings(paneId: string): DrawingObject[] {
    return this.drawingState
      .getNonPreview()
      .filter(
        (drawing) =>
          drawing.visible &&
          drawing.paneId === paneId &&
          (drawing.workspaceId ?? ChartWorkspaceId.KLine) === this.adapter.getDrawingWorkspaceId(),
      )
  }

  /** 可编辑图元：选中候选剔除锁定项，用于标签就地编辑等编辑入口。 */
  private getEditableDrawings(paneId: string): DrawingObject[] {
    return this.getSelectableDrawings(paneId).filter((drawing) => !isDrawingLocked(drawing))
  }

  /** 进入拖拽会话；锚点命中只拖动命中图元，主体命中拖动整个选择组；锁定图元一律不参与。 */
  private startDrag(
    pointer: DrawingPointerAnchor,
    hit: HitResult,
    selectedDrawings: ReadonlyArray<DrawingObject>,
  ): void {
    const target: DrawingDragTarget =
      'anchorIndex' in hit ? { type: 'anchor', index: hit.anchorIndex } : { type: 'all' }
    const targets = (target.type === 'all' ? selectedDrawings : [hit.drawing]).filter(
      (drawing) => !isDrawingLocked(drawing),
    )
    if (targets.length === 0) return
    this.dragHandler.startDrag(targets, target, pointer.x, pointer.y)
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

    const candidates = this.getSelectableDrawings(marquee.paneId).filter((drawing) =>
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

  /** 更新拖拽会话的整组临时覆盖；磁吸配置与绘制路径同源（Shift 互斥、Ctrl 取反），仅锚点拖拽生效。 */
  private handleDragMove(e: PointerEvent, container: HTMLElement): boolean {
    const draggingIds = this.dragHandler.getDraggingDrawingIds()
    if (draggingIds.some((id) => this.drawingState.getById(id) === undefined)) {
      this.resetPointerSession()
      return false
    }
    const updated = this.dragHandler.handleDragMove(
      e,
      container,
      this.adapter,
      this.resolveMagnetOptions(e),
    )
    if (!updated) return false
    this.drawingState.setDragOverrides(updated)
    return true
  }

  private setSelected(drawings: ReadonlyArray<DrawingObject>) {
    this.setSelectedIds(drawings.map((drawing) => drawing.id))
  }

  /** 将选中 ID 写回唯一状态。 */
  private setSelectedIds(ids: ReadonlyArray<string>): void {
    this.adapter.setSelectedDrawingIds(ids)
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

  private createSingleAnchorDrawing(anchor: DrawingPointerAnchor, activeTool: DrawingToolId): void {
    // 先复位工具：切回 cursor 会清空选中，必须在创建前完成，创建会原子选中新图元。
    this.adapter.setDrawingToolId('cursor')
    this.adapter.createDrawing({
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
  }

  private createMultiAnchorDrawing(
    anchors: ResolvedInteractionAnchor[],
    activeTool: DrawingToolId,
    paneId: string,
  ): void {
    // 先复位工具：切回 cursor 会清空选中，必须在创建前完成，创建会原子选中新图元。
    this.adapter.setDrawingToolId('cursor')
    this.adapter.createDrawing({
      kind: getDrawingKind(activeTool),
      paneId,
      anchors: anchors.map((anchor) => ({
        timestamp: anchor.time,
        futureOffset: anchor.futureOffset,
        price: anchor.price,
      })),
    })
  }
}

export { PREVIEW_ID }
