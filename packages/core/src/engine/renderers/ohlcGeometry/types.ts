/** 主图和脚本 OHLC 共用的屏幕几何契约，坐标使用逻辑像素。 */
export type OhlcRect = readonly [x: number, y: number, width: number, height: number]

/** 一根 OHLC 的三部分几何；矩形内部不重叠，透明色不会重复叠加。 */
export interface OhlcGeometry {
  readonly body: readonly OhlcRect[]
  readonly border: readonly OhlcRect[]
  readonly wick: readonly OhlcRect[]
}

/** OHLC 投影参数；价格坐标由所在 Pane 的 Y 轴提供。 */
export interface OhlcGeometryInput {
  readonly openY: number
  readonly highY: number
  readonly lowY: number
  readonly closeY: number
  readonly center: number
  readonly widthPx: number
  readonly dpr: number
  readonly zoomLevel: number
  readonly shape: 'candlestick' | 'hollow-candlestick' | 'ohlc-bar'
  readonly separateBorder: boolean
}
