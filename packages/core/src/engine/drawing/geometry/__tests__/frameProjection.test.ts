/** 验证绘图帧投影在绘制前一次性产出图元和轴装饰。 */
import { describe, expect, it } from 'vitest'
import {
  createKLineData,
  createMockRenderContext,
  type MockRenderContextOverrides,
} from '@/engine/__tests__/helpers/renderTestKit'
import {
  type DrawingFrameProjection,
  type DrawingPrimitive,
  type LinePrimitive,
  POINT_ROLE,
  type PointPrimitive,
  type RenderContext,
} from '@/foundation/plugin'
import { createSignal } from '@/foundation/reactivity/signal'
import { lightTheme } from '@/foundation/tokens/index.js'
import { createDrawingObject } from '../../__tests__/helpers/drawingTestKit'
import { DrawingDefinitionRegistry } from '../../render/impl/DrawingDefinitionRegistry'
import { DrawingStore } from '../../render/impl/DrawingStore'
import { registerDefaultDrawingDefinitions } from '../../render/impl/definitions/index'
import { PREVIEW_ID } from '../../session/impl/DrawingSessionOverlay'
import type { DrawingKind, DrawingObject } from '../../types'
import { computeDrawingPriceRange, projectDrawingsForFrame } from '../impl/frameProjection'

