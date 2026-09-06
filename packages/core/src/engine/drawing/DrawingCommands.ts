/** 已确认图元的唯一写命令入口，统一提交状态与请求重绘。 */
import type { PersistedDrawingAnchor, DrawingObject } from '../../foundation/plugin'

import type {
  BatchDrawingPatch,
  CreateDrawingInput,
  DrawingDocument,
  UpdateDrawingPatch,
} from './DrawingDocument'

/** 绘图命令运行所需的领域文档和渲染失效能力。 */
export interface DrawingCommandsDependencies {
  readonly document: DrawingDocument
  readonly requestDraw: () => void
}

/** 统一执行已确认图元的写操作，确保每次成功变更都触发重绘。 */
export class DrawingCommands {
  constructor(private readonly dependencies: DrawingCommandsDependencies) {}

  /** 创建图元并请求重绘。 */
  create(input: CreateDrawingInput): DrawingObject {
    const drawing = this.dependencies.document.createDrawing(input)
    this.dependencies.requestDraw()
    return drawing
  }

  /** 以完整模型快照更新存在的图元；无匹配图元时不请求重绘。 */
  update(drawing: DrawingObject): DrawingObject | null {
    const updated = this.dependencies.document.updateDrawing(drawing)
    if (updated) this.dependencies.requestDraw()
    return updated
  }

  /** 解析声明式输入后更新图元；仅供 Agent 等外部协议适配层使用。 */
  updateFromInput(id: string, patch: UpdateDrawingPatch): DrawingObject | null {
    const drawing = this.dependencies.document.updateDrawingFromInput(id, patch)
    if (drawing) this.dependencies.requestDraw()
    return drawing
  }

  /** 提交交互层拖拽后的已解析锚点。 */
  commitDrag(id: string, anchors: ReadonlyArray<PersistedDrawingAnchor>): DrawingObject | null {
    const drawing = this.dependencies.document.commitDrawingDrag(id, anchors)
    if (drawing) this.dependencies.requestDraw()
    return drawing
  }

  /** 原子更新一批图元的公共属性。 */
  updateBatch(ids: ReadonlyArray<string>, patch: BatchDrawingPatch): ReadonlyArray<DrawingObject> {
    const drawings = this.dependencies.document.updateBatch(ids, patch)
    if (drawings.length > 0) this.dependencies.requestDraw()
    return drawings
  }

  /** 删除存在的图元；无匹配图元时不请求重绘。 */
  remove(id: string): boolean {
    const removed = this.dependencies.document.removeDrawing(id)
    if (removed) this.dependencies.requestDraw()
    return removed
  }

  /** 原子删除一批图元。 */
  removeBatch(ids: ReadonlyArray<string>): boolean {
    const removed = this.dependencies.document.removeBatch(ids)
    if (removed) this.dependencies.requestDraw()
    return removed
  }

  /** 清除全部已确认图元并请求重绘。 */
  clear(): void {
    this.dependencies.document.clearDrawings()
    this.dependencies.requestDraw()
  }

  /** 原子替换已确认图元并请求重绘。 */
  replace(drawings: ReadonlyArray<DrawingObject>): void {
    this.dependencies.document.replaceDrawings(drawings)
    this.dependencies.requestDraw()
  }
}
