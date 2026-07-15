import type { DrawingChartAdapter } from '../../controllers/types'
import type { DrawingObject, DrawingStyle } from '../../foundation/plugin/index'

const PREVIEW_ID = '__preview__'

/**
 * 交互会话层 CRUD。本地 drawings 数组是工作副本；
 * 持久业务 SSOT 是 kernel.drawing，经 DrawingChartAdapter.setDrawings 同步。
 * 选中 id 只经 adapter 读写 kernel，不持本地 selectedDrawingId。
 * 禁止直接写 DrawingStore。
 */
export class DrawingState {
  private drawings: DrawingObject[] = []

  constructor(private adapter: DrawingChartAdapter) {}

  // ---- Read ----

  /** 返回全部图元拷贝（含预览）；调用方不得当作 SSOT 长期持有 */
  getAll(): DrawingObject[] {
    return this.drawings.slice()
  }

  /** 返回非预览图元（用于命中检测） */
  getNonPreview(): DrawingObject[] {
    return this.drawings.filter((d) => d.id !== PREVIEW_ID)
  }

  /** 按 ID 查找图元 */
  getById(id: string): DrawingObject | undefined {
    return this.drawings.find((d) => d.id === id)
  }

  /** 是否有预览图元 */
  hasPreview(): boolean {
    return this.drawings.some((d) => d.id === PREVIEW_ID)
  }

  /** 返回当前选中图元（选中 id 读 kernel） */
  getSelected(): DrawingObject | null {
    const id = this.getSelectedId()
    if (!id) return null
    return this.drawings.find((d) => d.id === id) ?? null
  }

  /** 返回当前选中图元的 ID（读 kernel） */
  getSelectedId(): string | null {
    return this.adapter.getSelectedDrawingId()
  }

  // ---- Write ----

  /**
   * 工作副本必须可变：kernel deepFreezeSnapshot 会冻结数组与元素。
   */
  private adoptWorkCopy(drawings: ReadonlyArray<DrawingObject>): DrawingObject[] {
    return drawings.map((d) => ({
      ...d,
      anchors: d.anchors.map((a) => ({ ...a })),
      params: { ...d.params },
      style: { ...d.style },
    }))
  }

  private clearSelectionIfMissing(): void {
    const selected = this.adapter.getSelectedDrawingId()
    if (selected && !this.drawings.some((d) => d.id === selected)) {
      this.adapter.setSelectedDrawingId(null)
    }
  }

  /** 整体替换图元列表；选中 id 不在列表时清 kernel 选中 */
  setDrawings(drawings: DrawingObject[]): void {
    this.drawings = this.adoptWorkCopy(drawings)
    this.clearSelectionIfMissing()
    this.adapter.setDrawings(this.drawings)
  }

  /** 替换图元列表，若选中项被移除则清除选中 */
  replaceDrawings(drawings: DrawingObject[]): void {
    this.drawings = this.adoptWorkCopy(drawings)
    this.clearSelectionIfMissing()
    this.adapter.setDrawings(this.drawings)
  }

  /** 添加或更新单个图元（id 相同则替换） */
  addOrUpdate(drawing: DrawingObject): void {
    const idx = this.drawings.findIndex((d) => d.id === drawing.id)
    if (idx >= 0) {
      const next = this.drawings.slice()
      next[idx] = drawing
      this.drawings = next
    } else {
      this.drawings = [...this.drawings, drawing]
    }
    this.adapter.setDrawings(this.drawings)
  }

  /** 删除图元；kernel setDrawings 会清无效选中 */
  removeDrawing(drawingId: string): void {
    this.drawings = this.drawings.filter((d) => d.id !== drawingId)
    this.clearSelectionIfMissing()
    this.adapter.setDrawings(this.drawings)
  }

  /** 更新图元样式（合并到已有样式） */
  updateDrawingStyle(drawingId: string, style: Partial<DrawingStyle>): void {
    this.drawings = this.drawings.map((d) =>
      d.id === drawingId ? { ...d, style: { ...d.style, ...style } } : d,
    )
    this.adapter.setDrawings(this.drawings)
  }

  /**
   * 设置选中图元。只写 kernel，不持本地字段。
   */
  setSelected(drawing: DrawingObject | null): void {
    const newId = drawing?.id ?? null
    if (this.adapter.getSelectedDrawingId() === newId) return
    this.adapter.setSelectedDrawingId(newId)
  }

  /** 删除预览图元（__preview__） */
  removePreview(): void {
    if (!this.hasPreview()) return
    this.drawings = this.drawings.filter((d) => d.id !== PREVIEW_ID)
    this.adapter.setDrawings(this.drawings)
  }

  /** 设置预览图元（替换已有的 __preview__） */
  setPreview(preview: DrawingObject): void {
    this.drawings = [...this.drawings.filter((d) => d.id !== PREVIEW_ID), preview]
    this.adapter.setDrawings(this.drawings)
  }

  /** 清空所有图元并清除选中 */
  clear(): void {
    this.drawings = []
    this.adapter.setDrawings([])
    this.adapter.setSelectedDrawingId(null)
  }
}

export { PREVIEW_ID }
