/**
 * 绘图测试共享夹具：图元 / 绘图适配器 port 工厂、坐标与指针事件常量。
 * 仅供 __tests__ 下的绘图用例消费；vitest include 只收集 *.test.ts，本文件不会被当作测试。
 *
 * 约束：绘图适配器 port 属于项目自有类型，工厂用 satisfies 全量约束；
 * 测试只覆盖差异字段，成员缺失在编译期暴露，不再用 as 强转补齐。
 */
import { vi } from 'vitest'

import type {
  CreateDrawingInput,
  DrawingChartAdapter,
  DrawingDocumentPort,
  DrawingSessionPort,
  DrawingViewportPort,
  PaneLayoutInfo,
} from '../../../../controllers/types'
import type { DrawingObject } from '../../../../foundation/plugin'
import type { KLineData } from '../../../../foundation/types/price'
import type { HitResult } from '../../HitTester'
import type { DrawingToolId } from '../../toolConfig'

/** 测试图元默认描边色。 */
export const TEST_STROKE = '#2962ff'

/** 构造最小绘图图元，只声明用例关心的字段差异。 */
export function createDrawingObject(
  overrides: Partial<DrawingObject> & Pick<DrawingObject, 'id'>,
): DrawingObject {
  return {
    kind: 'horizontal-line',
    paneId: 'main',
    visible: true,
    anchors: [],
    params: {},
    style: { stroke: TEST_STROKE },
    ...overrides,
  } satisfies DrawingObject
}

/** 构造最小趋势线图元（工作副本 / 帧投影用例共用）。 */
export function createTrendLine(id: string, overrides: Partial<DrawingObject> = {}): DrawingObject {
  return createDrawingObject({ id, kind: 'trend-line', ...overrides })
}

/** 四 Bar 时间轴用例共用的时间戳。 */
export const FOUR_BAR_TIMESTAMPS = [500, 1_000, 1_500, 2_000]

/**
 * 构造四 Bar 时间轴 adapter。
 * 坐标约定：索引 i → x = i*10+5，价格 → y = 200 - price；overrides 覆盖价格轴等差异。
 */
export function createFourBarTimelineAdapter(
  overrides: Partial<DrawingViewportPort> = {},
): DrawingChartAdapter {
  return createDrawingAdapter({
    viewport: {
      getDrawingData: () => FOUR_BAR_TIMESTAMPS.map((timestamp) => ({ timestamp })),
      getDrawingTimestampAtLogicalIndex: (index) => FOUR_BAR_TIMESTAMPS[index] ?? null,
      getLogicalIndexAtTimestamp: (timestamp) => {
        const index = FOUR_BAR_TIMESTAMPS.indexOf(timestamp)
        return index >= 0 ? index : null
      },
      ...overrides,
    },
  })
}

/** 构造平滑顶底图元：0/1 为斜线两端，2/3 为水平线两端。 */
export function createFlatLineDrawing(overrides: Partial<DrawingObject> = {}): DrawingObject {
  return createDrawingObject({
    id: 'flat',
    kind: 'flat-line',
    anchors: [
      { id: 'a', type: 'point', time: 500, price: 100 },
      { id: 'b', type: 'point', time: 1_000, price: 140 },
      { id: 'h1', type: 'point', time: 500, price: 60 },
      { id: 'h2', type: 'point', time: 1_000, price: 60 },
    ],
    style: {},
    ...overrides,
  })
}

/** 构造不相交通道图元：0/1 为第一条线，2/3 为第二条线（同 X 反向配对）。 */
export function createDisjointChannelDrawing(
  overrides: Partial<DrawingObject> = {},
): DrawingObject {
  return createDrawingObject({
    id: 'disjoint',
    kind: 'disjoint-channel',
    anchors: [
      { id: 'p0', type: 'point', time: 500, price: 100 },
      { id: 'p1', type: 'point', time: 1_000, price: 140 },
      { id: 'p2', type: 'point', time: 1_000, price: 20 },
      { id: 'p3', type: 'point', time: 500, price: 60 },
    ],
    style: {},
    ...overrides,
  })
}

/** 构造平行通道图元：0/1 为第一条线，2/3 为第二条线。 */
export function createParallelChannelDrawing(
  overrides: Partial<DrawingObject> = {},
): DrawingObject {
  return createDrawingObject({
    id: 'channel',
    kind: 'parallel-channel',
    anchors: [
      { id: 'a', type: 'point', time: 500, price: 100 },
      { id: 'b', type: 'point', time: 1_000, price: 140 },
      { id: 'c', type: 'point', time: 500, price: 60 },
      { id: 'd', type: 'point', time: 1_000, price: 100 },
    ],
    style: {},
    ...overrides,
  })
}