/** 构造仅覆盖趋势线投影的最小 RenderContext。 */
function createContext(overrides: MockRenderContextOverrides = {}): RenderContext {
  return createMockRenderContext({
    data: [
      { timestamp: 1_000, open: 1, high: 2, low: 0, close: 1 },
      { timestamp: 2_000, open: 2, high: 3, low: 1, close: 2 },
    ],
    range: { start: 0, end: 2 },
    // 理想槽距 18+2=20，中心起点 2+(17-1)/2=10，与封存中心保持一致。
    kWidth: 18,
    kGap: 2,
    paneWidth: 100,
    kLinePositions: [7, 27],
    kLineCenters: [10, 30],
    viewport: { scrollLeft: 0, plotWidth: 100, plotHeight: 100 },
    pane: { id: 'main', role: 'price', height: 100, yAxis: { priceToY: (price) => 100 - price } },
    ...overrides,
  })
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

/** 从帧投影中取出点图元（含线段中点手柄）。 */
function pointPrimitives(
  primitives: ReadonlyArray<DrawingPrimitive>,
): ReadonlyArray<PointPrimitive> {
  return primitives.filter((primitive): primitive is PointPrimitive => primitive.kind === 'point')
}

/** 从帧投影中取出线图元；其端点在选中态充当锚点。 */
function linePrimitives(primitives: ReadonlyArray<DrawingPrimitive>): ReadonlyArray<LinePrimitive> {
  return primitives.filter((primitive): primitive is LinePrimitive => primitive.kind === 'line')
}

/** 平滑顶底夹具：斜线 (10,90)-(30,80)，水平线 (10,95)-(30,95)。 */
function createFlatLineDrawing(id: string): DrawingObject {
  return createDrawingObject({
    id,
    kind: 'flat-line',
    anchors: [
      { id: 'a', time: 1_000, price: 10 },
      { id: 'b', time: 2_000, price: 20 },
      { id: 'h1', time: 1_000, price: 5 },
      { id: 'h2', time: 2_000, price: 5 },
    ],
  })
}

/** 用单个图元跑一次帧投影，selected 决定其是否被选中。 */
function projectSingleDrawing(
  drawing: DrawingObject,
  selected: boolean,
  context: RenderContext = createContext(),
): DrawingFrameProjection {
  const store = new DrawingStore({
    drawings$: createSignal<ReadonlyArray<DrawingObject>>([drawing]),
    selectedDrawingIds$: createSignal<ReadonlyArray<string>>(selected ? [drawing.id] : []),
  })
  const definitions = new DrawingDefinitionRegistry()
  registerDefaultDrawingDefinitions(definitions)
  return projectDrawingsForFrame(store, definitions, context)
}

/** 10 根 K 线的上下文；可见区间由用例指定，用于验证投影裁剪。 */
function createRangeContext(range: { start: number; end: number }): RenderContext {
  return createMockRenderContext({ data: createKLineData(10), range })
}

describe('computeDrawingPriceRange', () => {
  it('滚动后只汇总当前可见图元，隐藏和非法坐标不污染极值', () => {
    const definitions = new DrawingDefinitionRegistry()
    registerDefaultDrawingDefinitions(definitions)
    const drawings = [0, 6].map((index) =>
      createTrendDrawing({
        id: `range-${index}`,
        anchors: [
          { id: 'a', logicalIndex: index, price: index + 10 },
          { id: 'b', logicalIndex: index + 1, price: index + 20 },
        ],
      }),
    )
    const ignored = [
      createTrendDrawing({ visible: false }),
      createTrendDrawing({ anchors: [{ id: 'a', logicalIndex: 0, price: Number.NaN }] }),
      createTrendDrawing({ anchors: [{ id: 'a', logicalIndex: Number.NaN, price: 1000 }] }),
      createTrendDrawing({ anchors: [{ id: 'a', time: -1000, price: 1000 }] }),
    ]
    const context = createRangeContext({ start: 0, end: 3 })

    expect(computeDrawingPriceRange([...drawings, ...ignored], definitions, context)).toEqual({
      min: 10,
      max: 20,
    })
    expect(
      computeDrawingPriceRange(
        [...drawings, ...ignored],
        definitions,
        createRangeContext({ start: 6, end: 9 }),
      ),
    ).toEqual({ min: 16, max: 26 })
    expect(
      computeDrawingPriceRange(drawings, definitions, createRangeContext({ start: 3, end: 3 })),
    ).toBeNull()
  })
})

describe('projectDrawingsForFrame', () => {
  it.each(['none', 'right', 'left', 'both'] as const)(
    'uses the same time anchors and %s extension for drawing and price range',
    (extend) => {
      const context = createRangeContext({ start: 5, end: 8 })
      const definitions = new DrawingDefinitionRegistry()
      registerDefaultDrawingDefinitions(definitions)
      const first = context.data[0]!.timestamp
      const second = context.data[1]!.timestamp
      const drawing = createTrendDrawing({
        xloc: 'bar_time',
        extend,
        anchors: [
          { id: 'a', time: first, price: 100 },
          { id: 'b', time: first + (second - first) / 2, price: 200 },
        ],
      })
      const range = computeDrawingPriceRange([drawing], definitions, context)
      const projection = projectSingleDrawing(drawing, false, context)
      const visible = extend === 'right' || extend === 'both'
      expect(range).toEqual(visible ? { min: 100, max: 200 } : null)
      expect(projection.primitives.length > 0).toBe(visible)
    },
  )

  it('projects profile reference lines beyond the last candle through the shared cadence', () => {
    const start = Date.UTC(2026, 0, 5)
    const context = createContext({
      data: [
        { timestamp: start, open: 1, high: 2, low: 0, close: 1 },
        { timestamp: start + 300_000, open: 1, high: 2, low: 0, close: 1 },
      ],
      period: '5min',
      marketSession: { timeZone: 'UTC', sessions: [{ open: 0, close: 1440 }] },
    })
    const bar = createDrawingObject({
      id: 'profile',
      kind: 'rectangle',
      xloc: 'bar_time',
      anchors: [
        { id: 'a', time: start, price: 10 },
        { id: 'b', time: start + 108_000, price: 10 },
        { id: 'c', time: start + 108_000, price: 20 },
        { id: 'd', time: start, price: 20 },
      ],
    })
    expect(projectSingleDrawing(bar, false, context).primitives.length).toBeGreaterThan(0)
    const line = createTrendDrawing({
      xloc: 'bar_time',
      anchors: [
        { id: 'a', time: start, price: 15 },
        { id: 'b', time: start + 360_000, price: 15 },
      ],
    })
    expect(linePrimitives(projectSingleDrawing(line, false, context).primitives)).toHaveLength(1)
    // 末根之后的端点按常规槽距外推，不再依赖交易日历补齐未来开盘。
    const beyondLast = createTrendDrawing({
      xloc: 'bar_time',
      anchors: [
        { id: 'a', time: start, price: 15 },
        { id: 'b', time: start + 660_000, price: 15 },
      ],
    })
    expect(
      linePrimitives(projectSingleDrawing(beyondLast, false, context).primitives),
    ).toHaveLength(1)
  })

  it('projects timestamp positions between bars through the shared continuous X axis', () => {
    const drawing = createTrendDrawing({
      ownerId: 'indicator',
      xloc: 'bar_time',
      anchors: [
        { id: 'a', time: 1500, price: 10 },
        { id: 'b', time: 2000, price: 20 },
      ],
    })
    expect(linePrimitives(projectSingleDrawing(drawing, false).primitives)).toMatchObject([
      { a: { x: 20, y: 90 }, b: { x: 30, y: 80 } },
    ])
  })
  it('resolves script color aliases in drawing text through the active theme', () => {
    const drawing = createDrawingObject({
      id: 'label',
      kind: 'label',
      anchors: [{ id: 'a', logicalIndex: 0, price: 10 }],
      style: { stroke: '#2962ff', textColor: '@red', fontSize: 11 },
      text: { value: 'HH', align: 'center', verticalAlign: 'middle' },
    })
    const primitive = projectSingleDrawing(drawing, false).primitives.find(
      (item) => item.kind === 'text',
    )
    // 文字颜色和字号只来自样式，别名在这里统一解析成主题色值。
    expect(primitive?.style.textColor).toBe(lightTheme.colors.scriptPalette.red)
    expect(primitive?.style.fontSize).toBe(11)
  })
  it('projects indicator index anchors with no handles even if selected', () => {
    const drawing = createTrendDrawing({
      ownerId: 'indicator',
      extend: 'left',
      anchors: [
        { id: 'a', logicalIndex: 0, price: 10 },
        { id: 'b', logicalIndex: 3, price: 20 },
      ],
    })
    const projection = projectSingleDrawing(drawing, true)
    expect(linePrimitives(projection.primitives)).toMatchObject([
      { a: { x: 10, y: 90 }, extend: 'left', showEndpoints: false },
    ])
    expect(pointPrimitives(projection.primitives)).toHaveLength(0)
    expect(projection.yAxisRanges).toHaveLength(0)
  })

  it('retains na objects without projecting invalid coordinates', () => {
    const drawing = createTrendDrawing({
      ownerId: 'indicator',
      anchors: [
        { id: 'a', logicalIndex: Number.NaN, price: 10 },
        { id: 'b', logicalIndex: 1, price: 20 },
      ],
    })
    expect(projectSingleDrawing(drawing, false).primitives).toHaveLength(0)
  })
  it('registers selected drawing axis labels into the frame collectors without mutating ranges', () => {
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
    expect(context.axisLabels.forSurface('yRightOverlay', 'main').labels).toHaveLength(2)
    expect(projection.yAxisRanges).toHaveLength(1)
    expect(context.yAxisRanges).toHaveLength(0)
    expect(
      context.axisLabels
        .forSurface('yRightOverlay', 'main')
        .labels.map((label) => (label.kind === 'tag' ? label.text : '')),
    ).toEqual(['10.00', '20.00'])
    expect(context.axisLabels.forSurface('xLabels').labels.map((label) => label.pos)).toEqual([
      10, 30,
    ])
  })

  it('keeps the line body stroke width unchanged when selected', () => {
    const drawing = createTrendDrawing({ style: { stroke: '#2962ff', strokeWidth: 2 } })

    const projection = projectSingleDrawing(drawing, true)

    // 选中态只对齐描边，线身不加粗：线图元仍沿用图元自身的 strokeWidth。
    expect(
      linePrimitives(projection.primitives).map((primitive) => primitive.style?.strokeWidth),
    ).toEqual([2])
  })

  it('keeps the anchors of an in-progress preview visible', () => {
    // 预览只经会话 overlay 参与绘制，committed 列表里的同名 id 会被丢弃。
    const preview = createDrawingObject({
      id: PREVIEW_ID,
      kind: 'horizontal-ray',
      anchors: [{ id: 'a', type: 'point', time: 1_000, price: 25 }],
    })
    const store = new DrawingStore({
      drawings$: createSignal<ReadonlyArray<DrawingObject>>([]),
      selectedDrawingIds$: createSignal<ReadonlyArray<string>>([]),
      getOverlay: () => [preview],
    })
    const definitions = new DrawingDefinitionRegistry()
    registerDefaultDrawingDefinitions(definitions)

    const projection = projectDrawingsForFrame(store, definitions, createContext())

    // 预览未选中，但正在放置的锚点仍要投影。
    expect(pointPrimitives(projection.primitives).map((primitive) => primitive.role)).toEqual([
      'anchor',
    ])
  })

  it('hides every anchor of an unselected drawing', () => {
    const flatLine = projectSingleDrawing(createFlatLineDrawing('flat'), false)
    expect(linePrimitives(flatLine.primitives).map((primitive) => primitive.showEndpoints)).toEqual(
      [false, false],
    )
    expect(pointPrimitives(flatLine.primitives)).toEqual([])

    // 显式锚点点图元同样不投影：未选中态只剩线与填充。
    const ray = projectSingleDrawing(
      createDrawingObject({
        id: 'ray',
        kind: 'horizontal-ray',
        anchors: [{ id: 'a', type: 'point', time: 1_000, price: 25 }],
      }),
      false,
    )
    expect(pointPrimitives(ray.primitives)).toEqual([])
  })

  const handleCases: ReadonlyArray<{
    label: string
    drawing: DrawingObject
    selected: boolean
    midpoints: ReadonlyArray<{ x: number; y: number }>
  }> = [
    {
      label: 'a selected drawing',
      drawing: createFlatLineDrawing('flat'),
      selected: true,
      // 锚点屏幕位置为 (10,90)、(30,80)、(10,95)、(30,95)：手柄落在两条线的中点。
      midpoints: [
        { x: 20, y: 85 },
        { x: 20, y: 95 },
      ],
    },
    {
      label: 'an unselected drawing',
      drawing: createFlatLineDrawing('flat'),
      selected: false,
      midpoints: [],
    },
    {
      label: 'a drawing without a line table',
      drawing: createDrawingObject({
        id: 'trend',
        kind: 'trend-line',
        anchors: [
          { id: 'a', time: 1_000, price: 10 },
          { id: 'b', time: 2_000, price: 20 },
        ],
      }),
      selected: true,
      midpoints: [],
    },
  ]

  it.each(handleCases)(
    'projects a vertical handle per line midpoint for $label',
    ({ drawing, selected, midpoints }) => {
      const projection = projectSingleDrawing(drawing, selected)

      const handles = pointPrimitives(projection.primitives).filter(
        (primitive) => primitive.role === POINT_ROLE['translate-handle'],
      )
      expect(handles.map((primitive) => primitive.point)).toEqual(midpoints)
      // 手柄统一压在所有图元之后，不被后画的图元遮住。
      expect(handles.length === 0 ? [] : projection.primitives.slice(-handles.length)).toEqual(
        handles,
      )
    },
  )

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
    const context = createContext({
      data: [
        { timestamp: -1_000, open: 0, high: 1, low: -1, close: 0 },
        { timestamp: 0, open: 0, high: 1, low: -1, close: 0 },
        { timestamp: 1_000, open: 1, high: 2, low: 0, close: 1 },
        { timestamp: 2_000, open: 2, high: 3, low: 1, close: 2 },
      ],
      range: { start: 2, end: 4 },
      kLineCenters: [10, 30],
    })
    const store = new DrawingStore({
      drawings$: createSignal<ReadonlyArray<DrawingObject>>([drawing]),
      selectedDrawingIds$: createSignal<ReadonlyArray<string>>(['trend']),
    })
    const definitions = new DrawingDefinitionRegistry()
    registerDefaultDrawingDefinitions(definitions)

    projectDrawingsForFrame(store, definitions, context)

    expect(
      context.axisLabels
        .forSurface('yRightOverlay', 'main')
        .labels.map((label) => (label.kind === 'tag' ? label.text : '')),
    ).toEqual(['10.00', '20.00'])
    expect(context.axisLabels.forSurface('xLabels').labels.map((label) => label.pos)).toEqual([
      10, 30,
    ])
  })

  it('keeps the line geometry when an endpoint is after the visible range without registering it', () => {
    const drawing = createTrendDrawing({
      anchors: [
        { id: 'a', time: 1_000, price: 10 },
        { id: 'b', time: 3_000, price: 20 },
      ],
    })
    const context = createContext({
      data: [
        { timestamp: 1_000, open: 1, high: 2, low: 0, close: 1 },
        { timestamp: 2_000, open: 2, high: 3, low: 1, close: 2 },
        { timestamp: 3_000, open: 3, high: 4, low: 2, close: 3 },
      ],
      paneWidth: 40,
      viewport: { scrollLeft: 0, plotWidth: 40, plotHeight: 100 },
    })
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
    expect(context.axisLabels.forSurface('xLabels').labels.map((label) => label.pos)).toEqual([10])
    expect(
      context.axisLabels
        .forSurface('yRightOverlay', 'main')
        .labels.map((label) => (label.kind === 'tag' ? Number(label.text) : 0)),
    ).toEqual([10])
  })

  it('未来锚点按常规槽距投影，不依赖交易日历', () => {
    const drawing = createTrendDrawing({
      anchors: [
        { id: 'a', time: 1_000, price: 10 },
        { id: 'b', time: 4_000, price: 20 },
      ],
    })
    const store = new DrawingStore({
      drawings$: createSignal<ReadonlyArray<DrawingObject>>([drawing]),
      selectedDrawingIds$: createSignal<ReadonlyArray<string>>(['trend']),
    })
    const definitions = new DrawingDefinitionRegistry()
    registerDefaultDrawingDefinitions(definitions)
    const context = createContext({
      range: { start: 0, end: 5 },
      kLineCenters: [10, 30, 50, 70, 90],
    })
    const projection = projectDrawingsForFrame(store, definitions, context)
    expect(linePrimitives(projection.primitives)).toHaveLength(1)
    // 用户锚点吸附槽位：两根 K 线的常规槽距为 1000ms，4000ms 落在第 3 槽位。
    expect(linePrimitives(projection.primitives)[0]).toMatchObject({ a: { x: 10 }, b: { x: 70 } })
    expect(context.axisLabels.forSurface('xLabels').labels[1]?.text).toBe(
      context.displayTimeFormatter.formatDate(4000),
    )
    expect(drawing.anchors[1]?.time).toBe(4000)
  })

  it('intraday anchor time tags include the clock time', () => {
    const start = Date.UTC(2026, 0, 5, 1, 35)
    const drawing = createTrendDrawing({
      anchors: [
        { id: 'a', time: start, price: 10 },
        { id: 'b', time: start + 5 * 60_000, price: 20 },
      ],
    })
    const store = new DrawingStore({
      drawings$: createSignal<ReadonlyArray<DrawingObject>>([drawing]),
      selectedDrawingIds$: createSignal<ReadonlyArray<string>>(['trend']),
    })
    const definitions = new DrawingDefinitionRegistry()
    registerDefaultDrawingDefinitions(definitions)
    const context = createContext({
      data: Array.from({ length: 4 }, (_, index) => ({
        timestamp: start + index * 5 * 60_000,
        open: 1,
        high: 2,
        low: 0,
        close: 1,
      })),
      range: { start: 0, end: 4 },
      period: '5min',
      kLineCenters: [10, 30, 50, 70],
    })

    projectDrawingsForFrame(store, definitions, context)

    expect(context.axisLabels.forSurface('xLabels').labels[0]?.text).toBe(
      context.displayTimeFormatter.formatDateTime(start),
    )
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
    const context = createContext()
    const projection = projectDrawingsForFrame(store, definitions, context)
    return { projection, context }
  }

  const singleAnchorLabelCases: ReadonlyArray<{
    label: string
    kind: DrawingKind
    anchors: DrawingObject['anchors']
    yAxisPrices: ReadonlyArray<number>
    xAxisLabelCount: number
  }> = [
    {
      label: 'horizontal line',
      kind: 'horizontal-line',
      // 无时间锚点：index 为 -1，价格轴标签仍须投影。
      anchors: [{ id: 'a', type: 'horizontal', price: 30 }],
      yAxisPrices: [30],
      xAxisLabelCount: 0,
    },
    {
      label: 'horizontal ray',
      kind: 'horizontal-ray',
      anchors: [{ id: 'a', type: 'point', time: 1_000, price: 25 }],
      yAxisPrices: [25],
      xAxisLabelCount: 0,
    },
    {
      label: 'vertical line',
      kind: 'vertical-line',
      anchors: [{ id: 'a', type: 'vertical', time: 1_000, price: 40 }],
      yAxisPrices: [],
      xAxisLabelCount: 1,
    },
  ]

  it.each(singleAnchorLabelCases)(
    'projects only the required axis label for a $label',
    ({ kind, anchors, yAxisPrices, xAxisLabelCount }) => {
      const { context } = projectSingleAnchor(kind, anchors)
      const yLabels = context.axisLabels
        .forSurface('yRightOverlay', 'main')
        .labels.map((label) => (label.kind === 'tag' ? Number(label.text) : 0))
      expect(yLabels).toEqual(yAxisPrices)
      expect(context.axisLabels.forSurface('xLabels').labels).toHaveLength(xAxisLabelCount)
    },
  )

  it.each([
    {
      label: 'horizontal line',
      kind: 'horizontal-line' as const,
      anchors: [{ id: 'a', type: 'horizontal' as const, price: 30 }],
      expected: { x: 60, y: 70 },
    },
    {
      label: 'vertical line',
      kind: 'vertical-line' as const,
      anchors: [{ id: 'a', type: 'vertical' as const, time: 1_000, price: 40 }],
      expected: { x: 10, y: 60 },
    },
  ])('projects the edge translate handle of a selected $label', ({ kind, anchors, expected }) => {
    // 绘图区 100×100、右侧 / 下方内边距 40：手柄落在靠边位置而不是锚点自身。
    const points = projectSingleAnchor(kind, anchors).projection.primitives.filter(
      (primitive) =>
        primitive.kind === 'point' && primitive.role === POINT_ROLE['translate-handle'],
    )
    expect(points).toEqual([expect.objectContaining({ point: expected })])
  })
})

