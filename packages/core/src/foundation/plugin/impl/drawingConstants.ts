/**
 * 绘图图元契约的字面量常量
 */

import type { DrawingPrimitiveKind, PointRole } from '../types.js'

/** 图元种类字面量；判别图元种类时引用它，不在业务代码里散落字符串。 */
export const PRIMITIVE_KIND = {
  point: 'point',
  line: 'line',
  area: 'area',
  text: 'text',
  arrow: 'arrow',
} as const satisfies Record<DrawingPrimitiveKind, DrawingPrimitiveKind>

/** 点图元角色字面量；判别角色时引用它，不在业务代码里散落字符串。 */
export const POINT_ROLE = {
  anchor: 'anchor',
  'translate-handle': 'translate-handle',
} as const satisfies Record<PointRole, PointRole>
