/** 验证绘图帧投影在绘制前一次性产出图元和轴装饰。 */
import { describe, expect, it } from 'vitest'
import { createMockRenderContext } from '@/engine/__tests__/helpers/renderTestKit'
import type { DrawingKind, DrawingObject, RenderContext } from '../../../foundation/plugin'
import { createSignal } from '../../../foundation/reactivity/signal'
import { DrawingDefinitionRegistry, DrawingStore, registerDefaultDrawingDefinitions } from '..'
import { projectDrawingsForFrame } from '../frameProjection'
import { createDrawingObject } from './helpers/drawingTestKit'

/** 构造仅覆盖趋势线投影的最小 RenderContext。 */
function createContext(): RenderContext {
  const context = createMockRenderContext({
    data: [
      { timestamp: 1_000, open: 1, high: 2, low: 0, close: 1 },
      { timestamp: 2_000, open: 2, high: 3, low: 1, close: 2 },
    ],
    range: { start: 0, end: 2 },
    kWidth: 6,
    kGap: 2,
    paneWidth: 100,
    kLinePositions: [7, 27],
    kLineCenters: [10, 30],
    kBarRects: [],
    viewport: { scrollLeft: 0, plotWidth: 100, plotHeight: 100 },
    pane: { id: 'main', role: 'price', height: 100, yAxis: { priceToY: (price) => 100 - price } },
  })
  // 部分用例会替换 context.data，因此按调用时的数据重新解析时间戳；
  // 命中多个同名时间戳时返回 null，避免把锚点解析到任意一根 Bar。
  context.getLogicalIndexAtTimestamp = (timestamp) => {
    const matches = context.data.reduce<number[]>((indices, item, index) => {
      if (item.timestamp === timestamp) indices.push(index)
      return indices
    }, [])
    return matches.length === 1 ? matches[0]! : null
  }
  return context
}

/** 基准趋势线图元，只声明用例关心的差异。 */
const createTrendDrawing = (overrides: Partial<DrawingObject> = {}) =>
  createDrawingObject({
    id: 'trend',
    kind: 'trend-line',
    anchors: [
      { id: 'a', time: 1_000, price: 10 },
      { id: 'b', time: 2_000, price: 20 },
    ],
    ...overrides,
  })