describe('projectDrawingsForFrame snap sources', () => {
  /** 建一个只包含给定图元的 store。 */
  function createStore(drawings: ReadonlyArray<DrawingObject>): DrawingStore {
    return new DrawingStore({
      drawings$: createSignal<ReadonlyArray<DrawingObject>>(drawings),
      selectedDrawingIds$: createSignal<ReadonlyArray<string>>([]),
    })
  }

  function createRegistry(): DrawingDefinitionRegistry {
    const definitions = new DrawingDefinitionRegistry()
    registerDefaultDrawingDefinitions(definitions)
    return definitions
  }

  /** 磁吸候选只认已提交层：会话覆盖是正在被拖拽、位置还会继续变的图元。 */
  it('只有 committed 层输出可吸附线段', () => {
    const store = createStore([
      createDrawingObject({
        id: 't1',
        kind: 'trend-line',
        anchors: [
          { id: 'a', time: 1_000, price: 10 },
          { id: 'b', time: 2_000, price: 20 },
        ],
      }),
    ])
    const definitions = createRegistry()

    const committed = projectDrawingsForFrame(
      store,
      definitions,
      createContext(),
      null,
      'committed',
    )
    expect(committed.snapLines).toHaveLength(1)
    expect(committed.snapLines[0]!.drawingId).toBe('t1')

    const session = projectDrawingsForFrame(store, definitions, createContext(), null, 'session')
    expect(session.snapLines).toHaveLength(0)
  })

  /** 水平线段带领域价格，磁吸写回时不必经过屏幕反算。 */
  it('水平线段的 snapLine 携带精确价格', () => {
    const store = createStore([createFlatLineDrawing('f1')])
    const committed = projectDrawingsForFrame(
      store,
      createRegistry(),
      createContext(),
      null,
      'committed',
    )
    expect(committed.snapLines.some((line) => line.price === 5)).toBe(true)
  })

  /** 命中反馈走会话层，位置就是磁吸结果本身，不再做一次换算。 */
  it('磁吸命中点投影为会话层圆点', () => {
    const context = createContext()
    const projection = projectDrawingsForFrame(
      createStore([]),
      createRegistry(),
      context,
      null,
      'session',
      { paneId: context.pane.id, x: 12, y: 34 },
    )
    expect(
      pointPrimitives(projection.primitives).map((primitive) => primitive.point),
    ).toContainEqual({ x: 12, y: 34 })
  })
})

