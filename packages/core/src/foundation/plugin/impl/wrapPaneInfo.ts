/**
 * PaneInfo 只读包装实现
 *
 * 设计决策：
 * - 使用 Readonly<T> 类型标注而非 Object.freeze，避免热路径上的运行时开销
 * - yAxis 方法通过闭包包装，隔离原始函数引用
 * - axes 由框架派生，插件只读
 */

import { GENERIC_ERROR_CODES, KLineChartError } from '@/errors.js'
import type { PaneCapabilities, PaneInfo } from '../types.js'

type AxisLike = PaneInfo['yAxis']

/** 把一条轴包装成只读视图。 */
function wrapAxis(axis: AxisLike): PaneInfo['yAxis'] {
  return {
    priceToY: (price) => axis.priceToY(price),
    yToPrice: (y) => axis.yToPrice(y),
    getContentTop: () => axis.getContentTop(),
    getContentBottom: () => axis.getContentBottom(),
    getContentHeight: () => axis.getContentHeight(),
    getDisplayRange: (baseRange) => axis.getDisplayRange(baseRange),
    getScaleType: () => axis.getScaleType(),
    getBasePrice: () => axis.getBasePrice(),
    toPercent: (price) => axis.toPercent(price),
    fromPercent: (pct) => axis.fromPercent(pct),
    getDisplayPercentRange: () => axis.getDisplayPercentRange(),
  }
}

export function wrapPaneInfo(pane: {
  id: string
  capabilities: PaneCapabilities
  top: number
  height: number
  yAxis: AxisLike
  axes: ReadonlyArray<{ readonly axisId: string; readonly yAxis: AxisLike }>
  priceRange: PaneInfo['priceRange']
}): Readonly<PaneInfo> {
  const axes = pane.axes.map((axis) => ({
    axisId: axis.axisId,
    yAxis: wrapAxis(axis.yAxis),
  }))
  const byId = new Map(axes.map((axis) => [axis.axisId, axis.yAxis]))
  return {
    id: pane.id,
    capabilities: { ...pane.capabilities },
    top: pane.top,
    height: pane.height,
    get yAxis() {
      return wrapAxis(pane.yAxis)
    },
    axes,
    axis: (axisId) => {
      const axis = byId.get(axisId)
      if (!axis)
        throw new KLineChartError(
          GENERIC_ERROR_CODES.NOT_REGISTERED,
          `Pane ${pane.id} 中不存在轴 ${axisId}`,
        )
      return axis
    },
    get priceRange() {
      return pane.priceRange
    },
  }
}
