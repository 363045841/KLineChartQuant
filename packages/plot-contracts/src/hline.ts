/** 图表级水平参考线契约：固定价格、贯穿整幅宽度，不占用逐 bar 数据列。 */
import type { Color } from './color.js'

/**
 * @summary 水平线线型
 *
 * `hline` 的线型档位；与 Pine 的 `hline.style_*` 对应。
 */
export const HLineStyle = {
  /** @summary 实线 */
  style_solid: 'solid',
  /** @summary 虚线 */
  style_dashed: 'dashed',
  /** @summary 点线 */
  style_dotted: 'dotted',
} as const

/** 水平线线型取值。 */
export type HLineStyle = (typeof HLineStyle)[keyof typeof HLineStyle]

/** `hline` 的调用样式；价格由位置参数提供。 */
export interface HLineOptions {
  /** 无障碍标题；缺省不显示。 */
  readonly title?: string
  /** 颜色，支持 CSS 颜色值；常用色可用 `Color` 枚举。 */
  readonly color?: Color | (string & {})
  /** 线型；缺省实线。 */
  readonly linestyle?: HLineStyle
  /** 线宽，逻辑像素；缺省 1。 */
  readonly linewidth?: number
}

/** 归一化后的水平参考线；渲染端只消费 dash 与 width。 */
export interface HLine {
  /** 本轮运行内的稳定 id；fill 用它引用这条线。 */
  readonly id: string
  readonly price: number
  readonly color: string
  readonly dash: readonly number[]
  readonly width: number
}

/** hline 返回的句柄；fill 借它引用两条水平线之间的区域。 */
export interface HLineRef {
  /** 句柄所属水平线的 id，只在本轮运行内有效。 */
  readonly hline: string
}

/** 两条水平参考线之间的整幅宽填充；单色，不按 bar 变化。 */
export interface HLineFill {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly color: string
  readonly visible: boolean
}

/** 线型到虚线段长的映射；渲染层只认 dash。 */
export function hLineDash(style: HLineStyle = HLineStyle.style_solid): readonly number[] {
  switch (style) {
    case HLineStyle.style_solid:
      return []
    case HLineStyle.style_dashed:
      return [4, 4]
    case HLineStyle.style_dotted:
      return [2, 2]
  }
}