/** 命中 / 拖拽测试所需的最小容器，局部坐标原点在左上角。 */
export const CONTAINER = {
  getBoundingClientRect: () => ({ left: 0, top: 0 }),
} as HTMLElement

/** 指针事件的坐标与修饰键。 */
export interface PointerInput {
  clientX: number
  clientY: number
  ctrlKey?: boolean
  shiftKey?: boolean
  metaKey?: boolean
}

/** 构造指针事件，未指定的修饰键默认 false。 */
export function createPointerEvent(input: PointerInput): PointerEvent {
  return {
    clientX: input.clientX,
    clientY: input.clientY,
    ctrlKey: input.ctrlKey ?? false,
    shiftKey: input.shiftKey ?? false,
    metaKey: input.metaKey ?? false,
  } as PointerEvent
}

/** 构造 pointerdown 指针事件。 */
export function pointerDown(
  x: number,
  y: number,
  modifiers: Omit<PointerInput, 'clientX' | 'clientY'> = {},
): PointerEvent {
  return createPointerEvent({ clientX: x, clientY: y, ...modifiers })
}

/** 构造 pointermove / pointerup 指针事件。 */
export function pointerMove(
  x: number,
  y: number,
  modifiers: Omit<PointerInput, 'clientX' | 'clientY'> = {},
): PointerEvent {
  return createPointerEvent({ clientX: x, clientY: y, ...modifiers })
}

// ---- 绘图控制器私有协作者替身 ----

/** 绘图控制器用例可替换的私有协作者：命中器与拖拽处理器。 */
export interface DrawingControllerInternals {
  hitTester: {
    hitTest: ReturnType<typeof vi.fn>
    getDrawingLineSegments: ReturnType<typeof vi.fn>
  }
  dragHandler: {
    isDragging: ReturnType<typeof vi.fn>
    getDraggingDrawingIds: ReturnType<typeof vi.fn>
    startDrag: ReturnType<typeof vi.fn>
    handleDragMove: ReturnType<typeof vi.fn>
    endDrag: ReturnType<typeof vi.fn>
  }
}

/** 拖拽处理器替身的返回值差异；只覆盖用例关心的部分。 */
export interface DragHandlerStubOptions {
  /** 命中器命中结果；null 表示空白处。 */
  hit: HitResult | null
  /** 正在拖拽的图元 id；`isDragging` 由此推导。 */
  draggingIds?: ReadonlyArray<string>
  /** 拖拽移动后的图元快照；缺省按原 id 返回同一图元。 */
  movedDrawings?: ReadonlyArray<DrawingObject>
  /** 覆盖 startDrag；用于断言入参。 */
  startDrag?: ReturnType<typeof vi.fn>
}

/**
 * 替换 DrawingInteractionController 的私有协作者（命中器 / 拖拽处理器）。
 * 命中器可选暴露 getDrawingLineSegments，供框选用例注入线段。
 */
export function stubDrawingControllerInternals(
  controller: object,
  options: DragHandlerStubOptions,
): DrawingControllerInternals {
  const startDrag = options.startDrag ?? vi.fn()
  const draggingIds = options.draggingIds ?? []
  const movedDrawings = options.movedDrawings ?? []
  const internals = controller as unknown as DrawingControllerInternals
  internals.hitTester = {
    hitTest: vi.fn(() => options.hit),
    getDrawingLineSegments: vi.fn(() => []),
  }
  internals.dragHandler = {
    isDragging: vi.fn(() => draggingIds.length > 0),
    getDraggingDrawingIds: vi.fn(() => draggingIds),
    startDrag,
    handleDragMove: vi.fn(() => movedDrawings),
    endDrag: vi.fn(),
  }
  return internals
}

// ---- 磁吸坐标系夹具 ----
// Bar i 占 [i*10, i*10+10)，中心 x=i*10+5；价格↔Y 线性映射 y = 200 - price。
// 索引 1 为目标 Bar：open=100 high=120 low=80 close=110（屏幕 y：high=80 low=120 open=100 close=90）。

/** 三根 K 线数据；相邻 Bar 取远离目标的价格避免歧义。 */
export const OHLC_BARS = [
  { timestamp: 500, open: 50, high: 60, low: 40, close: 55 },
  { timestamp: 1000, open: 100, high: 120, low: 80, close: 110 },
  { timestamp: 1500, open: 200, high: 220, low: 180, close: 210 },
]

