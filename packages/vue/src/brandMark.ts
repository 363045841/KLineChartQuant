/**
 * 品牌折线标识的唯一来源：与应用图标 kcq-logo.svg 中的两条通道轨迹一致，
 * DOM 品牌与截图水印共用同一份路径、包围盒和描边宽度。
 */

/** 折线路径，坐标系与 kcq-logo.svg 的 viewBox 一致。 */
export const BRAND_MARK_PATH =
  'M66.4 133.6L100 100L133.6 133.6L189.6 77.6 M66.4 178.4L100 144.8L133.6 178.4L189.6 122.4'

/** 折线（含圆头描边外扩）在图标 viewBox 中的紧包围盒，用于等比缩放与画布定位。 */
export const BRAND_MARK_VIEWBOX = { x: 54, y: 65, width: 148, height: 126 } as const

/** 图标中的原始描边宽度，随 viewBox 等比缩放，不单独调整。 */
export const BRAND_MARK_STROKE_WIDTH = 16.8
