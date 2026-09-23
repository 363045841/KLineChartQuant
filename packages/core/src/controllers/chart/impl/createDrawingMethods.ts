/**
 * createDrawingMethods — ChartController 的绘图文档操作与绘图视口适配方法集。
 *
 * 从 createChartController 抽出：图元增删改查、批量操作、工具与全局锁定状态、
 * 撤销重做、会话层重绘钩子，以及绘图坐标换算与 Pane 查询。
 * 每个方法保留原有的 disposed 守卫语义，由调用方展开进 ChartController 返回对象。
 */

import type { Chart } from '../../../engine/chart.js'
import type {
  DrawingInteractionController,
  DrawingToolId,
  DrawingWorkspaceId,
  PersistedDrawingAnchor,
} from '../../../engine/drawing/index.js'
import type {
  BatchDrawingPatch,
  CreateDrawingInput,
  DrawingObject,
  DrawingStyleKey,
  PaneLayoutInfo,
} from '../types.js'

/**
 * 构造绘图相关方法集合。
 *
 * @param chart 内部 Chart 引擎实例
 * @param isDisposed 查询控制器是否已销毁
 * @returns 全部绘图文档 / 视口方法，供 ChartController 返回对象展开
 */
export function createDrawingMethods(chart: Chart, isDisposed: () => boolean) {
  const drawingDocument = chart.drawingDocument
  const drawingCommands = chart.drawingCommands

  /** 设置当前绘图工具，null 视为 cursor。 */
  function setDrawingTool(tool: DrawingToolId | null): void {
    if (isDisposed()) return
    chart.drawing.setTool(tool)
  }

  /** 设置当前绘图工具 id。 */
  function setDrawingToolId(toolId: DrawingToolId): void {
    if (isDisposed()) return
    chart.drawing.setTool(toolId)
  }

  /** 读取当前绘图工具 id，销毁后回退 cursor。 */
  function getDrawingToolId(): DrawingToolId {
    if (isDisposed()) return 'cursor'
    return chart.drawing.tool.peek()
  }

  /** 设置全局绘图锁定，只冻结移动，不改写各图元自身 locked。 */
  function setGlobalDrawingLock(locked: boolean): void {
    if (isDisposed()) return
    chart.drawing.setGlobalDrawingLock(locked)
  }

  /** 读取全局绘图锁定状态，销毁后视为未锁定。 */
  function isGlobalDrawingLocked(): boolean {
    return !isDisposed() && chart.drawing.globalLock.peek()
  }

  /** 注册绘图交互会话到 Chart，使工具切换能清理会话副作用。 */
  function registerDrawingSession(session: unknown | null): void {
    if (isDisposed()) return
    chart.registerDrawingSession(session as DrawingInteractionController | null)
  }

  /** 清除所有已确认图元。 */
  function clearDrawings(): void {
    if (isDisposed()) return
    chart.drawing.clear()
  }

  /** 创建一个已确认图元。 */
  function createDrawing(input: CreateDrawingInput): DrawingObject {
    if (isDisposed()) throw new Error('Chart controller has been disposed.')
    return drawingCommands.create(input)
  }

  /** 以完整模型快照更新一个已确认图元。 */
  function updateDrawing(drawing: DrawingObject): DrawingObject | null {
    if (isDisposed()) return null
    return drawingCommands.update(drawing)
  }

  /** 提交交互层拖拽后的已解析锚点。 */
  function commitDrawingDrag(
    id: string,
    anchors: ReadonlyArray<PersistedDrawingAnchor>,
  ): DrawingObject | null {
    if (isDisposed()) return null
    return drawingCommands.commitDrag(id, anchors)
  }

  /** 原子提交一组交互层拖拽后的已解析锚点。 */
  function commitDrawingDrags(
    updates: ReadonlyArray<{ id: string; anchors: ReadonlyArray<PersistedDrawingAnchor> }>,
  ): ReadonlyArray<DrawingObject> {
    if (isDisposed()) return []
    return drawingCommands.commitDrags(updates)
  }

  /** 原子更新一批图元的公共属性。 */
  function updateBatch(
    ids: ReadonlyArray<string>,
    patch: BatchDrawingPatch,
  ): ReadonlyArray<DrawingObject> {
    if (isDisposed()) return []
    return drawingCommands.updateBatch(ids, patch)
  }

  /** 返回一批图元共同拥有的样式字段。 */
  function getBatchStyleKeys(ids: ReadonlyArray<string>): ReadonlyArray<DrawingStyleKey> {
    if (isDisposed()) return []
    return drawingDocument.getBatchStyleKeys(ids)
  }

  /** 移除一个已确认图元。 */
  function removeDrawing(drawingId: string): boolean {
    if (isDisposed()) return false
    return drawingCommands.remove(drawingId)
  }

  /** 原子移除一批图元。 */
  function removeBatch(ids: ReadonlyArray<string>): boolean {
    if (isDisposed()) return false
    return drawingCommands.removeBatch(ids)
  }

  /** 外部权威文档同步：替换全部图元并重设撤回历史基线。 */
  function replaceDrawings(drawings: ReadonlyArray<DrawingObject>): void {
    if (isDisposed()) return
    chart.drawing.setDrawings(drawings)
  }

  /** 用户导入，作为一条可撤回的文档替换事务。 */
  function importDrawings(drawings: ReadonlyArray<DrawingObject>): void {
    if (isDisposed()) return
    chart.cancelDrawingSession()
    drawingCommands.importDrawings(drawings)
  }

  /** 撤回上一步绘图文档操作。 */
  function undoDrawing(): boolean {
    return !isDisposed() && chart.undoDrawing()
  }

  /** 重做上一步被撤回的绘图文档操作。 */
  function redoDrawing(): boolean {
    return !isDisposed() && chart.redoDrawing()
  }

  // ---- DrawingChartAdapter methods ----

  /** 读取全部图元列表（plugin 级 DrawingObject）。 */
  function getFullDrawings(): ReadonlyArray<DrawingObject> {
    if (isDisposed()) return []
    return drawingDocument.listDrawings()
  }

  /** 请求一次重绘。 */
  function requestDraw(): void {
    if (isDisposed()) return
    chart.scheduleDraw()
  }

  /** 图元拖拽开始：冻结绘图悬停目标，拖拽期间光标不再被实时命中改写。 */
  function freezeHoverTarget(): void {
    if (isDisposed()) return
    chart.freezeDrawingHover()
  }

  /** 图元拖拽结束：解冻绘图悬停目标，恢复实时命中。 */
  function unfreezeHoverTarget(): void {
    if (isDisposed()) return
    chart.unfreezeDrawingHover()
  }

  /** 设置当前选中图元集合。 */
  function setSelectedDrawingIds(ids: ReadonlyArray<string>): void {
    if (isDisposed()) return
    chart.drawing.setSelectedIds(ids)
  }

  /** 读取当前选中图元集合。 */
  function getSelectedDrawingIds(): ReadonlyArray<string> {
    if (isDisposed()) return []
    return chart.drawing.selectedIds.peek()
  }

  /** 读取当前视口（图表未就绪时为 null）。 */
  function getViewport(): { scrollLeft: number; plotWidth: number; plotHeight: number } | null {
    if (isDisposed()) return null
    const vp = chart.getViewport()
    return vp
  }

  /** 读取解析后的图表选项（kWidth、kGap）。 */
  function getKWidthKGap(): { kWidth: number; kGap: number } {
    if (isDisposed()) return { kWidth: 0, kGap: 0 }
    return {
      kWidth: chart.kernel.zoom.readonly.kWidth.peek(),
      kGap: chart.kernel.viewport.readonly.kGap.peek(),
    }
  }

  /** 读取设备像素比。 */
  function getCurrentDpr(): number {
    if (isDisposed()) return 1
    return chart.getCurrentDpr()
  }

  /** screen-x → 逻辑 bar 索引。 */
  function getLogicalIndexAtX(mouseX: number): number | null {
    if (isDisposed()) return null
    return chart.getLogicalIndexAtX(mouseX)
  }

  /** 逻辑 bar 索引 → 当前帧 screen x。 */
  function getScreenXAtLogicalIndex(index: number): number | null {
    if (isDisposed()) return null
    return chart.getScreenXAtLogicalIndex(index)
  }

  /** 逻辑索引 → 时间戳（ms）。 */
  function getTimestampAtLogicalIndex(index: number): number | null {
    if (isDisposed()) return null
    return chart.getTimestampAtLogicalIndex(index)
  }

  /** 当前绘制数据点，仅用于绘图坐标解析。 */
  function getDrawingData(): ReadonlyArray<{ timestamp: number }> {
    if (isDisposed()) return []
    return chart.drawing.getData()
  }

  /** 逻辑索引 → 当前绘制数据点的时间戳（ms）。 */
  function getDrawingTimestampAtLogicalIndex(index: number): number | null {
    if (isDisposed()) return null
    return chart.drawing.getTimestampAtLogicalIndex(index)
  }

  /** unix 时间戳（ms）→ 当前逻辑索引。 */
  function getLogicalIndexAtTimestamp(timestamp: number): number | null {
    if (isDisposed()) return null
    return chart.getLogicalIndexAtTimestamp(timestamp)
  }

  /** 读取当前绘图所属的数据工作区。 */
  function getDrawingWorkspaceId(): DrawingWorkspaceId {
    if (isDisposed()) return 'kline' // 应当消除硬编码
    return chart.drawing.getWorkspaceId()
  }

  /** 指定 Pane 内 price → Y。 */
  function priceToY(paneId: string, price: number): number {
    if (isDisposed()) return 0
    const renderer = chart.getPaneRenderers().find((item) => item.getPane().id === paneId)
    return renderer?.getPane().yAxis.priceToY(price) ?? 0
  }

  /** 指定 Pane 内 Y → price。 */
  function yToPrice(paneId: string, y: number): number {
    if (isDisposed()) return 0
    const renderer = chart.getPaneRenderers().find((item) => item.getPane().id === paneId)
    return renderer?.getPane().yAxis.yToPrice(y) ?? 0
  }

  /** 按 Pane ID 读取只读 Pane 元数据。 */
  function getPaneInfo(paneId: string): PaneLayoutInfo | undefined {
    if (isDisposed()) return undefined
    const renderer = chart.getPaneRenderers().find((item) => item.getPane().id === paneId)
    const pane = renderer?.getPane()
    if (!pane) return undefined
    return { paneId: pane.id, top: pane.top, height: pane.height }
  }

  /** 根据图表局部 Y 坐标查找所属 Pane。 */
  function getPaneAtY(y: number): PaneLayoutInfo | undefined {
    if (isDisposed()) return undefined
    const renderer = chart
      .getPaneRenderers()
      .find((item) => y >= item.getPane().top && y <= item.getPane().top + item.getPane().height)
    const pane = renderer?.getPane()
    return pane ? { paneId: pane.id, top: pane.top, height: pane.height } : undefined
  }

  return {
    setDrawingTool,
    setDrawingToolId,
    getDrawingToolId,
    setGlobalDrawingLock,
    isGlobalDrawingLocked,
    registerDrawingSession,
    clearDrawings,
    createDrawing,
    updateDrawing,
    commitDrawingDrag,
    commitDrawingDrags,
    updateBatch,
    getBatchStyleKeys,
    removeDrawing,
    removeBatch,
    replaceDrawings,
    importDrawings,
    undoDrawing,
    redoDrawing,
    getFullDrawings,
    requestDraw,
    freezeHoverTarget,
    unfreezeHoverTarget,
    setSelectedDrawingIds,
    getSelectedDrawingIds,
    getViewport,
    getKWidthKGap,
    getCurrentDpr,
    getLogicalIndexAtX,
    getScreenXAtLogicalIndex,
    getTimestampAtLogicalIndex,
    getDrawingData,
    getDrawingTimestampAtLogicalIndex,
    getLogicalIndexAtTimestamp,
    getDrawingWorkspaceId,
    priceToY,
    yToPrice,
    getPaneInfo,
    getPaneAtY,
  }
}