describe('projectDrawingsForFrame', () => {
  it('returns selected drawing primitives and axis decorations without mutating context', () => {
    const drawing = createTrendDrawing({ style: { stroke: '#2962ff', strokeWidth: 1 } })
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
    expect(context.yAxisLabels).toHaveLength(0)
    expect(context.yAxisRanges).toHaveLength(0)
  })

  it('attaches a persisted line label to its matching line primitive', () => {
    const drawing = createTrendDrawing({
      id: 'labeled-trend',
      labels: { line: { 0: { text: '趋势', position: 'start' } }, area: {} },
    })
    const store = new DrawingStore({
      drawings$: createSignal<ReadonlyArray<DrawingObject>>([drawing]),
      selectedDrawingIds$: createSignal<ReadonlyArray<string>>([]),
    })
    const definitions = new DrawingDefinitionRegistry()
    registerDefaultDrawingDefinitions(definitions)

    const projection = projectDrawingsForFrame(store, definitions, createContext())

    expect(projection.primitives).toEqual([
      expect.objectContaining({
        kind: 'line',
        // 线段标签基线固定为 bottom：锚点即文本块底边，宿主输入框据此对齐。
        text: expect.objectContaining({ text: '趋势', position: 'start', baseline: 'bottom' }),
      }),
    ])
  })

  it('attaches an arrow label to its arrow primitive', () => {
    const drawing = createDrawingObject({
      id: 'labeled-arrow',
      kind: 'arrow',
      anchors: [
        { id: 'a', time: 1_000, price: 10 },
        { id: 'b', time: 2_000, price: 20 },
      ],
      labels: { line: { 0: { text: '箭头', position: 'end' } }, area: {} },
    })
    const store = new DrawingStore({
      drawings$: createSignal<ReadonlyArray<DrawingObject>>([drawing]),
      selectedDrawingIds$: createSignal<ReadonlyArray<string>>([]),
    })
    const definitions = new DrawingDefinitionRegistry()
    registerDefaultDrawingDefinitions(definitions)

    expect(projectDrawingsForFrame(store, definitions, createContext()).primitives).toEqual([
      expect.objectContaining({
        kind: 'arrow',
        text: expect.objectContaining({ text: '箭头', position: 'end' }),
      }),
    ])
  })

  it('re-resolves timestamp anchors after older data prepends and ignores the stale index', () => {
    // 创建时的 index 为 0/1；前方插入两根旧 K 线后它们应变为 2/3。
    const drawing = createTrendDrawing()
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
    const drawing = createTrendDrawing()
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
    const drawing = createTrendDrawing({
      anchors: [
        { id: 'a', time: 1_000, price: 10 },
        { id: 'b', time: 3_000, price: 20 },
      ],
    })
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

  it('projects a future-slot anchor from its creation-time base bar', () => {
    const drawing = createTrendDrawing({
      id: 'future-trend',
      anchors: [
        { id: 'a', time: 1_000, price: 10 },
        { id: 'b', time: 1_000, futureOffset: 2, price: 20 },
      ],
    })
    const store = new DrawingStore({
      drawings$: createSignal<ReadonlyArray<DrawingObject>>([drawing]),
      selectedDrawingIds$: createSignal<ReadonlyArray<string>>(['future-trend']),
    })
    const definitions = new DrawingDefinitionRegistry()
    registerDefaultDrawingDefinitions(definitions)

    const projection = projectDrawingsForFrame(store, definitions, createContext())

    expect(projection.primitives.find((primitive) => primitive.kind === 'line')).toMatchObject({
      a: { x: 10 },
      b: { x: 50 },
    })
  })

  /** 用单个已选中图元跑一次帧投影，断言其轴标签语义。 */
  function projectSingleAnchor(kind: DrawingKind, anchors: DrawingObject['anchors']) {
    const drawing = createDrawingObject({ id: 'subject', kind, anchors })
    const store = new DrawingStore({
      drawings$: createSignal<ReadonlyArray<DrawingObject>>([drawing]),
      selectedDrawingIds$: createSignal<ReadonlyArray<string>>([drawing.id]),
    })
    const definitions = new DrawingDefinitionRegistry()
    registerDefaultDrawingDefinitions(definitions)
    return projectDrawingsForFrame(store, definitions, createContext())
  }

  const singleAnchorLabelCases: ReadonlyArray<{
    label: string
    kind: DrawingKind
    anchors: DrawingObject['anchors']
    yAxisPrices: ReadonlyArray<number>
    xAxisTimestamps: ReadonlyArray<number>
  }> = [
    {
      label: 'horizontal line',
      kind: 'horizontal-line',
      // 无时间锚点：index 为 -1，价格轴标签仍须投影。
      anchors: [{ id: 'a', type: 'horizontal', price: 30 }],
      yAxisPrices: [30],
      xAxisTimestamps: [],
    },
    {
      label: 'horizontal ray',
      kind: 'horizontal-ray',
      anchors: [{ id: 'a', type: 'point', time: 1_000, price: 25 }],
      yAxisPrices: [25],
      xAxisTimestamps: [],
    },
    {
      label: 'vertical line',
      kind: 'vertical-line',
      anchors: [{ id: 'a', type: 'vertical', time: 1_000, price: 40 }],
      yAxisPrices: [],
      xAxisTimestamps: [1_000],
    },
  ]

  it.each(singleAnchorLabelCases)(
    'projects only the required axis label for a $label',
    ({ kind, anchors, yAxisPrices, xAxisTimestamps }) => {
      const projection = projectSingleAnchor(kind, anchors)
      expect(projection.yAxisLabels.map((label) => label.price)).toEqual(yAxisPrices)
      expect(projection.xAxisLabels.map((label) => label.timestamp)).toEqual(xAxisTimestamps)
    },
  )
})
