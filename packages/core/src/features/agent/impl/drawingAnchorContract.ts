/**
 * 图元锚点契约的唯一文案来源：数量与坐标轴都取自已注册的种类声明。
 *
 * 工具描述和领域校验共用这两句，避免“描述说一套、校验做另一套”。
 */
import type { DrawingKind } from '@/engine/drawing/index.js'
import { AGENT_DRAWING_KINDS, drawingAnchorAxes, getDrawingInputAnchorCount } from '@/engine/drawing/index.js'

/**
 * 单个种类的锚点形状，例如 `2 anchors with time and price`。
 *
 * @param kind 图元种类
 * @returns 数量加坐标轴的短语
 */
export function describeDrawingAnchorShape(kind: DrawingKind): string {
  const axes = drawingAnchorAxes(kind)
  const count = getDrawingInputAnchorCount(kind)
  const label = axes.time && axes.price ? 'time and price' : axes.time ? 'time only' : 'price only'
  return `${count} anchor${count > 1 ? 's' : ''} with ${label}`
}

/**
 * 全部种类按相同形状分组的紧凑说明，用于工具描述。
 *
 * @returns 形如 `vertical-line: 1 anchor (time); ...` 的一段文本
 */
export function describeDrawingAnchorContract(): string {
  const groups = new Map<string, string[]>()
  for (const kind of AGENT_DRAWING_KINDS) {
    const shape = describeDrawingAnchorShape(kind)
    groups.set(shape, [...(groups.get(shape) ?? []), kind])
  }
  return [...groups].map(([shape, kinds]) => `${kinds.join(', ')}: ${shape}`).join('; ')
}