/** OHLC_BARS 对应的 Bar 时间戳。 */
export const BAR_TIMESTAMPS = [500, 1000, 1500]

/** 磁吸夹具的价格→Y 映射。 */
export const priceToY = (_paneId: string, price: number) => 200 - price

/** 磁吸夹具的 Y→价格映射。 */
export const yToPrice = (_paneId: string, y: number) => 200 - y

/**
 * 构造完整的绘图文档 port。
 * 选择集合与工具状态默认由内存变量承载，可被子用例通过 overrides 覆盖。
 */
export function createDrawingDocumentPort(
  drawings: ReadonlyArray<DrawingObject> = [],
  overrides: Partial<DrawingDocumentPort> = {},
): DrawingDocumentPort {
  let selectedIds: ReadonlyArray<string> = []
  let toolId: DrawingToolId = 'cursor'
  return {
    replaceDrawings: vi.fn(),
    getFullDrawings: () => drawings,
    createDrawing: vi.fn(() => createDrawingObject({ id: 'created' })),
    updateDrawing: vi.fn(() => null),
    commitDrawingDrag: vi.fn(() => null),
    commitDrawingDrags: vi.fn(() => []),
    updateBatch: vi.fn(() => []),
    getBatchStyleKeys: vi.fn(() => []),
    removeDrawing: vi.fn(() => false),
    removeBatch: vi.fn(() => false),
    clearDrawings: vi.fn(),
    setSelectedDrawingIds: vi.fn((ids: ReadonlyArray<string>) => {
      selectedIds = [...ids]
    }),
    getSelectedDrawingIds: () => selectedIds,
    setDrawingToolId: vi.fn((next: DrawingToolId) => {
      toolId = next
    }),
    getDrawingToolId: () => toolId,
    ...overrides,
  } satisfies DrawingDocumentPort
}

/**
 * 构造完整的绘图视口 port。
 * 默认坐标以 OHLC_BARS 为准：Bar 中心 x=i*10+5，价格↔Y 线性映射 y=200-price。
 */
export function createDrawingViewportPort(
  overrides: Partial<DrawingViewportPort> = {},
): DrawingViewportPort {
  return {
    getViewport: () => ({ scrollLeft: 0, plotWidth: 300, plotHeight: 240 }),
    getKWidthKGap: () => ({ kWidth: 8, kGap: 2 }),
    getCurrentDpr: () => 1,
    getData: () => OHLC_BARS,
    getDrawingData: () => OHLC_BARS,
    getLogicalIndexAtX: (x: number) => Math.floor(x / 10),
    getScreenXAtLogicalIndex: (index: number) => index * 10 + 5,
    getDrawingTimestampAtLogicalIndex: (index: number) => BAR_TIMESTAMPS[index] ?? null,
    getLogicalIndexAtTimestamp: (timestamp: number) => {
      const index = BAR_TIMESTAMPS.indexOf(timestamp)
      return index >= 0 ? index : null
    },
    getDrawingWorkspaceId: () => 'kline',
    priceToY,
    yToPrice,
    getPaneInfo: () => ({ paneId: 'main', top: 0, height: 240 }),
    getPaneAtY: () => ({ paneId: 'main', top: 0, height: 240 }),
    ...overrides,
  } satisfies DrawingViewportPort
}

/** 构造完整的绘图会话 port。 */
export function createDrawingSessionPort(
  overrides: Partial<DrawingSessionPort> = {},
): DrawingSessionPort {
  return { requestDraw: vi.fn(), ...overrides } satisfies DrawingSessionPort
}

/** 绘图适配器三条 port 的可选差异。 */
export interface DrawingAdapterOverrides {
  document?: Partial<DrawingDocumentPort>
  viewport?: Partial<DrawingViewportPort>
  session?: Partial<DrawingSessionPort>
}

/** 组合三个 port 的完整绘图适配器；只覆盖调用方声明的差异。 */
export function createDrawingAdapter(
  overrides: DrawingAdapterOverrides = {},
  drawings: ReadonlyArray<DrawingObject> = [],
): DrawingChartAdapter {
  return {
    ...createDrawingDocumentPort(drawings, overrides.document),
    ...createDrawingViewportPort(overrides.viewport),
    ...createDrawingSessionPort(overrides.session),
  } satisfies DrawingChartAdapter
}

/**
 * 构造磁吸路径最小 adapter。
 * 返回落图元（createDrawing）与拖拽提交（commitDrawingDrag）探针，dragHandler 用例可只取 adapter。
 */
