/**
 * Plot 尺寸解析：把公共的 ShapeSize 档位换算成各类型的像素尺寸。
 *
 * 契约层只传枚举，这里是不做像素换算的唯一位置；`auto` 表示该类型原有的基准尺寸，
 * 因此未声明 size 的既有指标保持原样。需要调整某类型的档位时只改本文件。
 */

import { ShapeSize } from '@363045841yyt/klinechart-plot-contracts'

/** 一个尺寸档位到逻辑像素的映射表。 */
type SizeScale = Readonly<Record<ShapeSize, number>>

/** 折线描边宽度（px）。 */
const LINE_WIDTH: SizeScale = {
  auto: 1,
  tiny: 1,
  small: 1,
  normal: 2,
  large: 3,
  huge: 4,
}

/** 散点直径（px）。 */
const POINT_DIAMETER: SizeScale = {
  auto: 3,
  tiny: 6,
  small: 10,
  normal: 14,
  large: 20,
  huge: 28,
}

/** 形状与字符标记的外框边长（px）。 */
const MARKER_BOX: SizeScale = {
  auto: 12,
  tiny: 6,
  small: 10,
  normal: 14,
  large: 20,
  huge: 28,
}

/** 箭头最大屏幕高度（px）。 */
const ARROW_HEIGHT: SizeScale = {
  auto: 50,
  tiny: 20,
  small: 30,
  normal: 40,
  large: 60,
  huge: 90,
}

/** 柱状图固定柱宽（逻辑像素）；auto/tiny/small 都是最小可见宽度。 */
const HISTOGRAM_WIDTH: SizeScale = {
  auto: 1,
  tiny: 1,
  small: 1,
  normal: 2,
  large: 3,
  huge: 4,
}

/** 箭头最短高度相对最长高度的比例，保持幅度映射的可见下限。 */
const ARROW_MIN_RATIO = 0.1

/** 折线描边宽度。 */
export function lineWidth(size: ShapeSize): number {
  return LINE_WIDTH[size]
}

/** 散点半径（取直径的一半）。 */
export function pointRadius(size: ShapeSize): number {
  return POINT_DIAMETER[size] / 2
}

/** 形状与字符标记的外框边长。 */
export function markerBoxSize(size: ShapeSize): number {
  return MARKER_BOX[size]
}

/** 箭头最大高度。 */
export function arrowMaxHeight(size: ShapeSize): number {
  return ARROW_HEIGHT[size]
}

/** 箭头最短高度。 */
export function arrowMinHeight(size: ShapeSize): number {
  return ARROW_HEIGHT[size] * ARROW_MIN_RATIO
}

/** 柱状图柱宽（逻辑像素）：数值直接取像素，档位查表；不随 K 线间距缩放。 */
export function histogramWidth(size: ShapeSize | number): number {
  return typeof size === 'number' ? size : HISTOGRAM_WIDTH[size]
}
