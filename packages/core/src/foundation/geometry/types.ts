/**
 * geometry 模块对外契约：与业务无关的二维几何值类型。
 *
 * 只描述坐标点与轴对齐矩形等值语义；命中优先级、对象选择等业务规则由调用方持有。
 * 本文件不得 import 同模块 impl/。
 */

/** 二维坐标点（px）。 */
export interface Point {
  x: number
  y: number
}

/** 轴对齐矩形（px）：left/top 为左上角，right/bottom 为右下角。 */
export interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}
