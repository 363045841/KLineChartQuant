import type { DrawingChartAdapter } from '../../controllers/types'
import type { DrawingObject, DrawingStyle } from '../../foundation/plugin/index'

const PREVIEW_ID = '__preview__'

/**
 * 交互会话层：只持预览与拖拽覆盖，不持完整图元列表。
 * 已确认图元唯一 SSOT 是 kernel.drawing，经 adapter 读写。
 */
export class DrawingState {
  private preview: DrawingObject | null = null
  private dragOverride: DrawingObject | null = null

  constructor(private adapter: DrawingChartAdapter) {}

  // ---- Read ----

  /** kernel 已确认图元（不含预览） */
  private committed(): DrawingObject[] {
    return this.adapter.getFullDrawings().filter((d) => d.id !== PREVIEW_ID)
  }

  /** 渲染用：拖拽覆盖 + 预览（顺序：override 先，preview 后） */
  getPaintOverlay(): DrawingObject[] {
    const out: DrawingObject[] = []
    if (this.dragOverride) out.push(this.dragOverride)
    if (this.preview) out.push(this.preview)
    return out
  }

  /** 已确认 ⊕ 会话覆盖（UI / getDrawings） */
  getAll(): DrawingObject[] {
    return mergePaint(this.committed(), this.getPaintOverlay())
  }

  /** 命中检测用：已确认 + 拖拽覆盖，不含预览 */
  getNonPreview(): DrawingObject[] {
    return mergePaint(this.committed(), this.dragOverride ? [this.dragOverride] : [])
  }

  getById(id: string): DrawingObject | undefined {
    if (this.dragOverride?.id === id) return this.dragOverride
    if (this.preview?.id === id) return this.preview
    return this.committed().find((d) => d.id === id)
  }

  hasPreview(): boolean {
    return this.preview !== null
  }

  getSelected(): DrawingObject | null {
    const id = this.getSelectedId()
    if (!id) return null
    return this.getById(id) ?? null
  }

  getSelectedId(): string | null {
    return this.adapter.getSelectedDrawingId()
  }

  // ---- Session (no kernel write) ----

  setPreview(preview: DrawingObject): void {
    this.preview = preview
    this.adapter.requestDraw?.()
  }

  removePreview(): void {
    if (!this.preview) return
    this.preview = null
    this.adapter.requestDraw?.()
  }

  setDragOverride(drawing: DrawingObject): void {
    this.dragOverride = drawing
    this.adapter.requestDraw?.()
  }

  clearDragOverride(): void {
    if (!this.dragOverride) return
    this.dragOverride = null
  }

  /** pointerup：把拖拽结果写入 kernel，清会话覆盖 */
  commitDrag(): void {
    if (!this.dragOverride) return
    const next = mergePaint(this.committed(), [this.dragOverride])
    this.dragOverride = null
    this.adapter.setDrawings(next)
  }

  // ---- Committed writes (kernel) ----

  setDrawings(drawings: DrawingObject[]): void {
    this.preview = null
    this.dragOverride = null
    const committed = drawings.filter((d) => d.id !== PREVIEW_ID)
    this.clearSelectionIfMissing(committed)
    this.adapter.setDrawings(committed)
  }

  replaceDrawings(drawings: DrawingObject[]): void {
    this.setDrawings(drawings)
  }

  addOrUpdate(drawing: DrawingObject): void {
    if (drawing.id === PREVIEW_ID) {
      this.setPreview(drawing)
      return
    }
    const next = mergePaint(this.committed(), [drawing])
    this.adapter.setDrawings(next)
  }

  removeDrawing(drawingId: string): void {
    if (this.dragOverride?.id === drawingId) this.dragOverride = null
    if (this.preview?.id === drawingId) this.preview = null
    const next = this.committed().filter((d) => d.id !== drawingId)
    this.clearSelectionIfMissing(next)
    this.adapter.setDrawings(next)
  }

  updateDrawingStyle(drawingId: string, style: Partial<DrawingStyle>): void {
    const next = this.committed().map((d) =>
      d.id === drawingId ? { ...d, style: { ...d.style, ...style } } : d,
    )
    if (this.dragOverride?.id === drawingId) {
      this.dragOverride = { ...this.dragOverride, style: { ...this.dragOverride.style, ...style } }
    }
    this.adapter.setDrawings(next)
  }

  setSelected(drawing: DrawingObject | null): void {
    const newId = drawing?.id ?? null
    if (this.adapter.getSelectedDrawingId() === newId) return
    this.adapter.setSelectedDrawingId(newId)
  }

  clear(): void {
    this.preview = null
    this.dragOverride = null
    this.adapter.setDrawings([])
    this.adapter.setSelectedDrawingId(null)
  }

  private clearSelectionIfMissing(list: DrawingObject[]): void {
    const selected = this.adapter.getSelectedDrawingId()
    if (selected && !list.some((d) => d.id === selected)) {
      this.adapter.setSelectedDrawingId(null)
    }
  }
}

/** 以 id 合并；overlay 覆盖同 id；__preview__ 追加在末尾 */
export function mergePaint(
  committed: ReadonlyArray<DrawingObject>,
  overlay: ReadonlyArray<DrawingObject>,
): DrawingObject[] {
  const byId = new Map<string, DrawingObject>()
  for (const d of committed) {
    if (d.id !== PREVIEW_ID) byId.set(d.id, d)
  }
  const previews: DrawingObject[] = []
  for (const o of overlay) {
    if (o.id === PREVIEW_ID) previews.push(o)
    else byId.set(o.id, o)
  }
  return [...byId.values(), ...previews]
}

export { PREVIEW_ID }
