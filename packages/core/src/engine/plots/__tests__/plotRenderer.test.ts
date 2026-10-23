/** 通用 Plot 绘制测试：验证实际坐标、空点断线、颜色、柱子、散点和云层。 */

import {
  PlotCollector,
  ShapeLocation,
  ShapeSize,
  ShapeStyle,
} from '@363045841yyt/klinechart-plot-contracts'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import {
  createContextWithInstanceState,
  createMockCanvasContext,
  type MockRenderContextOverrides,
} from '@/engine/__tests__/helpers/renderTestKit.js'
import { loadBuiltinIndicators } from '@/engine/indicators/registerBuiltins.js'
import { resolveThemeColors } from '@/foundation/tokens/index.js'
import type { PaintPrimitive } from '@/rendering/primitives/types.js'
import { createCanvas2DRenderer } from '@/rendering/render/backend/createCanvas2DRenderer.js'
import { paintPlots } from '../impl/plotRenderer.js'
import { createPlotTitleInfo } from '../impl/plotTitleInfo.js'
import { projectPlots } from '../impl/projectPlots.js'
import type { IndicatorPlotDefinition, PlotFillSpec } from '../types.js'

beforeAll(loadBuiltinIndicators)

/** 公共原语已经投影到屏幕坐标，不再通过 Canvas translate 扣除滚动。 */
function screenPoints(points: number[][]): number[][] {
  return points.map(([x, y]) => [x! - 10, y!])
}

/** 从真实 Plot 投影创建绘制上下文，强制验证 Canvas 回退结果。 */
function paint(
  definition: IndicatorPlotDefinition,
  raw: unknown,
  params: Record<string, unknown> = {},
  overrides: MockRenderContextOverrides = {},
) {
  const colors = resolveThemeColors('light')
  const state = projectPlots(definition, raw, params, { start: 0, end: 5 }, 1, colors)
  const ctx = createMockCanvasContext()
  const context = createContextWithInstanceState(ctx, 'plot-test', state, {
    range: { start: 0, end: 5 },
    kLineCenters: [5, 15, 25, 35, 45],
    scrollLeft: 10,
    kBarRects: Array.from({ length: 5 }, (_, index) => ({ x: index * 10, width: 8 })),
    ...overrides,
  })
  paintPlots(state, { ...context, measureContext: ctx })
  return { ctx, context, state }
}

