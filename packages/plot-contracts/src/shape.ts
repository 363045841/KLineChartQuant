/** Shape Plot 的形状、位置和尺寸契约；宿主、VM 与编辑器共用同一组枚举值。 */

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

/** Shape 的声明样式；abovebar/belowbar/top/bottom 只决定位置（value 只表示有无信号），absolute 把 value 当价格。 */
export interface ShapeOptions {
  readonly style?: ShapeStyle
  readonly location?: ShapeLocation
  readonly size?: ShapeSize
  readonly text?: string
  readonly textColor?: string
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