describe('projectDrawingsForFrame range culling', () => {
  /** 可见索引区间 5..8；左右两侧各多留一根 K 线。 */
  const visibleRange = { start: 5, end: 8 }

  /** 逻辑索引锚定的单锚点标签。 */
  function labelAt(index: number): DrawingObject {
    return createDrawingObject({
      id: `label-${index}`,
      kind: 'label',
      anchors: [{ id: 'a', type: 'point', logicalIndex: index, price: 10 }],
      style: { stroke: '#ef5350', fontSize: 11 },
      text: { value: 'HH', align: 'center', verticalAlign: 'middle' },
    })
  }

  /** 两个逻辑索引锚定的两锚点图元。 */
  function drawingBetween(
    kind: DrawingKind,
    start: number,
    end: number,
    extend?: 'left' | 'right' | 'both',
  ): DrawingObject {
    return createDrawingObject({
      id: `${kind}-${start}-${end}`,
      kind,
      extend,
      anchors: [
        { id: 'a', type: 'point', logicalIndex: start, price: 10 },
        { id: 'b', type: 'point', logicalIndex: end, price: 20 },
      ],
    })
  }

  /** 四角矩形：上边价格 20、下边价格 10，左右分别落在起止索引。 */
  function rectangleBetween(
    start: number,
    end: number,
    extend?: 'left' | 'right' | 'both',
  ): DrawingObject {
    return createDrawingObject({
      id: `rectangle-${start}-${end}`,
      kind: 'rectangle',
      extend,
      anchors: [
        { id: 'tl', type: 'point', logicalIndex: start, price: 20 },
        { id: 'tr', type: 'point', logicalIndex: end, price: 20 },
        { id: 'br', type: 'point', logicalIndex: end, price: 10 },
        { id: 'bl', type: 'point', logicalIndex: start, price: 10 },
      ],
    })
  }

  /** 单锚点图元；索引决定它落在可见区间的哪一侧。 */
  function anchorAt(kind: DrawingKind, index: number): DrawingObject {
    return createDrawingObject({
      id: `${kind}-${index}`,
      kind,
      anchors: [{ id: 'a', type: 'point', logicalIndex: index, price: 10 }],
    })
  }

  /** 单个图元在当前可见区间下的图元列表。 */
  function project(drawing: DrawingObject): ReadonlyArray<DrawingPrimitive> {
    return projectSingleDrawing(drawing, false, createRangeContext(visibleRange)).primitives
  }

  it.each([
    { index: 6, visible: true },
    { index: 4, visible: true },
    { index: 3, visible: false },
    { index: 8, visible: true },
    { index: 9, visible: false },
  ])('label at index $index is visible: $visible', ({ index, visible }) => {
    expect(project(labelAt(index))).toHaveLength(visible ? 1 : 0)
  })

  it('keeps a bounded drawing that crosses the range and drops one wholly outside', () => {
    const crossing = drawingBetween('trend-line', 1, 20)
    const outside = drawingBetween('trend-line', 1, 2)

    expect(linePrimitives(project(crossing))).toHaveLength(1)
    expect(project(outside)).toHaveLength(0)
  })

  const extentCases: ReadonlyArray<{ label: string; drawing: DrawingObject; visible: boolean }> = [
    {
      label: 'an infinite horizontal line',
      drawing: anchorAt('horizontal-line', 20),
      visible: true,
    },
    {
      label: 'a vertical line outside the range',
      drawing: anchorAt('vertical-line', 20),
      visible: false,
    },
    {
      label: 'a ray extending into the range',
      drawing: anchorAt('horizontal-ray', 1),
      visible: true,
    },
    {
      label: 'a ray extending away from the range',
      drawing: anchorAt('horizontal-ray', 20),
      visible: false,
    },
    {
      label: 'a rectangle extending into the range',
      drawing: rectangleBetween(1, 2, 'right'),
      visible: true,
    },
  ]

  it.each(extentCases)('$label is projected: $visible', ({ drawing, visible }) => {
    expect(project(drawing).length > 0).toBe(visible)
  })

  it('resolves script color aliases on drawing styles', () => {
    const drawing = createTrendDrawing({ style: { stroke: '@red', strokeWidth: 1 } })
    const store = new DrawingStore({
      drawings$: createSignal<ReadonlyArray<DrawingObject>>([drawing]),
      selectedDrawingIds$: createSignal<ReadonlyArray<string>>([]),
    })
    const definitions = new DrawingDefinitionRegistry()
    registerDefaultDrawingDefinitions(definitions)
    const projection = projectDrawingsForFrame(store, definitions, createContext())
    // 投影后渲染端只见到主题色值，别名不会漏进 primitive。
    expect(linePrimitives(projection.primitives)[0]!.style.stroke).toBe(
      lightTheme.colors.scriptPalette.red,
    )
  })
})
