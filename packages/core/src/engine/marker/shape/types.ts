/**
 * 自定义标记的形状、样式与标签契约。
 * 供引擎内的标记绘制与命中测试消费，不承载任何语义化 JSON 配置。
 */

/** 自定义标记形状 */
export type CustomMarkerShape =
  | 'arrow_up'
  | 'arrow_down'
  | 'flag'
  | 'circle'
  | 'rectangle'
  | 'diamond'

/** 自定义标记样式 */
export interface CustomMarkerStyle {
  fillColor?: string
  strokeColor?: string
  textColor?: string
  size?: number
  lineWidth?: number
  opacity?: number
}

/** 自定义标记标签 */
export interface CustomMarkerLabel {
  text: string
  position?: 'left' | 'right' | 'top' | 'bottom' | 'inside'
  align?: 'start' | 'center' | 'end'
  fontSize?: number
  offset?: { x?: number; y?: number }
}
