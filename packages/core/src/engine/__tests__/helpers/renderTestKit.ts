/**
 * 渲染相关测试共享夹具：Canvas2D stub、PaneInfo、PluginHost 与 RenderContext 工厂。
 * 仅供 __tests__ 消费；vitest 只收集 *.test.ts，本文件不会被当作测试。
 *
 * 约束：项目自有类型（PluginHost / PaneInfo / RenderContext）用 satisfies 全量约束，
 * 成员缺失在编译期暴露；DOM CanvasRenderingContext2D 无法完整实现，
 * 只在 createMockCanvasContext 内保留唯一一处集中强转。
 */
import { vi } from 'vitest'
import { createAxisLabelsFrame } from '@/engine/axisLabels/index'
import {
  INDICATOR_INSTANCE_CATALOG_SERVICE,
  type IndicatorInstanceCatalog,
  type IndicatorInstanceDescriptor,
} from '@/engine/indicators/instances/api/indicatorRenderBinding'
import { getPhysicalKLineConfig } from '@/engine/utils/klineConfig'
import { ChartDataViewId } from '@/foundation/types/chartView'
import { createDisplayTimeFormatter } from '@/foundation/utils/dateFormat'
import type { IndicatorRenderStateReader, PaneInfo, PluginHost, RenderContext } from '@/plugin'
import type { KLineData } from '@/types/price'

/** 默认 K 线根数，覆盖指标预热窗口。 */
export const DEFAULT_BAR_COUNT = 100

/** 构造递增的默认 K 线序列，时间基准与渲染器用例保持一致。 */
export function createKLineData(length = DEFAULT_BAR_COUNT): KLineData[] {
  return Array.from({ length }, (_, i) => ({
    timestamp: 1_000_000_000_000 + i * 60_000,
    open: 100 + i,
    high: 101 + i,
    low: 99 + i,
    close: 100 + i,
    volume: 1000 + i * 100,
  }))
}

/** 共享 Canvas2D stub：额外暴露 stroke 观测记录，便于绘制断言。 */
export interface MockCanvasContext extends CanvasRenderingContext2D {
  /** 每次 stroke() 触发时的 lineWidth 快照。 */
  strokeLineWidths: number[]
  /** 每次 stroke() 触发时的路径点快照（深拷贝）。 */
  strokedPaths: Array<Array<{ x: number; y: number }>>
  /** stroke() 时已设置非空 lineDash 的路径点快照（深拷贝）。 */
  dashedPaths: Array<Array<{ x: number; y: number }>>
}

/**
 * 构造绘制路径可观测的 Canvas2D stub。
 * 所有绘图方法均为 vi.fn；stroke 会记录 lineWidth 与路径，供绘制序列断言。
 */
export function createMockCanvasContext(): MockCanvasContext {
  let path: Array<{ x: number; y: number }> = []
  let lineDash: number[] = []
  const strokeLineWidths: number[] = []
  const strokedPaths: Array<Array<{ x: number; y: number }>> = []
  const dashedPaths: Array<Array<{ x: number; y: number }>> = []
  const snapshot = () => path.map((point) => ({ ...point }))

  const ctx = {
    // 部分渲染器通过 ctx.canvas.width 读取画布尺寸，这里给出最小可用画布描述。
    canvas: { width: 800, height: 600 },
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    rotate: vi.fn(),
    setTransform: vi.fn(),
    resetTransform: vi.fn(),
    transform: vi.fn(),
    beginPath: vi.fn(() => {
      path = []
    }),
    closePath: vi.fn(),
    moveTo: vi.fn((x: number, y: number) => path.push({ x, y })),
    lineTo: vi.fn((x: number, y: number) => path.push({ x, y })),
    bezierCurveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    arc: vi.fn(),
    arcTo: vi.fn(),
    rect: vi.fn(),
    roundRect: vi.fn(),
    stroke: vi.fn(function (this: { lineWidth: number }) {
      strokeLineWidths.push(this.lineWidth)
      strokedPaths.push(snapshot())
      if (lineDash.length > 0) dashedPaths.push(snapshot())
    }),
    fill: vi.fn(),
    clip: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    clearRect: vi.fn(),
    fillText: vi.fn(),
    strokeText: vi.fn(),
    measureText: vi.fn(() => ({ width: 50 })),
    setLineDash: vi.fn((dash: number[]) => {
      lineDash = dash
    }),
    getLineDash: vi.fn(() => lineDash),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    createPattern: vi.fn(() => null),
    drawImage: vi.fn(),
    getImageData: vi.fn(),
    putImageData: vi.fn(),
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 1,
    lineDashOffset: 0,
    lineJoin: 'miter',
    lineCap: 'butt',
    miterLimit: 10,
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    direction: 'inherit',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    shadowBlur: 0,
    shadowColor: '',
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    filter: 'none',
    imageSmoothingEnabled: true,
    strokeLineWidths,
    strokedPaths,
    dashedPaths,
  }

  return ctx as unknown as MockCanvasContext
}

/** 默认 PaneInfo 能力开关（price 角色）。 */
const DEFAULT_PANE_CAPABILITIES: PaneInfo['capabilities'] = {
  showPriceAxisTicks: true,
  showCrosshairPriceLabel: true,
  candleHitTest: true,
  supportsPriceTranslate: true,
}

/** 默认 PaneInfo Y 轴，价格与像素按 10:1 线性映射。 */
const DEFAULT_PANE_Y_AXIS: PaneInfo['yAxis'] = {
  priceToY: (price) => price * 10,
  yToPrice: (y) => y / 10,
  getPaddingTop: () => 0,
  getPaddingBottom: () => 0,
  getPriceOffset: () => 0,
  getDisplayRange: () => ({ minPrice: 0, maxPrice: 200 }),
  getScaleType: () => 'linear',
  getBasePrice: () => null,
  toPercent: (price) => price,
  fromPercent: (pct) => pct,
  getDisplayPercentRange: () => ({ minPct: 0, maxPct: 100 }),
}

