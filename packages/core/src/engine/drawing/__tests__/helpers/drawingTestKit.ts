/**
 * 绘图测试共享夹具：图元 / adapter 工厂与坐标、指针事件常量。
 * 仅供 __tests__ 下的绘图用例消费；vitest include 只收集 *.test.ts，本文件不会被当作测试。
 */
import { vi } from 'vitest'

import type { DrawingChartAdapter } from '../../../../controllers/types'
import type { DrawingObject } from '../../../../foundation/plugin'

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
  } as DrawingObject
}

/** 构造最小趋势线图元（工作副本 / 帧投影用例共用）。 */
export function createTrendLine(id: string, overrides: Partial<DrawingObject> = {}): DrawingObject {
  return createDrawingObject({ id, kind: 'trend-line', ...overrides })
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
 * 构造磁吸路径最小 adapter。
 * 返回落图元（createDrawing）与拖拽提交（commitDrawingDrag）探针，dragHandler 用例可只取 adapter。
 */
export function createMagnetAdapter(
  tool: 'h-ray' | 'cursor' = 'cursor',
  drawings: DrawingObject[] = [],
) {
  const createDrawing = vi.fn(
    (input: { anchors: Array<{ price: number }> }) =>
      ({ id: 'created', anchors: input.anchors }) as unknown as DrawingObject,
  )
  const commitDrawingDrag = vi.fn()
  const adapter = {
    getDrawingToolId: () => tool,
    getFullDrawings: () => drawings,
    getSelectedDrawingIds: () => [] as string[],
    setSelectedDrawingIds: vi.fn(),
    createDrawing,
    setDrawingToolId: vi.fn(),
    commitDrawingDrag,
    getDrawingData: () => OHLC_BARS,
    getData: () => OHLC_BARS,
    getViewport: () => ({ scrollLeft: 0, plotWidth: 100, plotHeight: 200 }),
    getPaneAtY: () => ({ paneId: 'main', top: 0, height: 200 }),
    getPaneInfo: () => ({ paneId: 'main', top: 0, height: 200 }),
    getLogicalIndexAtX: (x: number) => Math.floor(x / 10),
    getScreenXAtLogicalIndex: (index: number) => index * 10 + 5,
    getDrawingTimestampAtLogicalIndex: (index: number) => BAR_TIMESTAMPS[index] ?? null,
    getLogicalIndexAtTimestamp: (timestamp: number) => BAR_TIMESTAMPS.indexOf(timestamp),
    getDrawingWorkspaceId: () => 'kline' as const,
    priceToY,
    yToPrice,
  } as unknown as DrawingChartAdapter
  return { adapter, createDrawing, commitDrawingDrag }
}

/** 构造 snapPointerToOhlc 纯函数最小 adapter。 */
export function createMagnetSnapAdapter(
  bars: ReadonlyArray<{ open: number; high: number; low: number; close: number }> = OHLC_BARS,
): DrawingChartAdapter {
  return {
    getData: () => bars,
    getLogicalIndexAtX: (x: number) => Math.floor(x / 10),
    getScreenXAtLogicalIndex: (index: number) => index * 10 + 5,
    priceToY,
  } as unknown as DrawingChartAdapter
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
  let selectedIds: ReadonlyArray<string> = []
  const setSelectedDrawingIds = vi.fn((ids: ReadonlyArray<string>) => {
    selectedIds = [...ids]
  })
  const pane = { paneId: 'main', top: paneTop, height: paneHeight }
  const adapter = {
    getDrawingToolId: () => tool,
    getFullDrawings: () => drawings,
    getSelectedDrawingIds: () => selectedIds,
    setSelectedDrawingIds,
    commitDrawingDrags: vi.fn(),
    getDrawingData: () => [{ timestamp: 1 }],
    getViewport: () => ({ scrollLeft: 0, plotWidth: 100, plotHeight }),
    getPaneAtY: () => pane,
    getPaneInfo: () => pane,
    getLogicalIndexAtX: () => 0,
    getDrawingTimestampAtLogicalIndex: () => 1,
    getDrawingWorkspaceId: () => 'kline' as const,
    yToPrice: (_paneId: string, y: number) => y,
  } as unknown as DrawingChartAdapter
  return { adapter, setSelectedDrawingIds }
}
