/**
 * 图形定义注册表：按 DrawingKind 注册并解析几何计算定义。
 */

import type {
  DrawingComputeContext,
  DrawingDefinition,
  DrawingGeometry,
  DrawingKind,
  ResolvedDrawingObject,
} from '../../types.js'

/** 图形定义注册表 —— kind → definition 的查找与计算入口。 */
export class DrawingDefinitionRegistry {
  private definitions = new Map<DrawingKind, DrawingDefinition>()

  /** 注册（或覆盖）某 kind 的图形定义。 */
  register<TParams = Record<string, unknown>>(definition: DrawingDefinition<TParams>): void {
    this.definitions.set(definition.kind, definition as DrawingDefinition)
  }

  /** 按 kind 取回图形定义；未注册返回 undefined。 */
  get(kind: DrawingKind): DrawingDefinition | undefined {
    return this.definitions.get(kind)
  }

  /** 对已解析图元执行几何计算；未注册定义返回 null。 */
  compute(drawing: ResolvedDrawingObject, context: DrawingComputeContext): DrawingGeometry | null {
    const definition = this.get(drawing.kind)
    if (!definition) return null
    return definition.compute(drawing, context)
  }
}
