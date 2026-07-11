import type { DrawingChartAdapter } from '../../controllers/types'
import type { DrawingObject, DrawingStyle } from '../../foundation/plugin/index'

const PREVIEW_ID = '__preview__'

/**
 * Drawing 数据管理层 —— 图元 CRUD、选中状态、预览管理。
 *
 * 所有变更操作会自动同步到 DrawingChartAdapter（触发渲染）。
 * 不处理事件、不处理命中检测、不处理拖拽逻辑，只维护数据一致性。
 */
export class DrawingState {
  private drawings: DrawingObject[] = []
  private selectedDrawingId: string | null = null

  constructor(private adapter: DrawingChartAdapter) {}

  // ---- Read ----

  /** 返回全部图元（含预览） */
  getAll(): DrawingObject[] {
    return this.drawings
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

  /** 返回当前选中图元 */
  getSelected(): DrawingObject | null {
    if (!this.selectedDrawingId) return null
    return this.drawings.find((d) => d.id === this.selectedDrawingId) ?? null
  }

  /** 返回当前选中图元的 ID */
  getSelectedId(): string | null {
    return this.selectedDrawingId
  }

  // ---- Write ----
  // 所有 write 方法都会调用 adapter.setDrawings() 触发渲染

  /** 整体替换图元列表（会清理选中状态） */
  setDrawings(drawings: DrawingObject[]): void {
    this.drawings = drawings
    this.adapter.setDrawings(drawings)
  }

  /** 替换图元列表，若选中项被移除则自动清除选中 */
  replaceDrawings(drawings: DrawingObject[]): void {
    this.drawings = drawings
    if (this.selectedDrawingId && !this.drawings.some((d) => d.id === this.selectedDrawingId)) {
      this.selectedDrawingId = null
    }
    this.adapter.setDrawings(this.drawings)
  }

  /** 添加或更新单个图元（id 相同则替换） */
  addOrUpdate(drawing: DrawingObject): void {
    const idx = this.drawings.findIndex((d) => d.id === drawing.id)
    if (idx >= 0) {
      this.drawings[idx] = drawing
    } else {
      this.drawings.push(drawing)
    }
    this.adapter.setDrawings(this.drawings)
  }

  /** 删除图元，若为选中项则清除选中 */
  removeDrawing(drawingId: string): void {
    this.drawings = this.drawings.filter((d) => d.id !== drawingId)
    if (this.selectedDrawingId === drawingId) {
      this.selectedDrawingId = null
    }
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
   * 设置选中图元。
   * 仅在选中 ID 确实变化时才触发 adapter 同步。
   * 不触发 onDrawingSelected 回调 —— 由调用方（controller）管理。
   */
  setSelected(drawing: DrawingObject | null): void {
    const newId = drawing?.id ?? null
    if (this.selectedDrawingId === newId) return
    this.selectedDrawingId = newId
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
    this.drawings = this.drawings.filter((d) => d.id !== PREVIEW_ID)
    this.drawings.push(preview)
    this.adapter.setDrawings(this.drawings)
  }

  /** 清空所有图元并清除选中 */
  clear(): void {
    this.drawings = []
    this.selectedDrawingId = null
    this.adapter.setDrawings([])
    this.adapter.setSelectedDrawingId(null)
  }
}

export { PREVIEW_ID }
