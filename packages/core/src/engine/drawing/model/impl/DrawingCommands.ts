/** 已确认图元的唯一写命令入口，统一提交历史与请求重绘。 */

import { DrawingHistory } from '../../history/impl/DrawingHistory.js'
import type { DrawingObject, PersistedDrawingAnchor } from '../../types.js'
import type {
  BatchDrawingPatch,
  CreateDrawingInput,
  DrawingCommandsDependencies,
  UpdateDrawingPatch,
} from '../types.js'

/** 统一执行已确认图元的写操作，确保每次成功变更都触发重绘。 */
export class DrawingCommands {
  readonly history: DrawingHistory

  constructor(private readonly dependencies: DrawingCommandsDependencies) {
    this.history = new DrawingHistory(dependencies.document, dependencies.requestDraw)
  }

  /** 创建图元并请求重绘。 */
  create(input: CreateDrawingInput): DrawingObject {
    return this.history.run(() => this.dependencies.document.createDrawing(input))
  }

  /** 以完整模型快照更新存在的图元；无匹配图元时不请求重绘。 */
  update(drawing: DrawingObject): DrawingObject | null {
    return this.history.run(() => this.dependencies.document.updateDrawing(drawing))
  }

  /** 解析声明式输入后更新图元；仅供 Agent 等外部协议适配层使用。 */
  updateFromInput(id: string, patch: UpdateDrawingPatch): DrawingObject | null {
    return this.history.run(() => this.dependencies.document.updateDrawingFromInput(id, patch))
  }

  /** 提交交互层拖拽后的已解析锚点。 */
  commitDrag(id: string, anchors: ReadonlyArray<PersistedDrawingAnchor>): DrawingObject | null {
    return this.history.run(() => this.dependencies.document.commitDrawingDrag(id, anchors))
  }

  /** 原子提交一组交互层拖拽后的已解析锚点。 */
  commitDrags(
    updates: ReadonlyArray<{ id: string; anchors: ReadonlyArray<PersistedDrawingAnchor> }>,
  ): ReadonlyArray<DrawingObject> {
    return this.history.run(() => this.dependencies.document.commitDrawingDrags(updates))
  }

  /** 原子更新一批图元的公共属性。 */
  updateBatch(ids: ReadonlyArray<string>, patch: BatchDrawingPatch): ReadonlyArray<DrawingObject> {
    return this.history.run(() => this.dependencies.document.updateBatch(ids, patch))
  }

  /** 删除存在的图元；无匹配图元时不请求重绘。 */
  remove(id: string): boolean {
    return this.history.run(() => this.dependencies.document.removeDrawing(id))
  }

  /** 原子删除一批图元。 */
  removeBatch(ids: ReadonlyArray<string>): boolean {
    return this.history.run(() => this.dependencies.document.removeBatch(ids))
  }

  /** 清除全部已确认图元并请求重绘。 */
  clear(): void {
    this.history.run(() => this.dependencies.document.clearDrawings())
  }

  /** 原子替换已确认图元并请求重绘。 */
  importDrawings(drawings: ReadonlyArray<DrawingObject>): void {
    this.history.run(() => this.dependencies.document.replaceDrawings(drawings))
  }

  /** 外部权威状态：不是用户命令，不允许撤回到同步之前。 */
  syncExternalDrawings(drawings: ReadonlyArray<DrawingObject>): void {
    this.dependencies.document.replaceDrawings(drawings)
    this.history.reset()
    this.dependencies.requestDraw()
  }

  dispose(): void {
    this.history.dispose()
  }
}
