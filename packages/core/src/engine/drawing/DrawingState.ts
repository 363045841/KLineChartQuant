import type { DrawingChartAdapter } from '../../controllers/types'
import type { DrawingObject } from '../../foundation/plugin/index'

const PREVIEW_ID = '__preview__'

/**
 * 交互会话层：只持预览与拖拽覆盖，不持完整图元列表。
 * 已确认图元唯一 SSOT 是 kernel.drawing，经 adapter 读写。
 */
export class DrawingState {
  private preview: DrawingObject | null = null
  private dragOverrides: DrawingObject[] = []

  constructor(private adapter: DrawingChartAdapter) {}

  // ---- Read ----

  /** kernel 已确认图元（不含预览） */
  private committed(): DrawingObject[] {
    return this.adapter.getFullDrawings().filter((d) => d.id !== PREVIEW_ID)
  }

  /** 渲染用：拖拽覆盖 + 预览（顺序：override 先，preview 后） */
  getPaintOverlay(): DrawingObject[] {
    const out: DrawingObject[] = []
    out.push(...this.dragOverrides)
    if (this.preview) out.push(this.preview)
    return out
  }

  /** 已确认 ⊕ 会话覆盖（UI / getDrawings） */
  getAll(): DrawingObject[] {
    return mergePaint(this.committed(), this.getPaintOverlay())
  }

  /** 命中检测用：已确认 + 拖拽覆盖，不含预览 */
  getNonPreview(): DrawingObject[] {
    return mergePaint(this.committed(), this.dragOverrides)
  }

  getById(id: string): DrawingObject | undefined {
    const dragOverride = this.dragOverrides.find((drawing) => drawing.id === id)
    if (dragOverride) return dragOverride
    if (this.preview?.id === id) return this.preview
    return this.committed().find((d) => d.id === id)
  }

  hasPreview(): boolean {
    return this.preview !== null
  }

  getSelectedDrawings(): DrawingObject[] {
    return this.adapter
      .getSelectedDrawingIds()
      .map((id) => this.getById(id))
      .filter((drawing): drawing is DrawingObject => drawing !== undefined)
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
    this.setDragOverrides([drawing])
  }

  /** 写入整组拖拽覆盖，用于多选图元的同帧临时投影。 */
  setDragOverrides(drawings: ReadonlyArray<DrawingObject>): void {
    this.dragOverrides = [...drawings]
    this.adapter.requestDraw?.()
  }

  clearDragOverride(): void {
    if (this.dragOverrides.length === 0) return
    this.dragOverrides = []
  }

  /** pointerup：把拖拽结果写入 kernel，清会话覆盖 */
  commitDrag(): void {
    this.commitDrags()
  }

  /** 将整组拖拽结果原子写入 kernel，再清理会话覆盖。 */
  commitDrags(): void {
    if (this.dragOverrides.length === 0) return
    const updates = this.dragOverrides.map((drawing) => ({ id: drawing.id, anchors: drawing.anchors }))
    this.dragOverrides = []
    if (updates.length === 1) {
      const update = updates[0]!
      this.adapter.commitDrawingDrag(update.id, update.anchors)
      return
    }
    this.adapter.commitDrawingDrags(updates)
  }

  setSelected(drawings: ReadonlyArray<DrawingObject>): void {
    this.adapter.setSelectedDrawingIds(drawings.map((drawing) => drawing.id))
  }

  clearSession(): void {
    this.preview = null
    this.dragOverrides = []
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
