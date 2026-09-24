/** 轴标签管理模块实现：单帧标签收集器与按表面聚合的帧工厂。 */

import type {
  AxisLabel,
  AxisLabelCollector,
  AxisLabelSurface,
  AxisLabelsFrame,
} from '@/foundation/plugin/types.js'

/** 构造内部可变数组 + register/registerAll 的通用收集器核心。 */
function createLabelCollector(): AxisLabelCollector {
  const labels: AxisLabel[] = []
  return {
    labels,
    register(label: AxisLabel): void {
      labels.push(label)
    },
    registerAll(next: ReadonlyArray<AxisLabel>): void {
      if (next.length === 0) return
      labels.push(...next)
    },
  }
}

/** X 表面跨 Pane 共享，忽略 paneId；其余表面按 paneId 隔离。 */
function isSharedSurface(surface: AxisLabelSurface): boolean {
  return surface === 'xTicks' || surface === 'xCrosshair' || surface === 'xLabels'
}

/**
 * 创建单帧轴标签聚合：按表面惰性创建收集器。
 *
 * X 表面调用时忽略 paneId，跨 Pane 共享同一实例；Y 表面以 paneId 隔离。
 *
 * @returns 当前帧的轴标签聚合，帧内累积、帧后释放
 */
export function createAxisLabelsFrame(): AxisLabelsFrame {
  const bySurface = new Map<string, AxisLabelCollector>()
  return {
    forSurface(surface: AxisLabelSurface, paneId?: string): AxisLabelCollector {
      const key = isSharedSurface(surface) ? surface : `${surface}\n${paneId ?? ''}`
      const existing = bySurface.get(key)
      if (existing) return existing
      const collector = createLabelCollector()
      bySurface.set(key, collector)
      return collector
    },
  }
}
