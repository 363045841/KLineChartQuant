/** 轴标签管理模块实现：单帧标签收集器与按 Pane 隔离的帧级聚合工厂。 */

import type { XAxisLabel, YAxisLabel } from '@/foundation/plugin/types.js'
import type { AxisLabelsFrame, XAxisLabelCollector, YAxisLabelCollector } from '../types.js'

/** 构造内部可变数组 + register/registerAll 的通用收集器核心。 */
function createLabelCollector<T>(): {
  labels: T[]
  register(label: T): void
  registerAll(labels: ReadonlyArray<T>): void
} {
  const labels: T[] = []
  return {
    labels,
    register(label: T): void {
      labels.push(label)
    },
    registerAll(next: ReadonlyArray<T>): void {
      if (next.length === 0) return
      labels.push(...next)
    },
  }
}

/** 创建单个 Pane 的 Y 轴标签收集器（pane 隔离）。 */
export function createYAxisLabelCollector(): YAxisLabelCollector {
  return createLabelCollector<YAxisLabel>()
}

/** 创建所有 Pane 共享的 X 轴标签收集器。 */
export function createXAxisLabelCollector(): XAxisLabelCollector {
  return createLabelCollector<XAxisLabel>()
}

/**
 * 创建单帧轴标签聚合：X 轴一份共享收集器，Y 轴按 paneId 惰性创建。
 *
 * @returns 当前帧的轴标签聚合，帧内累积、帧后释放
 */
export function createAxisLabelsFrame(): AxisLabelsFrame {
  const yAxisByPane = new Map<string, YAxisLabelCollector>()
  return {
    x: createXAxisLabelCollector(),
    yForPane(paneId: string): YAxisLabelCollector {
      const existing = yAxisByPane.get(paneId)
      if (existing) return existing
      const collector = createYAxisLabelCollector()
      yAxisByPane.set(paneId, collector)
      return collector
    },
  }
}
