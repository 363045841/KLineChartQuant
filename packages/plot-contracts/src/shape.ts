/** 标记 Plot 的形状、位置、尺寸和方向样式；宿主、VM 与编辑器共用契约。 */

export type ShapeStyle =
  | 'xcross'
  | 'cross'
  | 'circle'
  | 'square'
  | 'diamond'
  | 'triangleup'
  | 'triangledown'
  | 'arrowup'
  | 'arrowdown'
  | 'labelup'
  | 'labeldown'
  | 'flag'

export const ShapeStyle = {
  XCross: 'xcross',
  Cross: 'cross',
  Circle: 'circle',
  Square: 'square',
  Diamond: 'diamond',
  TriangleUp: 'triangleup',
  TriangleDown: 'triangledown',
  ArrowUp: 'arrowup',
  ArrowDown: 'arrowdown',
  LabelUp: 'labelup',
  LabelDown: 'labeldown',
  Flag: 'flag',
} satisfies Record<string, ShapeStyle>

export type ShapeLocation = 'abovebar' | 'belowbar' | 'top' | 'bottom' | 'absolute'

export const ShapeLocation = {
  AboveBar: 'abovebar',
  BelowBar: 'belowbar',
  Top: 'top',
  Bottom: 'bottom',
  Absolute: 'absolute',
} satisfies Record<string, ShapeLocation>

export type ShapeSize = 'auto' | 'tiny' | 'small' | 'normal' | 'large' | 'huge'

export const ShapeSize = {
  Auto: 'auto',
  Tiny: 'tiny',
  Small: 'small',
  Normal: 'normal',
  Large: 'large',
  Huge: 'huge',
} satisfies Record<string, ShapeSize>

/** Shape 与 Char 的共享样式；相对位置过滤零值，absolute 把 value 当价格。 */
export interface MarkerOptions {
  readonly location?: ShapeLocation
  readonly text?: string
  readonly textColor?: string
}

/** 固定形状标记的专属样式。 */
export interface ShapeOptions extends MarkerOptions {
  readonly style?: ShapeStyle
}

/** 字符标记；空字符可只显示附加文字。 */
export interface CharOptions extends MarkerOptions {
  readonly char?: string
}

/** 数值箭头的方向颜色；箭头长度由 Plot 公共的 size 决定。 */
export interface ArrowOptions {
  readonly colorUp?: string
  readonly colorDown?: string
}

/** 校验跨 VM 边界的形状枚举。 */
export function isShapeStyle(value: unknown): value is ShapeStyle {
  return Object.values(ShapeStyle).some((entry) => entry === value)
}

/** 校验跨 VM 边界的位置枚举。 */
export function isShapeLocation(value: unknown): value is ShapeLocation {
  return Object.values(ShapeLocation).some((entry) => entry === value)
}

/** 校验跨 VM 边界的尺寸枚举。 */
export function isShapeSize(value: unknown): value is ShapeSize {
  return Object.values(ShapeSize).some((entry) => entry === value)
}