/** PaneInfo 夹具入参：yAxis 只声明差异项。 */
export interface MockPaneInfoOverrides extends Partial<Omit<PaneInfo, 'yAxis'>> {
  yAxis?: Partial<PaneInfo['yAxis']>
}

/** 构造完整 PaneInfo，只覆盖调用方声明的字段。 */
export function createMockPaneInfo(overrides: MockPaneInfoOverrides = {}): PaneInfo {
  const { yAxis, ...rest } = overrides
  return {
    id: 'main',
    role: 'price',
    capabilities: { ...DEFAULT_PANE_CAPABILITIES },
    top: 0,
    height: 200,
    priceRange: { minPrice: 0, maxPrice: 200 },
    ...rest,
    yAxis: { ...DEFAULT_PANE_Y_AXIS, ...yAxis },
  } satisfies PaneInfo
}

/** RenderContext 夹具入参：pane 允许只声明差异项。 */
export interface MockRenderContextOverrides extends Partial<Omit<RenderContext, 'pane'>> {
  pane?: MockPaneInfoOverrides
}

/** 构造完整 RenderContext，只覆盖调用方声明的字段。 */
export function createMockRenderContext(overrides: MockRenderContextOverrides = {}): RenderContext {
  const { pane, ...rest } = overrides
  const data = rest.data ?? createKLineData()
  const count = data.length
  // 帧级物理宽度与帧准备阶段同源，避免夹具硬编码出与 kWidth/dpr 组合不一致的值。
  const kWidth = rest.kWidth ?? 6
  const kGap = rest.kGap ?? 2
  const dpr = rest.dpr ?? 1
  const { kWidthPx } = getPhysicalKLineConfig(kWidth, kGap, dpr)
  const defaults = {
    ctx: createMockCanvasContext(),
    data,
    period: 'daily',
    dataView: ChartDataViewId.KLine,
    getLogicalIndexAtTimestamp: (timestamp: number) => {
      const index = data.findIndex((item) => item.timestamp === timestamp)
      return index >= 0 ? index : null
    },
    pane: createMockPaneInfo(pane),
    range: { start: 0, end: count },
    scrollLeft: 0,
    kWidth,
    kGap,
    dpr,
    kWidthPx,
    paneWidth: 800,
    kLinePositions: data.map((_, i) => i * 8),
    kLineCenters: data.map((_, i) => i * 8 + 4),
    kBarRects: data.map((_, i) => ({ x: i * 8, width: 6 })),
    viewport: { scrollLeft: 0, plotWidth: 800, plotHeight: 200 },
    yAxisRanges: [],
    xAxisRanges: [],
    axisLabels: createAxisLabelsFrame(),
    displayTimeFormatter: createDisplayTimeFormatter('UTC'),
    theme: 'light',
  } satisfies RenderContext
  return {
    ...defaults,
    ...rest,
  }
}

/** 构造完整 PluginHost，只覆盖调用方声明的字段；共享状态默认由内存 Map 承载。 */
export function createMockPluginHost(overrides: Partial<PluginHost> = {}): PluginHost {
  const sharedState = new Map<string, unknown>()
  return {
    events: {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
      once: vi.fn(),
    },
    hooks: {
      tap: vi.fn(),
      untap: vi.fn(),
      call: vi.fn(async () => []),
      callSync: vi.fn(() => []),
    },
    getConfig: vi.fn(),
    setConfig: vi.fn(),
    getPlugin: vi.fn(),
    log: vi.fn(),
    setSharedState: vi.fn((namespace: string, state: unknown) => {
      sharedState.set(namespace, state)
    }),
    // biome-ignore lint/suspicious/noExplicitAny: 见 setSharedState
    getSharedState: vi.fn((namespace: string): any => sharedState.get(namespace)),
    clearSharedState: vi.fn((namespace: string) => {
      sharedState.delete(namespace)
    }),
    registerStateOwner: vi.fn(),
    clearByOwner: vi.fn(),
    registerService: vi.fn(),
    getService: vi.fn(() => undefined),
    ...overrides,
  } satisfies PluginHost
}

/** 构造只按 instanceId 命中返回的帧状态读取 stub。 */
export function createMockStateReader(
  instanceId: string,
  state?: unknown,
): IndicatorRenderStateReader {
  // biome-ignore lint/suspicious/noExplicitAny: vitest 无法把泛型 spy 赋给泛型方法，any 返回可保持可间谍性
  const get = vi.fn((key: string): any => (key === instanceId ? state : undefined))
  return { get } satisfies IndicatorRenderStateReader
}

/** 构造按名解析注册服务的 PluginHost stub。 */
export function createMockServiceHost(services: Record<string, unknown>): PluginHost {
  return createMockPluginHost({
    // biome-ignore lint/suspicious/noExplicitAny: 见 createMockStateReader，泛型 getService 需要 any 返回
    getService: vi.fn((name: string): any => services[name]),
  })
}

/** 构造只提供主图实例清单服务的 PluginHost，图例等消费者据此枚举实例。 */
export function createMockIndicatorInstanceHost(
  mainInstances: ReadonlyArray<IndicatorInstanceDescriptor>,
): PluginHost {
  const catalog: IndicatorInstanceCatalog = {
    listMainInstances: () => mainInstances,
    listPaneInstances: () => [],
  }
  return createMockServiceHost({ [INDICATOR_INSTANCE_CATALOG_SERVICE]: catalog })
}