describe('Plot renderer', () => {
  it('有数据变换时仍在上层将折线价格投影为屏幕坐标', () => {
    const submit = vi.fn(() => true)
    const transform = { offsetX: 10, yScale: 10, yOffset: 0 }
    const { ctx } = paint(
      { series: [{ id: 'comparison', color: () => 'yellow' }] },
      [4.25, 4.5],
      {},
      {
        dataTransform: transform,
        sceneRenderer: { ...createCanvas2DRenderer(), primitives: { paint: submit, dispose() {} } },
      },
    )
    expect(submit).toHaveBeenCalledExactlyOnceWith(
      ctx,
      [
        expect.objectContaining({
          kind: 'stroke',
          paths: [
            [
              { x: 5, y: 42.5 },
              { x: 15, y: 45 },
            ],
          ],
          offsetX: 10,
        }),
      ],
      1,
      transform,
    )
  })

  it.each([
    { values: [10, 100], min: 0, max: 105 },
    { values: [-100, -10], min: -105, max: 0 },
    { values: [-100, 100], min: -110, max: 110 },
  ])('柱体基线边界保留单侧留白：$values', ({ values, min, max }) => {
    const { state } = paint(
      { series: [{ id: 'vol', kind: 'columns', color: () => 'blue' }] },
      values,
    )
    expect(state.valueMin).toBe(min)
    expect(state.valueMax).toBe(max)
  })

  it('submits fill, line and points in one ordered backend batch', () => {
    const submit = vi.fn(() => true)
    const { ctx } = paint(
      {
        series: [
          { id: 'a', field: 'a', color: () => 'red' },
          { id: 'b', field: 'b', kind: 'points', color: () => 'blue' },
        ],
        fills: [{ id: 'cloud', from: 'a', to: 'b', color: () => 'green' }],
      },
      [
        { a: 1, b: 3 },
        { a: 2, b: 4 },
      ],
      {},
      {
        sceneRenderer: { ...createCanvas2DRenderer(), primitives: { paint: submit, dispose() {} } },
      },
    )
    expect(submit).toHaveBeenCalledExactlyOnceWith(
      ctx,
      [
        expect.objectContaining({ kind: 'fill', offsetX: 10 }),
        expect.objectContaining({
          kind: 'stroke',
          paths: [
            [
              { x: 5, y: 10 },
              { x: 15, y: 20 },
            ],
          ],
          offsetX: 10,
        }),
        expect.objectContaining({ kind: 'circle', x: -5, y: 30 }),
        expect.objectContaining({ kind: 'circle', x: 5, y: 40 }),
      ],
      1,
      undefined,
    )
    expect(ctx.stroke).not.toHaveBeenCalled()
    expect(ctx.fill).not.toHaveBeenCalled()
  })

  it.each(['stepline', 'steplinebr'] as const)('%s 在中点跳变并按类型处理连续空点', (kind) => {
    const { ctx } = paint({ series: [{ id: 'step', kind, color: () => 'blue' }] }, [
      1,
      2,
      null,
      NaN,
      5,
    ])
    expect(vi.mocked(ctx.moveTo).mock.calls).toEqual(screenPoints([[5, 10]]))
    const firstStep = [
      [10, 10],
      [10, 20],
      [15, 20],
    ]
    expect(vi.mocked(ctx.lineTo).mock.calls).toEqual(
      screenPoints(
        kind === 'steplinebr' ? firstStep : [...firstStep, [30, 20], [30, 50], [45, 50]],
      ),
    )
  })

  it.each(['stepline', 'steplinebr'] as const)(
    '%s 保留偏移、逐点颜色、虚线、尺寸和同值平台',
    (kind) => {
      const { ctx, state } = paint(
        {
          series: [
            {
              id: 'step',
              kind,
              color: () => 'blue',
              pointColor: (value) => (value === 3 ? 'red' : 'blue'),
              offset: () => 1,
              dash: [4, 2],
              size: ShapeSize.Large,
            },
          ],
        },
        [1, 3, 3, 0],
      )
      expect(vi.mocked(ctx.moveTo).mock.calls).toEqual(
        screenPoints([
          [15, 10],
          [35, 30],
        ]),
      )
      expect(vi.mocked(ctx.lineTo).mock.calls).toEqual(
        screenPoints([
          [20, 10],
          [20, 30],
          [25, 30],
          [35, 30],
          [40, 30],
          [40, 0],
          [45, 0],
        ]),
      )
      expect(ctx.setLineDash).toHaveBeenCalledWith([4, 2])
      expect(ctx.lineWidth).toBe(3)
      expect(ctx.strokeStyle).toBe('blue')
      expect(state.visibleMin).toBe(0)
      expect(state.visibleMax).toBe(3)
    },
  )

  it('断线阶梯线在空点后重新开始，孤立点不生成线段', () => {
    const definition: IndicatorPlotDefinition = {
      series: [{ id: 'step', kind: 'steplinebr', color: () => 'blue' }],
    }
    const { ctx } = paint(definition, [1, 2, null, 4, 5])
    expect(vi.mocked(ctx.moveTo).mock.calls).toEqual(
      screenPoints([
        [5, 10],
        [35, 40],
      ]),
    )
    expect(vi.mocked(ctx.lineTo).mock.calls).toEqual(
      screenPoints([
        [10, 10],
        [10, 20],
        [15, 20],
        [40, 40],
        [40, 50],
        [45, 50],
      ]),
    )
    expect(paint(definition, [NaN, 1, null]).ctx.stroke).not.toHaveBeenCalled()
  })

  it.each([undefined, 'line', 'linebr'] as const)('折线 kind=%s 控制连续空点两侧的连接', (kind) => {
    const { ctx, state } = paint({ series: [{ id: 'line', kind, color: () => 'blue' }] }, [
      1,
      2,
      null,
      NaN,
      5,
    ])
    expect(state.plots[0]).toMatchObject({ kind: kind ?? 'line' })
    expect(vi.mocked(ctx.moveTo).mock.calls).toEqual(screenPoints([[5, 10]]))
    expect(vi.mocked(ctx.lineTo).mock.calls).toEqual(
      screenPoints(
        kind === 'linebr'
          ? [[15, 20]]
          : [
              [15, 20],
              [45, 50],
            ],
      ),
    )
  })

  it('跨空值连接保留逐点颜色，并且不为首尾空点生成线段', () => {
    const collector = new PlotCollector({ barCount: 5 })
    const declaration = { name: 'line', kind: 'line' } as const
    collector.onPlot('line', 0, null, 'line', declaration)
    collector.onPlot('line', 1, { value: 2, color: 'blue' }, 'line', declaration)
    collector.onPlot('line', 2, null, 'line', declaration)
    collector.onPlot('line', 3, { value: 4, color: 'red' }, 'line', declaration)
    collector.onPlot('line', 4, null, 'line', declaration)
    const { ctx } = paint({ source: 'collection', series: [] }, collector.collect())
    expect(vi.mocked(ctx.moveTo).mock.calls).toEqual(screenPoints([[15, 20]]))
    expect(vi.mocked(ctx.lineTo).mock.calls).toEqual(screenPoints([[35, 40]]))
    expect(ctx.strokeStyle).toBe('red')
  })

  it('OHLC 的 showLast、位移、自动缩放和四价格图例使用同一数据范围', () => {
    const collector = new PlotCollector({ barCount: 3 })
    for (let index = 0; index < 3; index++) {
      collector.onOhlc({ name: 'candles', kind: 'candle', showLast: 1, offset: 1 }, index, {
        open: 2,
        high: index === 2 ? 8 : 1000,
        low: index === 2 ? 1 : -1000,
        close: 6,
        color: null,
        borderColor: 'blue',
        wickColor: 'gray',
      })
    }
    const { state, ctx, context } = paint(
      { source: 'collection', series: [] },
      collector.collect(),
      {},
      {
        pane: { yAxis: { priceToY: (price) => 100 - price * 10 } },
        kWidthPx: 9,
      },
    )
    expect(state.visibleMin).toBe(1)
    expect(state.visibleMax).toBe(8)
    // 只绘制最后一根：四条边框和两段影线，没有背景填充。
    expect(ctx.fillRect).toHaveBeenCalledTimes(6)
    expect(ctx.fillStyle).toBe('gray')
    const reader = context.indicatorStateReader
    if (!reader) throw new Error('Missing Plot state reader')
    const title = createPlotTitleInfo('OHLC')
    const readTitle = (index: number) =>
      title([], index, {}, reader, 'plot-test', 'main', resolveThemeColors('light'))
    expect(readTitle(2)).toBeNull()
    expect(readTitle(3)?.values).toEqual([
      { label: 'candles O', value: 2, color: 'blue' },
      { label: 'candles H', value: 8, color: 'blue' },
      { label: 'candles L', value: 1, color: 'blue' },
      { label: 'candles C', value: 6, color: 'blue' },
    ])
    const outside = projectPlots(
      { source: 'collection', series: [] },
      collector.collect(),
      {},
      { start: 0, end: 3 },
      1,
      resolveThemeColors('light'),
    )
    expect(outside.visibleMin).toBe(Infinity)
    expect(outside.visibleMax).toBe(-Infinity)
  })

  it('美国线输出高低竖线和左开右收横线，忽略空点', () => {
    const collector = new PlotCollector({ barCount: 2 })
    collector.onOhlc({ name: 'bars', kind: 'bar' }, 0, undefined)
    collector.onOhlc({ name: 'bars', kind: 'bar' }, 1, {
      open: 3,
      high: 8,
      low: 1,
      close: 6,
      color: 'green',
      wickColor: 'green',
      borderColor: 'green',
    })
    const { state, ctx } = paint(
      { source: 'collection', series: [] },
      collector.collect(),
      {},
      {
        pane: { yAxis: { priceToY: (price) => 100 - price * 10 } },
        kWidthPx: 9,
      },
    )
    expect(state.visibleMin).toBe(1)
    expect(state.visibleMax).toBe(8)
    const rects = vi.mocked(ctx.fillRect).mock.calls
    expect(rects).toHaveLength(3)
    const [stem, open, close] = rects
    if (!stem || !open || !close) throw new Error('Missing OHLC geometry')
    expect(open[0] + open[2]).toBe(stem[0])
    expect(close[0]).toBe(stem[0] + stem[2])
    expect(open[1]).toBe(70)
    expect(close[1]).toBe(40)
  })

  it('Char 相对定位过滤零值，absolute 的零值参与价格轴', () => {
    const { ctx, state } = paint(
      {
        series: [
          {
            id: 'relative',
            kind: 'char',
            char: '▲',
            location: 'top',
            field: 'signal',
            color: () => 'red',
          },
          {
            id: 'absolute',
            kind: 'char',
            char: '★',
            location: 'absolute',
            field: 'price',
            color: () => 'blue',
          },
        ],
      },
      [
        { signal: 0, price: 0 },
        { signal: 1, price: 12 },
      ],
    )
    expect(vi.mocked(ctx.fillText).mock.calls.map(([text]) => text)).toEqual(['▲', '★', '★'])
    expect(ctx.fillText).toHaveBeenCalledWith('★', -5, 0)
    expect(state.visibleMin).toBe(0)
    expect(state.visibleMax).toBe(12)
  })

  it('Char size 控制字符字号，空字符可以只显示附加文字', () => {
    const fonts: string[] = []
    for (const size of [ShapeSize.Small, ShapeSize.Large]) {
      const { ctx } = paint(
        {
          series: [
            { id: 'char', kind: 'char', char: '🠅', location: 'top', size, color: () => 'red' },
          ],
        },
        [true],
      )
      expect(ctx.fillText).toHaveBeenCalledTimes(1)
      fonts.push(ctx.font)
    }
    expect(fonts[0]).not.toBe(fonts[1])
    const { ctx } = paint(
      {
        series: [
          { id: 'text', kind: 'char', char: '', text: '买入', location: 'top', color: () => 'red' },
        ],
      },
      [true],
    )
    expect(ctx.fillText).toHaveBeenCalledTimes(1)
    expect(vi.mocked(ctx.fillText).mock.calls[0]?.[0]).toBe('买入')
  })

  it('Arrow 使用可见范围外的最大幅度，过滤零和 NaN，正负方向及高度正确', () => {
    const { ctx, state, context } = paint(
      {
        series: [
          {
            id: 'arrow',
            kind: 'arrow',
            colorUp: 'green',
            colorDown: 'red',
            color: () => 'blue',
          },
        ],
      },
      [0.01, 2, -4, 0, NaN, 10],
    )
    expect(state.visibleMin).toBe(Infinity)
    expect(state.visibleMax).toBe(-Infinity)
    const starts = vi.mocked(ctx.moveTo).mock.calls
    const lines = vi.mocked(ctx.lineTo).mock.calls
    expect(starts).toHaveLength(3)
    const heights = starts.map((start, index) => {
      const ys = [start[1], ...lines.slice(index * 6, index * 6 + 6).map((point) => point[1])]
      return Math.max(...ys) - Math.min(...ys)
    })
    // 头部高度恒定：三个箭头无论长短，头部都是同一个尺寸。
    const headHeights = starts.map((start, index) => {
      const base = lines[index * 6]
      return Math.abs((base?.[1] ?? NaN) - (start[1] ?? NaN))
    })
    expect(headHeights[1]).toBeCloseTo(headHeights[0] ?? NaN, 5)
    expect(headHeights[2]).toBeCloseTo(headHeights[0] ?? NaN, 5)
    // 长度按幅度归一化；被托底的最短箭头就是一个完整的头，杆长为 0。
    expect(heights[1]).toBeCloseTo(10, 5)
    expect(heights[2]).toBeCloseTo(20, 5)
    expect(heights[0]).toBeCloseTo(headHeights[0] ?? NaN, 5)
    // 正箭头尖端最靠近 bar，负箭头尖端位于最下方。
    expect(starts[0]?.[1]).toBeLessThan(lines[0]?.[1] ?? NaN)
    expect(starts[2]?.[1]).toBeGreaterThan(lines[12]?.[1] ?? NaN)
    expect(ctx.fillStyle).toBe('red')
    const original = lines.slice()
    vi.mocked(ctx.lineTo).mockClear()
    paintPlots(state, { ...context, measureContext: ctx, dpr: 2, range: { start: 0, end: 2 } })
    expect(vi.mocked(ctx.lineTo).mock.calls).toEqual(original.slice(0, 12))
  })

  it('Arrow 头部始终是等边三角形，数值只改变杆身长度', () => {
    // 单点序列的幅度等于自身，箭头总长由 size 档位决定，头部固定。
    const geometryOf = (size: ShapeSize) => {
      const { ctx } = paint(
        {
          series: [
            {
              id: 'arrow',
              kind: 'arrow',
              size,
              color: () => 'red',
            },
          ],
        },
        [1],
      )
      const calls = [vi.mocked(ctx.moveTo).mock.calls[0], ...vi.mocked(ctx.lineTo).mock.calls]
      return calls.map(([x, y]) => ({ x, y }))
    }
    // 头部 = 尖端到两底角；等边三角形满足 高 = 半宽 × √3。
    const headShape = (points: readonly { x: number; y: number }[]) => {
      const tip = points[0]
      const base = points[1]
      if (!tip || !base) throw new Error('缺少箭头头部顶点')
      return { half: Math.abs(base.x - tip.x), height: Math.abs(base.y - tip.y) }
    }
    for (const points of [geometryOf('tiny'), geometryOf('normal'), geometryOf('huge')]) {
      const { half, height } = headShape(points)
      expect(height / half).toBeCloseTo(Math.sqrt(3), 5)
    }
    // 头部尺寸恒定：不同 size 档位共用同一个头。
    const headHalf = headShape(geometryOf('tiny')).half
    for (const points of [geometryOf('small'), geometryOf('normal'), geometryOf('huge')]) {
      expect(headShape(points).half).toBeCloseTo(headHalf, 5)
    }
    // 杆长 = 总长 − 头高，随 size 档位单调增长。
    const shaft = (points: readonly { x: number; y: number }[]) => {
      const ys = points.map((point) => point.y)
      return Math.max(...ys) - Math.min(...ys) - headShape(points).height
    }
    expect(shaft(geometryOf('huge'))).toBeGreaterThan(shaft(geometryOf('normal')))
    expect(shaft(geometryOf('normal'))).toBeGreaterThan(shaft(geometryOf('small')))
    expect(shaft(geometryOf('huge'))).toBeGreaterThan(0)
  })

  it.each([1, -1])('方向 %s 的箭头在小缩放下使用短折线头和贯通杆线', (value) => {
    const arrow = (overrides: MockRenderContextOverrides) =>
      paint(
        {
          series: [{ id: 'arrow', kind: 'arrow', size: 'normal', color: () => 'red' }],
        },
        [value],
        {},
        overrides,
      )
    /** 取第 index 次调用的坐标；图表按 moveTo 开新路径，各路径的 lineTo 紧随其后。 */
    const call = (calls: readonly (readonly number[])[], index: number) => {
      const value = calls[index]
      if (!value) throw new Error(`缺少第 ${index} 次调用`)
      return { x: value[0] ?? NaN, y: value[1] ?? NaN }
    }
    // 线框：∧ 头部与杆身是两条开放路径，一次描边画完，不填充也不闭合。
    const outline = arrow({ zoomLevel: 1, zoomLevelCount: 80 })
    const outlineMoveTo = vi.mocked(outline.ctx.moveTo).mock.calls
    const outlineLineTo = vi.mocked(outline.ctx.lineTo).mock.calls
    expect(outlineMoveTo).toHaveLength(2)
    expect(outlineLineTo).toHaveLength(3)
    expect(outline.ctx.stroke).toHaveBeenCalledTimes(1)
    expect(outline.ctx.fill).not.toHaveBeenCalled()
    expect(outline.ctx.closePath).not.toHaveBeenCalled()
    // 头部仍是等边三角形：高 ÷ 半宽 = √3。
    const tip = call(outlineLineTo, 0)
    const headCorner = call(outlineMoveTo, 0)
    expect(Math.abs(headCorner.y - tip.y) / Math.abs(headCorner.x - tip.x)).toBeCloseTo(
      Math.sqrt(3),
      5,
    )
    // 杆身从头部顶点一直连到尾端，是一条竖直线。
    const stemTop = call(outlineMoveTo, 1)
    expect(stemTop.x).toBe(tip.x)
    expect(stemTop.y).toBe(tip.y)
    expect(call(outlineLineTo, 2).x).toBe(tip.x)
    // 实心：头部与矩形杆拼成一条闭合多边形，一次填充。
    const solid = arrow({ zoomLevel: 80, zoomLevelCount: 80 })
    const solidMoveTo = vi.mocked(solid.ctx.moveTo).mock.calls
    const solidLineTo = vi.mocked(solid.ctx.lineTo).mock.calls
    expect(solidMoveTo).toHaveLength(1)
    expect(solidLineTo).toHaveLength(6)
    expect(solid.ctx.fill).toHaveBeenCalledTimes(1)
    expect(solid.ctx.stroke).not.toHaveBeenCalled()
    // 实心杆宽为 4px，占 8px 头宽的一半。
    expect(Math.abs(call(solidLineTo, 1).x - call(solidLineTo, 3).x)).toBeCloseTo(4, 5)
    // 线框头比实心头更短：两种模式都等边，但线框用更小的头。
    const solidTip = call(solidMoveTo, 0)
    const solidHeadCorner = call(solidLineTo, 0)
    expect(Math.abs(headCorner.x - tip.x)).toBeLessThan(Math.abs(solidHeadCorner.x - solidTip.x))
    // 上下文没有缩放信息时按已放大处理，保持实心。
    expect(arrow({}).ctx.fill).toHaveBeenCalledTimes(1)
  })

  it('全零或空 Arrow 序列不产生无效几何', () => {
    const { ctx } = paint({ series: [{ id: 'empty', kind: 'arrow', color: () => 'red' }] }, [
      0,
      NaN,
      0,
    ])
    expect(ctx.moveTo).not.toHaveBeenCalled()
    expect(ctx.fill).not.toHaveBeenCalled()
  })

  it('fill 沿两条折线绘制带状区域，同色区域一次提交', () => {
    const collector = new PlotCollector({ barCount: 3 })
    const values = [
      [10, 8],
      [8, 10],
      [6, 12],
    ]
    values.forEach(([a, b], index) => {
      collector.onPlot('fast', index, { value: a })
      collector.onPlot('slow', index, { value: b })
      collector.onFill(
        { name: 'cloud', from: 'fast', to: 'slow', color: index === 1 ? 'green' : 'red' },
        index,
      )
    })
    const ctx = createMockCanvasContext()
    const styles: unknown[] = []
    vi.mocked(ctx.fill).mockImplementation(() => {
      styles.push(ctx.fillStyle)
    })
    const state = projectPlots(
      { source: 'collection', series: [] },
      collector.collect(),
      {},
      { start: 0, end: 3 },
      1,
      resolveThemeColors('light'),
    )
    const context = createContextWithInstanceState(ctx, 'fill-color-test', state, {
      // 真实价格轴向上为小 y；夹具默认映射与屏幕方向相反，这里显式覆盖。
      pane: { yAxis: { priceToY: (price) => 100 - price } },
      range: { start: 0, end: 3 },
      kLineCenters: [5, 15, 25],
      kBarRects: [
        { x: 0, width: 8 },
        { x: 10, width: 8 },
        { x: 20, width: 8 },
      ],
    })
    paintPlots(state, { ...context, measureContext: ctx })
    expect(styles).toEqual(['green', 'red'])
    expect(ctx.fillRect).not.toHaveBeenCalled()
    expect(ctx.moveTo).toHaveBeenCalledWith(5, 90)
    expect(ctx.lineTo).toHaveBeenCalledWith(10, 91)
    expect(ctx.lineTo).toHaveBeenCalledWith(25, 94)
  })

  it('原生 fill 逐 bar 求色，null 和缺失边界不绘制，颜色 alpha 不再叠加透明度', () => {
    const color = vi.fn<PlotFillSpec['color']>((_colors, from, to, index) => {
      if (index === 2 || from === undefined || to === undefined) return null
      return '#00897b26'
    })
    const { ctx, state } = paint(
      {
        series: [
          { id: 'a', field: 'a', color: () => 'red' },
          { id: 'b', field: 'b', color: () => 'blue' },
        ],
        fills: [{ id: 'cloud', from: 'a', to: 'b', color }],
      },
      [
        { a: 1, b: 3 },
        { a: 4, b: 2 },
        { a: 2, b: 4 },
        { a: null, b: 3 },
        { a: 5, b: 2 },
      ],
    )
    expect(color.mock.calls.map(([, from, to, index]) => [from, to, index])).toEqual([
      [1, 3, 0],
      [4, 2, 1],
      [2, 4, 2],
      [undefined, 3, 3],
      [5, 2, 4],
    ])
    expect(state.fills[0]?.colors).toEqual(['#00897b26', '#00897b26', null, null, '#00897b26'])
    expect(ctx.fill).toHaveBeenCalledTimes(1)
    expect(ctx.fillRect).not.toHaveBeenCalled()
    expect(ctx.fillStyle).toBe('#00897b26')
    expect(ctx.globalAlpha).toBe(1)
  })

  it('位移填充按 Plot.data 下标取色，颜色分界与未来槽位都对得上', () => {
    const submit = vi.fn<
      (context: unknown, commands: readonly PaintPrimitive[], dpr: number) => boolean
    >(() => true)
    paint(
      {
        series: [
          { id: 'a', field: 'a', color: () => 'blue', offset: () => 2 },
          { id: 'b', field: 'b', color: () => 'blue', offset: () => 2 },
        ],
        fills: [
          {
            id: 'cloud',
            from: 'a',
            to: 'b',
            color: (_colors, from, to) =>
              from !== undefined && to !== undefined && from > to ? 'red' : 'green',
          },
        ],
      },
      [
        { a: 1, b: 5 },
        { a: 2, b: 4 },
        { a: 3, b: 3 },
        { a: 4, b: 2 },
        { a: 5, b: 1 },
      ],
      {},
      {
        range: { start: 0, end: 8 },
        kLineCenters: [-5, 5, 15, 25, 35, 45, 55, 65],
        sceneRenderer: { ...createCanvas2DRenderer(), primitives: { paint: submit, dispose() {} } },
      },
    )
    const spans = submit.mock.calls[0]![1].filter((command) => command.kind === 'fill').map(
      (command) => {
        const xs = command.paths.flat().map((point) => point.x)
        return [command.color, Math.min(...xs), Math.max(...xs)]
      },
    )
    // 源 bar 2 处相交，显示位置后移 2 格：绿色到 35，红色从 35 一直续到未来槽位 55。
    expect(spans).toEqual([
      ['green', 15, 35],
      ['red', 35, 55],
    ])
  })

  it('填充与折线共享屏幕投影，数据变换不会重复应用', () => {
    const submit = vi.fn<
      (context: unknown, commands: readonly PaintPrimitive[], dpr: number) => boolean
    >(() => true)
    paint(
      {
        series: [
          { id: 'a', field: 'a', color: () => 'blue' },
          { id: 'b', field: 'b', color: () => 'blue' },
        ],
        fills: [{ id: 'cloud', from: 'a', to: 'b', color: () => 'green' }],
      },
      [
        { a: 1, b: 3 },
        { a: 2, b: 4 },
      ],
      {},
      {
        dataTransform: { offsetX: 10, yScale: 2, yOffset: 5 },
        sceneRenderer: { ...createCanvas2DRenderer(), primitives: { paint: submit, dispose() {} } },
      },
    )
    const fill = submit.mock.calls[0]![1].find((command) => command.kind === 'fill')
    if (!fill || fill.kind !== 'fill') throw new Error('缺少填充原语')
    expect(fill).toMatchObject({ band: true, offsetX: 10 })
    expect(fill).not.toHaveProperty('dataSpace')
    expect(fill.paths[0]!.map((point) => point.y)).toEqual([10, 20, 40, 30])
    const strokes = submit.mock.calls[0]![1].filter((command) => command.kind === 'stroke')
    expect(strokes).toHaveLength(2)
    for (const stroke of strokes) expect(stroke).not.toHaveProperty('dataSpace')
  })

  it.each(['char', 'arrow'] as const)('%s 相对标记不能作为 fill 端点', (kind) => {
    expect(() =>
      paint(
        {
          series: [
            { id: 'marker', kind, color: () => 'red' },
            { id: 'line', color: () => 'blue' },
          ],
          fills: [
            {
              id: 'fill',
              from: 'marker',
              to: 'line',
              color: () => 'green',
            },
          ],
        },
        [1, 2],
      ),
    ).toThrow('requires price-positioned plots')
  })

  it('Shape size 只改变形状尺寸，DPR 不重复缩放 CSS 坐标和文字', () => {
    const sizes = Object.values(ShapeSize).filter((size) => size !== ShapeSize.Auto)
    const radii: number[] = []
    const fonts: string[] = []
    for (const size of sizes) {
      const { ctx, state, context } = paint(
        {
          series: [
            {
              id: 'signal',
              kind: 'shape',
              style: 'circle',
              location: 'top',
              size,
              text: '信号',
              color: () => 'red',
            },
          ],
        },
        [true],
      )
      const first = vi.mocked(ctx.arc).mock.calls[0]
      if (!first) throw new Error('缺少圆形绘制')
      radii.push(first[2])
      fonts.push(ctx.font)
      paintPlots(state, { ...context, measureContext: ctx, dpr: 2 })
      expect(vi.mocked(ctx.arc).mock.calls[1]).toEqual(first)
    }
    expect(new Set(fonts).size).toBe(1)
    expect(radii.every((radius, index) => index === 0 || radius > (radii[index - 1] ?? 0))).toBe(
      true,
    )
  })

  it.each(Object.values(ShapeStyle))('Shape %s 相对定位：false、NaN 和 0 不画', (style) => {
    const { ctx, state } = paint(
      { series: [{ id: 'signal', kind: 'shape', style, location: 'top', color: () => 'red' }] },
      [true, false, Number.NaN, 0, -2],
    )
    expect(state.visibleMin).toBe(Infinity)
    expect(state.visibleMax).toBe(-Infinity)
    const draws = vi.mocked(ctx.stroke).mock.calls.length + vi.mocked(ctx.fill).mock.calls.length
    expect(draws).toBe(2)
    for (const calls of [vi.mocked(ctx.moveTo).mock.calls, vi.mocked(ctx.lineTo).mock.calls]) {
      expect(calls.flat().every(Number.isFinite)).toBe(true)
    }
  })

  it.each([ShapeLocation.AboveBar, ShapeLocation.BelowBar])(
    'Shape %s 使用偏移后的 K 线而不是条件值定位',
    (location) => {
      const { ctx, context } = paint(
        {
          series: [
            {
              id: 'signal',
              kind: 'shape',
              style: 'circle',
              location,
              offset: () => 1,
              color: () => 'red',
            },
          ],
        },
        [1],
      )
      const [x, y, radius] = vi.mocked(ctx.arc).mock.calls[0] ?? []
      expect(x).toBe(5)
      const bar = context.data[1]
      if (!bar || !('close' in bar) || y === undefined || radius === undefined)
        throw new Error('缺少 Shape 绘制')
      if (location === 'abovebar')
        expect(y + radius).toBeLessThan(context.pane.yAxis.priceToY(bar.high))
      else expect(y - radius).toBeGreaterThan(context.pane.yAxis.priceToY(bar.low))
      expect(ctx.translate).not.toHaveBeenCalled()
    },
  )

  it.each([ShapeLocation.Top, ShapeLocation.Bottom])(
    'Shape %s 不依赖价格轴且文字保持在 pane 内',
    (location) => {
      const { ctx, context } = paint(
        {
          series: [
            {
              id: 'signal',
              kind: 'shape',
              style: 'labelup',
              location,
              text: '买入\n信号',
              color: () => 'red',
              textColor: 'blue',
            },
          ],
        },
        [true],
      )
      expect(ctx.fillText).toHaveBeenCalledTimes(2)
      expect(ctx.fillStyle).toBe('blue')
      for (const [, , y] of vi.mocked(ctx.fillText).mock.calls) {
        expect(y).toBeGreaterThan(0)
        expect(y).toBeLessThan(context.pane.height)
      }
    },
  )

  it('absolute Shape 的零值是价格，参与范围计算；相对 Shape 条件不参与范围', () => {
    const { ctx, state } = paint(
      {
        series: [
          {
            id: 'price',
            kind: 'shape',
            style: 'circle',
            location: 'absolute',
            field: 'price',
            color: () => 'red',
          },
          {
            id: 'condition',
            kind: 'shape',
            style: 'circle',
            location: 'top',
            field: 'condition',
            color: () => 'blue',
          },
        ],
      },
      [
        { price: 0, condition: 10000 },
        { price: 12, condition: -10000 },
      ],
    )
    expect(state.visibleMin).toBe(0)
    expect(state.visibleMax).toBe(12)
    expect(ctx.arc).toHaveBeenCalledWith(-5, 0, expect.any(Number), 0, Math.PI * 2)
    expect(ctx.arc).toHaveBeenCalledTimes(4)
  })

  it('LineBR 遇到空点和 NaN 断线，保持正确 K 线位置和滚动偏移', () => {
    const { ctx } = paint({ series: [{ id: 'close', kind: 'linebr', color: () => 'red' }] }, [
      1,
      2,
      Number.NaN,
      4,
      5,
    ])
    expect(ctx.moveTo).toHaveBeenCalledTimes(2)
    expect(ctx.lineTo).toHaveBeenCalledTimes(2)
    expect(vi.mocked(ctx.moveTo).mock.calls.map(([x]) => x)).toEqual([-5, 25])
    expect(ctx.translate).not.toHaveBeenCalled()
    expect(ctx.strokeStyle).toBe('red')
  })

  it('沿用同一份轴投影绘制柱形图，柱子包含零基准', () => {
    const { ctx, state } = paint(
      { series: [{ id: 'bar', kind: 'columns', color: () => 'red' }] },
      [-2, 3],
      {},
      // 柱宽与基线断言不验证滚动：几何留在视口内，避免被 Canvas 矩形剔除。
      { scrollLeft: 0 },
    )
    expect(ctx.fillRect).toHaveBeenCalledTimes(2)
    expect(state.visibleMin).toBe(-2)
    expect(state.visibleMax).toBe(3)
  })

  it('columns 柱宽跟随 K 线实体宽度，size 不生效', () => {
    const widths = (barWidth: number) => {
      const { ctx } = paint(
        { series: [{ id: 'bar', kind: 'columns', size: ShapeSize.Huge, color: () => 'red' }] },
        [1],
        {},
        { kBarRects: [{ x: 0, width: barWidth }], scrollLeft: 0 },
      )
      return vi.mocked(ctx.fillRect).mock.calls.map(([, , width]) => width)
    }
    expect(widths(8)).toEqual([8])
    expect(widths(40)).toEqual([40])
  })

  it('histogram 柱宽为固定逻辑像素，不随 K 线间距缩放', () => {
    const widths = (barWidth: number) => {
      const { ctx } = paint(
        { series: [{ id: 'bar', kind: 'histogram', size: 3, color: () => 'red' }] },
        [1],
        {},
        { kBarRects: [{ x: 0, width: barWidth }], scrollLeft: 0 },
      )
      return vi.mocked(ctx.fillRect).mock.calls.map(([, , width]) => width)
    }
    expect(widths(8)).toEqual([3])
    expect(widths(40)).toEqual([3])
  })

  it('histogram 档位映射为固定像素，auto/tiny/small 为 1px', () => {
    const widthOf = (size: ShapeSize) => {
      const { ctx } = paint(
        { series: [{ id: 'bar', kind: 'histogram', size, color: () => 'red' }] },
        [1],
        {},
        { scrollLeft: 0 },
      )
      return vi.mocked(ctx.fillRect).mock.calls[0]?.[2]
    }
    expect([ShapeSize.Auto, ShapeSize.Tiny, ShapeSize.Small].map(widthOf)).toEqual([1, 1, 1])
    expect([ShapeSize.Normal, ShapeSize.Large, ShapeSize.Huge].map(widthOf)).toEqual([2, 3, 4])
  })

  it('散点只画圆，不连接数据，直径由 size 档位决定', () => {
    const { ctx } = paint(
      { series: [{ id: 'sar', kind: 'points', size: ShapeSize.Large, color: () => 'red' }] },
      [1, undefined, 3],
    )
    expect(ctx.arc).toHaveBeenCalledTimes(2)
    expect(ctx.lineTo).not.toHaveBeenCalled()
    expect(vi.mocked(ctx.arc).mock.calls[0]?.[2]).toBe(10)
  })

  it('隐藏边界线后云层仍绘制，填充包含最后一个点', () => {
    const { ctx } = paint(
      {
        series: [
          { id: 'a', field: 'a', show: 'line', color: () => 'red' },
          { id: 'b', field: 'b', show: 'line', color: () => 'blue' },
        ],
        fills: [{ id: 'cloud', from: 'a', to: 'b', color: () => 'green' }],
      },
      [
        { a: 3, b: 1 },
        { a: 4, b: 2 },
        { a: 5, b: 3 },
      ],
      { line: false },
    )
    expect(ctx.fill).toHaveBeenCalledTimes(1)
    expect(ctx.fillRect).not.toHaveBeenCalled()
    expect(vi.mocked(ctx.lineTo).mock.calls.some(([x]) => x === 15)).toBe(true)
  })
})
