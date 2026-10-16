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
  createKLineData,
  createMockCanvasContext,
  type MockRenderContextOverrides,
} from '@/engine/__tests__/helpers/renderTestKit.js'
import { loadBuiltinIndicators } from '@/engine/indicators/registerBuiltins.js'
import { resolveThemeColors } from '@/foundation/tokens/index.js'
import { createPlotLayer, paintPlots } from '../impl/plotRenderer.js'
import { projectPlots } from '../impl/projectPlots.js'
import type { IndicatorPlotDefinition } from '../types.js'

beforeAll(loadBuiltinIndicators)

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
  paintPlots(state, context)
  return { ctx, context, state }
}

describe('Plot renderer', () => {
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
    expect(ctx.fillText).toHaveBeenCalledWith('★', 5, 0)
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
    expect(ctx.strokeStyle).toBe('red')
    const original = lines.slice()
    vi.mocked(ctx.lineTo).mockClear()
    paintPlots(state, { ...context, dpr: 2, range: { start: 0, end: 2 } })
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
              reverseColor: () => 'red',
            },
          ],
        },
        [1, 2],
      ),
    ).toThrow('requires price-positioned plots')
  })

  it('Arrow offset 使用目标 bar 定位，数据更新后全列幅度缓存失效', () => {
    const definition: IndicatorPlotDefinition = {
      series: [
        {
          id: 'arrow',
          kind: 'arrow',
          offset: () => 1,
          color: () => 'red',
        },
      ],
    }
    const { ctx, state, context } = paint(definition, [2, 4])
    const first = vi.mocked(ctx.moveTo).mock.calls[0]
    expect(first?.[0]).toBe(15)
    const updated = projectPlots(
      definition,
      [2, 4, 20],
      {},
      { start: 0, end: 5 },
      2,
      resolveThemeColors('light'),
    )
    const layer = createPlotLayer('ma', 'main', { instanceId: 'arrow-test' })
    const geometry = {
      data: context.data,
      range: context.range,
      kLineCenters: context.kLineCenters,
      scrollLeft: context.scrollLeft,
    }
    const originalContext = createContextWithInstanceState(ctx, 'arrow-test', state, geometry)
    vi.mocked(ctx.lineTo).mockClear()
    layer.paint(originalContext)
    const originalLines = vi.mocked(ctx.lineTo).mock.calls.slice(0, 6)
    const updatedContext = createContextWithInstanceState(ctx, 'arrow-test', updated, geometry)
    vi.mocked(ctx.lineTo).mockClear()
    layer.paint(updatedContext)
    const updatedLines = vi.mocked(ctx.lineTo).mock.calls.slice(0, 6)
    // 箭头路径覆盖完整高度，比较实际顶点而不是重复实现长度公式。
    const span = (lines: readonly (readonly [number, number])[]) =>
      Math.max(...lines.map((point) => point[1])) - Math.min(...lines.map((point) => point[1]))
    expect(span(updatedLines)).toBeLessThan(span(originalLines))
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
      paintPlots(state, { ...context, dpr: 2 })
      expect(vi.mocked(ctx.arc).mock.calls[1]).toEqual(first)
    }
    expect(new Set(fonts).size).toBe(1)
    expect(radii.every((radius, index) => index === 0 || radius > (radii[index - 1] ?? 0))).toBe(
      true,
    )
  })

  it('行情快照修订后，Shape bar 锚点缓存失效', () => {
    const collector = new PlotCollector({
      barCount: 1,
      plots: [{ name: 'signal', kind: 'shape', style: 'circle' }],
    })
    collector.onPlot('signal', 0, { value: 1 })
    const state = projectPlots(
      { source: 'collection', series: [] },
      collector.collect(),
      {},
      { start: 0, end: 1 },
      1,
      resolveThemeColors('light'),
    )
    const ctx = createMockCanvasContext()
    const data = createKLineData(1)
    const context = createContextWithInstanceState(ctx, 'shape-test', state, {
      data,
      range: { start: 0, end: 1 },
      kLineCenters: [5],
    })
    const layer = createPlotLayer('ma', 'main', { instanceId: 'shape-test' })
    layer.paint(context)
    const originalY = vi.mocked(ctx.arc).mock.calls[0]?.[1]
    layer.paint({ ...context, data: data.map((bar) => ({ ...bar, high: bar.high + 10 })) })
    expect(vi.mocked(ctx.arc).mock.calls[1]?.[1]).toBe((originalY ?? NaN) + 100)
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
      expect(x).toBe(15)
      const bar = context.data[1]
      if (!bar || !('close' in bar) || y === undefined || radius === undefined)
        throw new Error('缺少 Shape 绘制')
      if (location === 'abovebar')
        expect(y + radius).toBeLessThan(context.pane.yAxis.priceToY(bar.high))
      else expect(y - radius).toBeGreaterThan(context.pane.yAxis.priceToY(bar.low))
      expect(ctx.translate).toHaveBeenCalledWith(-10, 0)
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
    expect(ctx.arc).toHaveBeenCalledWith(5, 0, expect.any(Number), 0, Math.PI * 2)
    expect(ctx.arc).toHaveBeenCalledTimes(4)
  })

  it('collection Shape 沿用逐 bar 颜色和文字颜色，滚动重放不重新测量文字', () => {
    const collector = new PlotCollector({
      barCount: 1,
      plots: [{ name: 'signal', kind: 'shape', location: 'top', text: '买入' }],
    })
    collector.onPlot('signal', 0, { value: 1, color: 'red', textColor: 'blue' }, 'shape')
    const state = projectPlots(
      { source: 'collection', series: [] },
      collector.collect(),
      {},
      { start: 0, end: 1 },
      1,
      resolveThemeColors('light'),
    )
    const ctx = createMockCanvasContext()
    const context = createContextWithInstanceState(ctx, 'shape-test', state, {
      range: { start: 0, end: 1 },
      kLineCenters: [5],
    })
    const layer = createPlotLayer('ma', 'main', { instanceId: 'shape-test' })
    layer.paint(context)
    expect(ctx.strokeStyle).toBe('red')
    expect(ctx.fillStyle).toBe('blue')
    expect(ctx.measureText).toHaveBeenCalledTimes(1)
    layer.paint({ ...context, scrollLeft: 5 })
    expect(ctx.measureText).toHaveBeenCalledTimes(1)
    expect(ctx.translate).toHaveBeenLastCalledWith(-5, 0)
  })

  it.each([4, 5, 6, 10])('可见区间结束于 %i 时，未来云层的每个点只投影一次', (end) => {
    const definition: IndicatorPlotDefinition = {
      series: [
        { id: 'a', field: 'a', color: () => 'red' },
        { id: 'b', field: 'b', color: () => 'blue' },
      ],
      fills: [{ id: 'cloud', from: 'a', to: 'b', color: () => 'green', reverseColor: () => 'red' }],
    }
    const state = projectPlots(
      definition,
      Array.from({ length: 6 }, (_, index) => ({ a: index + 3, b: index + 1 })),
      {},
      { start: 0, end },
      1,
      resolveThemeColors('light'),
    )
    const ctx = createMockCanvasContext()
    const context = createContextWithInstanceState(ctx, 'ichimoku-test', state, {
      data: createKLineData(4),
      range: { start: 0, end },
      kLineCenters: [5, 15, 25, 35],
    })
    const priceRead = vi.spyOn(context.pane.yAxis, 'priceToY')
    const layer = createPlotLayer('ichimoku', 'main', { instanceId: 'ichimoku-test' })
    layer.paint(context)
    expect(priceRead).toHaveBeenCalledTimes(12)
    expect(ctx.lineTo).toHaveBeenCalledWith(55, context.pane.yAxis.priceToY(6))
    const count = priceRead.mock.calls.length
    layer.paint({ ...context, scrollLeft: 5 })
    expect(priceRead).toHaveBeenCalledTimes(count)
    expect(ctx.translate).toHaveBeenLastCalledWith(-5, 0)
  })

  it('空点和 NaN 断开折线，保持正确 K 线位置和滚动偏移', () => {
    const { ctx } = paint({ series: [{ id: 'close', color: () => 'red' }] }, [
      1,
      2,
      Number.NaN,
      4,
      5,
    ])
    expect(ctx.moveTo).toHaveBeenCalledTimes(2)
    expect(ctx.lineTo).toHaveBeenCalledTimes(2)
    expect(vi.mocked(ctx.moveTo).mock.calls.map(([x]) => x)).toEqual([5, 35])
    expect(ctx.translate).toHaveBeenCalledWith(-10, 0)
    expect(ctx.strokeStyle).toBe('red')
  })

  it('沿用同一份轴投影绘制柱形图，柱子包含零基准', () => {
    const { ctx, state } = paint(
      { series: [{ id: 'bar', kind: 'columns', color: () => 'red' }] },
      [-2, 3],
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
        { kBarRects: [{ x: 0, width: barWidth }] },
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
        { kBarRects: [{ x: 0, width: barWidth }] },
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
        fills: [
          { id: 'cloud', from: 'a', to: 'b', color: () => 'green', reverseColor: () => 'red' },
        ],
      },
      [
        { a: 3, b: 1 },
        { a: 4, b: 2 },
        { a: 5, b: 3 },
      ],
      { line: false },
    )
    expect(ctx.fill).toHaveBeenCalledTimes(2)
    expect(vi.mocked(ctx.lineTo).mock.calls.some(([x]) => x === 25)).toBe(true)
  })
})