export function createMagnetAdapter(
  tool: 'h-ray' | 'cursor' = 'cursor',
  drawings: DrawingObject[] = [],
) {
  const createDrawing = vi.fn((_input: CreateDrawingInput) =>
    createDrawingObject({ id: 'created' }),
  )
  const commitDrawingDrag = vi.fn(() => null)
  const documentPort = createDrawingDocumentPort(drawings, {
    getDrawingToolId: () => tool,
    createDrawing,
    commitDrawingDrag,
  })
  const adapter = {
    ...documentPort,
    ...createDrawingViewportPort({
      getViewport: () => ({ scrollLeft: 0, plotWidth: 100, plotHeight: 200 }),
      getPaneInfo: () => ({ paneId: 'main', top: 0, height: 200 }),
      getPaneAtY: () => ({ paneId: 'main', top: 0, height: 200 }),
    }),
  } satisfies DrawingChartAdapter
  return { adapter, createDrawing, commitDrawingDrag }
}

/** 构造 snapPointerToOhlc 纯函数最小 adapter。 */
export function createMagnetSnapAdapter(
  bars: ReadonlyArray<KLineData> = OHLC_BARS,
): DrawingChartAdapter {
  return createDrawingAdapter({ viewport: { getData: () => bars } })
}

/** 选择 / 命中路径 adapter 的可选差异。 */
export interface SelectionAdapterOptions {
  tool?: 'cursor' | 'box-select'
  paneTop?: number
  paneHeight?: number
  plotHeight?: number
}

/** 构造选择与命中路径最小 adapter，返回选择写入探针。 */
export function createSelectionAdapter(
  drawings: ReadonlyArray<DrawingObject>,
  options: SelectionAdapterOptions = {},
) {
  const { tool = 'cursor', paneTop = 0, paneHeight = 100, plotHeight = 100 } = options
  const pane = { paneId: 'main', top: paneTop, height: paneHeight }
  const documentPort = createDrawingDocumentPort(drawings, { getDrawingToolId: () => tool })
  const adapter = {
    ...documentPort,
    ...createDrawingViewportPort({
      getViewport: () => ({ scrollLeft: 0, plotWidth: 100, plotHeight }),
      getPaneAtY: () => pane,
      getPaneInfo: () => pane,
      getDrawingData: () => [{ timestamp: 1 }],
      getLogicalIndexAtX: () => 0,
      getDrawingTimestampAtLogicalIndex: () => 1,
      yToPrice: (_paneId: string, y: number) => y,
    }),
  } satisfies DrawingChartAdapter
  return { adapter, setSelectedDrawingIds: documentPort.setSelectedDrawingIds }
}

/** 绘图落点 / 创建 / 预览用例 adapter 的差异项。 */
export interface PlacementAdapterOptions {
  /** 当前绘图工具 id，决定 onPointerDown / onPointerMove 走哪条分支。 */
  tool: DrawingToolId
  /** 落点所属 Pane 的布局。 */
  pane: PaneLayoutInfo
  /** 绘图区宽度。 */
  plotWidth: number
  /** 绘图区高度。 */
  plotHeight: number
  /** getLogicalIndexAtX 的固定返回值；用于右侧未来槽位用例。 */
  logicalIndex: number
  document?: Partial<DrawingDocumentPort>
  session?: Partial<DrawingSessionPort>
}

/**
 * 构造绘图落点 / 创建 / 预览用例的完整 adapter：单 Pane、扁平价格映射（y 即价格）。
 * 与选择用例的 createSelectionAdapter 相比，多出工具 id 与逻辑索引的显式声明。
 */
export function createPlacementAdapter(
  options: PlacementAdapterOptions,
  drawings: ReadonlyArray<DrawingObject> = [],
): DrawingChartAdapter {
  return createDrawingAdapter(
    {
      document: { getDrawingToolId: () => options.tool, ...options.document },
      viewport: {
        getViewport: () => ({
          scrollLeft: 0,
          plotWidth: options.plotWidth,
          plotHeight: options.plotHeight,
        }),
        getPaneAtY: () => options.pane,
        getPaneInfo: () => options.pane,
        getDrawingData: () => [{ timestamp: 1 }],
        getLogicalIndexAtX: () => options.logicalIndex,
        getDrawingTimestampAtLogicalIndex: () => 1,
        yToPrice: (_paneId: string, y: number) => y,
      },
      session: options.session,
    },
    drawings,
  )
}
