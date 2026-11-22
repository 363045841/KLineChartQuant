/**
 * Chart 集成测试夹具：默认选项、图表挂载、三窗格布局、指针事件与共用钩子。
 * 仅供 engine/__tests__ 下的 *.test.ts 消费。
 */
import { afterEach, beforeAll, beforeEach, vi } from 'vitest'
import { Chart, type ChartOptions } from '@/core/chart/index'
import { loadBuiltinIndicators } from '@/core/indicators/registerBuiltins'
import { MAIN_PANE_ID } from '@/core/pane/types'
import { createChartDom, installChartDomStubs } from './chartDomTestKit'

/** 不含行情选择时的图表选项；用例只验证独立于行情的职责。 */
export const defaultOptions: ChartOptions = {
  yPaddingPx: 0,
  rightAxisWidth: 0,
  leftAxisWidth: 0,
  bottomAxisHeight: 24,
  minKWidth: 2,
  maxKWidth: 50,
  panes: [{ id: 'main', ratio: 1 }],
  priceLabelWidth: 60,
}

/** 创建不选择行情的图表；这些用例只验证独立于行情的职责。 */
export function mountChart(
  width = 1000,
  height = 600,
  runtime?: ConstructorParameters<typeof Chart>[2],
): Chart {
  return new Chart(createChartDom(width, height), defaultOptions, runtime)
}

/** 三窗格布局供比例、命中、拖拽和批量顺序回归共用。 */
export function importPaneFixture(chart: Chart): void {
  chart.panes.importLayout([
    { id: MAIN_PANE_ID, ratio: 0.5, visible: true, minHeightPx: 40 },
    { id: 'layout-a', ratio: 0.25, visible: true, minHeightPx: 40 },
    { id: 'layout-b', ratio: 0.25, visible: true, minHeightPx: 40 },
  ])
}

/** 通过真实 DOM 事件提供完整的 PointerEvent 结构。 */
export function pointerEvent(
  type: string,
  target: HTMLElement,
  overrides: PointerEventInit = {},
): PointerEvent {
  const event = new PointerEvent(type, {
    clientX: 100,
    clientY: 40,
    isPrimary: true,
    pointerType: 'touch',
    pointerId: 1,
    ...overrides,
  })
  Object.defineProperty(event, 'target', { value: target })
  return event
}

/** 注册 Chart 集成用例共用的钩子：内置指标、DOM 替身与 mock 清理。 */
export function installChartTestHooks(): void {
  let restore: (() => void) | null = null
  beforeAll(loadBuiltinIndicators)
  beforeEach(() => {
    restore = installChartDomStubs()
  })
  afterEach(() => {
    restore?.()
    restore = null
    vi.restoreAllMocks()
  })
}
