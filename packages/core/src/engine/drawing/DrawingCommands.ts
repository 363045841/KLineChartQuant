/** 已确认图元的唯一写命令入口，统一提交状态与请求重绘。 */
import type { DrawingObject } from '../../foundation/plugin'

import type { CreateDrawingInput, DrawingDocument, UpdateDrawingPatch } from './DrawingDocument'

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

  /** 更新存在的图元；无匹配图元时不请求重绘。 */
  update(id: string, patch: UpdateDrawingPatch): DrawingObject | null {
    const drawing = this.dependencies.document.updateDrawing(id, patch)
    if (drawing) this.dependencies.requestDraw()
    return drawing
  }

  /** 删除存在的图元；无匹配图元时不请求重绘。 */
  remove(id: string): boolean {
    const removed = this.dependencies.document.removeDrawing(id)
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
