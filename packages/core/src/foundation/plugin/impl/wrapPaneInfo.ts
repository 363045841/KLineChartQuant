/**
 * PaneInfo 只读包装实现
 */

import type { PaneCapabilities, PaneInfo, PaneRole } from '../types.js'

/**
 * 创建 PaneInfo 的只读包装
 *
 * 设计决策：
 * - 使用 Readonly<T> 类型标注而非 Object.freeze，避免热路径上的运行时开销
 * - yAxis 方法通过闭包包装，隔离原始函数引用
 * - 依赖团队代码规范约束插件行为，而非运行时强制
 */
export function wrapPaneInfo(pane: {
  id: string
  role: PaneRole
  capabilities: PaneCapabilities
  top: number
  height: number
  yAxis: PaneInfo['yAxis']
  priceRange: PaneInfo['priceRange']
}): Readonly<PaneInfo> {
  return {
    id: pane.id,
    role: pane.role,
    capabilities: { ...pane.capabilities },
    top: pane.top,
    height: pane.height,
    yAxis: {
      priceToY: (price) => pane.yAxis.priceToY(price),
      yToPrice: (y) => pane.yAxis.yToPrice(y),
      getPaddingTop: () => pane.yAxis.getPaddingTop(),
      getPaddingBottom: () => pane.yAxis.getPaddingBottom(),
      getPriceOffset: () => pane.yAxis.getPriceOffset(),
      getDisplayRange: (baseRange) => pane.yAxis.getDisplayRange(baseRange),
      getScaleType: () => pane.yAxis.getScaleType(),
      getBasePrice: () => pane.yAxis.getBasePrice(),
      toPercent: (price) => pane.yAxis.toPercent(price),
      fromPercent: (pct) => pane.yAxis.fromPercent(pct),
      getDisplayPercentRange: () => pane.yAxis.getDisplayPercentRange(),
    },
    priceRange: pane.priceRange,
  }
}
