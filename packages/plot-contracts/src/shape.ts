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

/**
 * 图形尺寸档位；size 不填则使用 Auto，各档位的尺寸如下。
 *
 * | 档位 | 折线宽度（px） | 散点直径（px） | 形状 / 字符外框边长（px） | 箭头最大高度（px） | 柱宽 / K 线间距 |
 * | --- | --- | --- | --- | --- | --- |
 * | ShapeSize.Auto | 1 | 3 | 12 | 50 | 1 |
 * | ShapeSize.Tiny | 1 | 6 | 6 | 20 | 0.4 |
 * | ShapeSize.Small | 1 | 10 | 10 | 30 | 0.6 |
 * | ShapeSize.Normal | 2 | 14 | 14 | 40 | 0.8 |
 * | ShapeSize.Large | 3 | 20 | 20 | 60 | 1.2 |
 * | ShapeSize.Huge | 4 | 28 | 28 | 90 | 1.6 |
 *
 * px 为逻辑像素；箭头实际高度随数值幅度变化，最短为最大高度的 10%。
 */
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
  /** 标记位置；默认在 K 线上方，ShapeLocation.Absolute 表示绘制在 value 指定的价格处。 */
  readonly location?: ShapeLocation
  /** 标记旁的附加文字；不填则不显示附加文字。 */
  readonly text?: string
  /** 标记附加文字的颜色，支持 CSS 颜色值；默认与图形颜色一致。 */
  readonly textColor?: string
}

/** 固定形状标记的专属样式。 */
export interface ShapeOptions extends MarkerOptions {
  /** 标记形状；不填则使用 ShapeStyle.XCross。 */
  readonly style?: ShapeStyle
}

/** 字符标记；空字符可只显示附加文字。 */
export interface CharOptions extends MarkerOptions {
  /** 要绘制的单个 Unicode 字符；不填则显示 ★，填空字符串则只显示附加文字。 */
  readonly char?: string
}

/** 数值箭头的方向颜色；箭头长度由 Plot 公共的 size 决定。 */
export interface ArrowOptions {
  /** 正值向上箭头的颜色，支持 CSS 颜色值；默认使用 color。 */
  readonly colorUp?: string
  /** 负值向下箭头的颜色，支持 CSS 颜色值；默认使用 color。 */
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
