/**
 * Chart 集成测试夹具：默认选项、图表挂载、三窗格布局、指针事件与共用钩子。
 * 每次挂载都会创建独立的定义注册表与 runtime，用例通过返回值持有它们。
 */
import { afterEach, beforeEach, vi } from 'vitest'
import { Chart, type ChartOptions } from '@/core/chart/index'
import { MarketDataContext } from '@/data/management/context'
import { createTestDefinitions } from '@/core/indicators/__tests__/helpers/definitionsTestKit'
import { testProviderRegistry } from '@/engine/data/__tests__/helpers/chartDataManagerTestKit'
import { MAIN_PANE_ID } from '@/core/pane/types'
import { createCalculationHub } from '@/engine/calculation/index'
import { toCalculationDefinition } from '@/engine/indicators/instances/assembly/toCalculationDefinition'
import type { DefinitionRegistry } from '@/engine/indicators/registry/index'
import { MarketSessionRegistry } from '@/foundation/config/marketSession/marketSessionRegistry'
import { systemClock } from '@/foundation/utils/clock'
import { createMarketDataService } from '@/data/service/index'
import { createChartDom, installChartDomStubs } from './chartDomTestKit'

/** Chart 构造函数的 runtime 参数。 */
type ChartRuntime = ConstructorParameters<typeof Chart>[2]

/**
 * 创建测试 Chart runtime。
 *
 * @param overrides 用例显式覆盖的依赖；未覆盖时每次创建独立注册表与行情宿主。
 * @returns 完整 runtime
 */
export function createTestChartRuntime(overrides: Partial<ChartRuntime> = {}): ChartRuntime {
  const definitions = overrides.definitions ?? createTestDefinitions()
  const marketSessionRegistry = overrides.marketSessionRegistry ?? new MarketSessionRegistry()
  const marketDataContext = overrides.marketDataContext ?? new MarketDataContext(testProviderRegistry)
  const data =
    overrides.data ??
    createMarketDataService({
      registry: marketDataContext.registry,
      stream: marketDataContext.stream,
      marketSessions: marketSessionRegistry,
      clock: systemClock,
    })
  return {
    calculationHub: createCalculationHub({
      resolveDefinition: (definitionId) => {
        const metadata = definitions.getDefinition(definitionId)
        return metadata === undefined ? undefined : toCalculationDefinition(metadata)
      },
    }),
    marketSessionRegistry,
    marketDataContext,
    data,
    definitions,
    ...overrides,
  }
}

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

/** 挂载参数：尺寸与 runtime 覆盖项平铺。 */
export interface MountChartOptions extends Partial<ChartRuntime> {
  readonly width?: number
  readonly height?: number
}

/** 挂载结果：用例通过 definitions 注册本次需要的指标。 */
export interface MountedChart {
  readonly chart: Chart
  readonly definitions: DefinitionRegistry
}

/**
 * 创建不选择行情的图表；这些用例只验证独立于行情的职责。
 *
 * @param options 尺寸与 runtime 覆盖项
 * @returns 图表与本次挂载使用的定义注册表
 */
export function mountChart(options: MountChartOptions = {}): MountedChart {
  const { width = 1000, height = 600, ...runtimeOverrides } = options
  const runtime = createTestChartRuntime(runtimeOverrides)
  return {
    chart: new Chart(createChartDom(width, height), defaultOptions, runtime),
    definitions: runtime.definitions,
  }
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

/** 注册 Chart 集成用例共用的钩子：DOM 替身与 mock 清理。 */
export function installChartTestHooks(): void {
  let restore: (() => void) | null = null
  beforeEach(() => {
    restore = installChartDomStubs()
  })
  afterEach(() => {
    restore?.()
    restore = null
    vi.restoreAllMocks()
  })
}
