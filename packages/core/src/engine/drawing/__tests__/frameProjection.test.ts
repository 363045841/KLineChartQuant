/** 验证绘图帧投影在绘制前一次性产出图元和轴装饰。 */
import { describe, expect, it } from 'vitest'

import { createSignal } from '../../../foundation/reactivity/signal'
import type { DrawingObject, RenderContext } from '../../../foundation/plugin'
import { DrawingDefinitionRegistry, DrawingStore, registerDefaultDrawingDefinitions } from '..'
import { projectDrawingsForFrame } from '../frameProjection'

/** 构造仅覆盖趋势线投影的最小 RenderContext。 */
function createContext(): RenderContext {
  const context: RenderContext = {
    ctx: {} as CanvasRenderingContext2D,
    pane: {
      id: 'main',
      role: 'price',
      height: 100,
      yAxis: { priceToY: (price: number) => 100 - price } as any,
    } as RenderContext['pane'],
    data: [
      { timestamp: 1_000, open: 1, high: 2, low: 0, close: 1 },
      { timestamp: 2_000, open: 2, high: 3, low: 1, close: 2 },
    ],
    period: 'daily',
    range: { start: 0, end: 2 },
    scrollLeft: 0,
    kWidth: 6,
    kGap: 2,
    dpr: 1,
    paneWidth: 100,
    kLinePositions: [7, 27],
    kLineCenters: [10, 30],
    kBarRects: [],
    viewport: { scrollLeft: 0, plotWidth: 100, plotHeight: 100 },
  }
  context.getLogicalIndexAtTimestamp = (timestamp) => {
    const matches = context.data.reduce<number[]>((indices, item, index) => {
      if ((item as { timestamp?: number }).timestamp === timestamp) indices.push(index)
      return indices
    }, [])
    return matches.length === 1 ? matches[0]! : null
  }
  return context
}

describe('projectDrawingsForFrame', () => {
  it('returns selected drawing primitives and axis decorations without mutating context', () => {
    const drawing: DrawingObject = {
      id: 'trend',
      kind: 'trend-line',
      paneId: 'main',
      visible: true,
      anchors: [
        { id: 'a', time: 1_000, price: 10 },
        { id: 'b', time: 2_000, price: 20 },
      ],
      params: {},
      style: { stroke: '#2962ff', strokeWidth: 1 },
    }
    const store = new DrawingStore({
      drawings$: createSignal<ReadonlyArray<DrawingObject>>([drawing]),
      selectedDrawingIds$: createSignal<ReadonlyArray<string>>(['trend']),
    })
    const definitions = new DrawingDefinitionRegistry()
    registerDefaultDrawingDefinitions(definitions)
    const context = createContext()

    const projection = projectDrawingsForFrame(store, definitions, context)

    expect(projection.primitives).not.toEqual([])
    expect(projection.yAxisLabels).toHaveLength(2)
    expect(projection.yAxisRanges).toHaveLength(1)
    expect(projection.xAxisLabels).toHaveLength(2)
    expect(context.yAxisLabels).toBeUndefined()
    expect(context.yAxisRanges).toBeUndefined()
  })

  it('re-resolves timestamp anchors after older data prepends and ignores the stale index', () => {
    const drawing: DrawingObject = {
      id: 'trend',
      kind: 'trend-line',
      paneId: 'main',
      visible: true,
      // 创建时的 index 为 0/1；前方插入两根旧 K 线后它们应变为 2/3。
      anchors: [
        { id: 'a', time: 1_000, price: 10 },
        { id: 'b', time: 2_000, price: 20 },
      ],
      params: {},
      style: { stroke: '#2962ff' },
    }
    const context = createContext()
    context.data = [
      { timestamp: -1_000, open: 0, high: 1, low: -1, close: 0 },
      { timestamp: 0, open: 0, high: 1, low: -1, close: 0 },
      { timestamp: 1_000, open: 1, high: 2, low: 0, close: 1 },
      { timestamp: 2_000, open: 2, high: 3, low: 1, close: 2 },
    ]
    context.range = { start: 2, end: 4 }
    context.kLineCenters = [10, 30]
    const store = new DrawingStore({
      drawings$: createSignal<ReadonlyArray<DrawingObject>>([drawing]),
      selectedDrawingIds$: createSignal<ReadonlyArray<string>>(['trend']),
    })
    const definitions = new DrawingDefinitionRegistry()
    registerDefaultDrawingDefinitions(definitions)

    const projection = projectDrawingsForFrame(store, definitions, context)

    expect(projection.yAxisLabels.map((label) => label.price)).toEqual([10, 20])
    expect(projection.xAxisLabels.map((label) => label.x)).toEqual([10, 30])
  })

  it('does not resolve an ambiguous timestamp to an arbitrary bar', () => {
    const drawing: DrawingObject = {
      id: 'trend',
      kind: 'trend-line',
      paneId: 'main',
      visible: true,
      anchors: [
        { id: 'a', time: 1_000, price: 10 },
        { id: 'b', time: 2_000, price: 20 },
      ],
      params: {},
      style: { stroke: '#2962ff' },
    }
    const context = createContext()
    context.getLogicalIndexAtTimestamp = (timestamp) => (timestamp === 1_000 ? null : 1)
    const store = new DrawingStore({
      drawings$: createSignal<ReadonlyArray<DrawingObject>>([drawing]),
      selectedDrawingIds$: createSignal<ReadonlyArray<string>>(['trend']),
    })
    const definitions = new DrawingDefinitionRegistry()
    registerDefaultDrawingDefinitions(definitions)

    const projection = projectDrawingsForFrame(store, definitions, context)

    expect(projection.primitives).toEqual([])
    expect(projection.yAxisLabels).toEqual([])
  })

  it('keeps the line geometry when an endpoint is after the visible range without registering it', () => {
    const drawing: DrawingObject = {
      id: 'trend',
      kind: 'trend-line',
      paneId: 'main',
      visible: true,
      anchors: [
        { id: 'a', time: 1_000, price: 10 },
        { id: 'b', time: 3_000, price: 20 },
      ],
      params: {},
      style: { stroke: '#2962ff' },
    }
    const context = createContext()
    context.data = [
      { timestamp: 1_000, open: 1, high: 2, low: 0, close: 1 },
      { timestamp: 2_000, open: 2, high: 3, low: 1, close: 2 },
      { timestamp: 3_000, open: 3, high: 4, low: 2, close: 3 },
    ]
    context.paneWidth = 40
    context.viewport = { scrollLeft: 0, plotWidth: 40, plotHeight: 100 }
    const store = new DrawingStore({
      drawings$: createSignal<ReadonlyArray<DrawingObject>>([drawing]),
      selectedDrawingIds$: createSignal<ReadonlyArray<string>>(['trend']),
    })
    const definitions = new DrawingDefinitionRegistry()
    registerDefaultDrawingDefinitions(definitions)

    const projection = projectDrawingsForFrame(store, definitions, context)
    expect(projection.primitives.find((primitive) => primitive.kind === 'line')).toMatchObject({
      a: { x: 10 },
      b: { x: 50 },
    })
    expect(projection.xAxisLabels.map((label) => label.timestamp)).toEqual([1_000])
    expect(projection.yAxisLabels.map((label) => label.price)).toEqual([10])
  })
})
