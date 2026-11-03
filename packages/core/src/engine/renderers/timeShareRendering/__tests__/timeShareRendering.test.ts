/** 分时行为回归：真实帧输入的涨跌交点、断段、基准缺失及缓存更新。 */
import { describe, expect, it, vi } from 'vitest'
import { createMockCanvasContext } from '@/engine/__tests__/helpers/renderTestKit.js'
import {
  createTimeShareDayGeometry,
  createTimeShareRenderContext,
  createTimeShareSegment,
} from '@/engine/__tests__/helpers/timeShareTestKit.js'
import { ChartDataViewId } from '@/foundation/types/chartView.js'
import type { PaintPrimitive } from '@/rendering/primitives/types.js'
import { createFiveDayTimeShareLayer } from '../../fiveDayTimeShare.js'
import { createTimeShareLayer } from '../../timeShare.js'

/** 复用共享帧夹具，去掉 ctx，只暴露 Scene 的原语提交入口。 */
function frame() {
  const { ctx, ...context } = createTimeShareRenderContext({
    ctx: createMockCanvasContext(),
    centers: [10, 30, 50],
    data: [
      { timestamp: 1, price: 11, average: 10.5 },
      { timestamp: 2, price: 9, average: 9.5 },
      { timestamp: 3, price: 11, average: 10.5 },
    ],
  })
  const primitives = vi.fn<(commands: readonly PaintPrimitive[], dpr: number) => void>()
  return { ...context, dataRevision: 1, primitives, paneId: 'main', clear: false }
}

/** 取业务折线，参考虚线不参与段连接断言。 */
function lines(commands: readonly PaintPrimitive[]) {
  return commands.filter((command) => command.kind === 'stroke').filter((line) => !line.dash)
}

/** 面积总量是外部行为，避免用完整顶点数组复刻投影算法。 */
function area(paths: readonly (readonly { x: number; y: number }[])[]): number {
  return paths.reduce((total, path) => {
    const signed = path.reduce((sum, point, index) => {
      const next = path[(index + 1) % path.length]!
      return sum + point.x * next.y - next.x * point.y
    }, 0)
    return total + Math.abs(signed) / 2
  }, 0)
}

describe.each([
  [ChartDataViewId.TimeShare, createTimeShareLayer],
  [ChartDataViewId.FiveDayTimeShare, createFiveDayTimeShareLayer],
] as const)('%s 分时原语绘制', (dataView, createLayer) => {
  it('无 Canvas 上下文仍输出完整线条，面积准确切在涨跌交点', () => {
    const layer = createLayer()
    const context = { ...frame(), dataView }
    layer.paint(context)
    const commands = context.primitives.mock.lastCall![0]
    expect(lines(commands).map((line) => line.paths)).toEqual([
      [
        [
          { x: 10, y: 150 },
          { x: 30, y: 250 },
          { x: 50, y: 150 },
        ],
      ],
      [
        [
          { x: 10, y: 175 },
          { x: 30, y: 225 },
          { x: 50, y: 175 },
        ],
      ],
    ])
    const fills = commands.filter((command) => command.kind === 'fill')
    expect(fills.map((fill) => fill.fade)).toEqual([
      { fromY: 150, toY: 200 },
      { fromY: 250, toY: 200 },
    ])
    expect(fills.map((fill) => area(fill.paths))).toEqual([500, 500])
    expect(fills[0]!.paths.flat().every((point) => point.y <= 200)).toBe(true)
    expect(fills[1]!.paths.flat().every((point) => point.y >= 200)).toBe(true)
    expect(
      fills[0]!.paths
        .flat()
        .filter((point) => point.y === 200)
        .map((point) => point.x),
    ).toEqual(expect.arrayContaining([20, 40]))
  })

  it('按交易日与缺槽分段，昨收参考线覆盖每一天的完整区域', () => {
    const layer = createLayer()
    const context = { ...frame(), dataView }
    const source = [
      { timestamp: 1, price: 11, average: 10 },
      { timestamp: 2, price: 11, average: 10 },
      { timestamp: 3, price: 9, average: 10 },
      { timestamp: 4, price: 9, average: 10 },
      { timestamp: 5, price: 11, average: 10 },
    ]
    layer.paint({
      ...context,
      data: source,
      range: { start: 0, end: 5 },
      kLineCenters: [10, 20, 110, 120, 150],
      timeShareGeometry: {
        ...context.timeShareGeometry!,
        days: [
          createTimeShareDayGeometry({ dataStartIndex: 0, dataEndIndex: 2, startX: 0, endX: 100 }),
          createTimeShareDayGeometry({
            dataStartIndex: 2,
            dataEndIndex: 5,
            startX: 100,
            endX: 200,
          }),
        ],
        segments: [
          createTimeShareSegment({ dataStartIndex: 0, dataEndIndex: 2 }),
          createTimeShareSegment({ dataStartIndex: 2, dataEndIndex: 4 }),
          createTimeShareSegment({ dataStartIndex: 4, dataEndIndex: 5 }),
        ],
      },
    })
    const commands = context.primitives.mock.lastCall![0]
    expect(lines(commands).map((line) => line.paths[0]!.map((point) => point.x))).toEqual([
      [10, 20],
      [10, 20],
      [110, 120],
      [110, 120],
    ])
    expect(
      commands
        .filter((command) => command.kind === 'stroke')
        .filter((line) => line.dash)
        .map((line) => line.paths),
    ).toEqual([
      [
        [
          { x: 0, y: 200 },
          { x: 100, y: 200 },
        ],
      ],
      [
        [
          { x: 100, y: 200 },
          { x: 200, y: 200 },
        ],
      ],
    ])
  })

  it('缺失昨收保留价格与均价，空数据不输出遗留几何', () => {
    const layer = createLayer()
    const context = { ...frame(), dataView, timeShareBaseline: undefined }
    layer.paint(context)
    const commands = context.primitives.mock.lastCall![0]
    expect(commands).toHaveLength(2)
    expect(lines(commands)).toHaveLength(2)
    context.primitives.mockClear()
    layer.paint({ ...context, data: [], dataRevision: 2 })
    expect(context.primitives).not.toHaveBeenCalled()
  })

  it('滚动和主题不重新映射价格，数据变化立即更新几何，释放后不保留缓存', () => {
    const layer = createLayer()
    const context = { ...frame(), dataView }
    const priceToY = vi.spyOn(context.pane.yAxis, 'priceToY')
    layer.paint(context)
    const firstCount = priceToY.mock.calls.length
    layer.paint({ ...context, scrollLeft: 5, theme: 'dark' })
    expect(priceToY).toHaveBeenCalledTimes(firstCount)
    expect(lines(context.primitives.mock.lastCall![0])[0]!.offsetX).toBe(5)
    layer.paint({
      ...context,
      dataRevision: 2,
      data: context.data.map((point) => ({ ...point, price: 12, average: 12 })),
    })
    expect(
      lines(context.primitives.mock.lastCall![0])[0]!.paths[0]!.map((point) => point.y),
    ).toEqual([100, 100, 100])
    const beforeDispose = priceToY.mock.calls.length
    layer.dispose()
    layer.paint(context)
    expect(priceToY.mock.calls.length).toBeGreaterThan(beforeDispose)
    expect(lines(context.primitives.mock.lastCall![0])[0]!.paths[0]![0]!.y).toBe(150)
  })

  it('无数据版本的独立绘制不复用上一帧价格', () => {
    const layer = createLayer()
    const context = { ...frame(), dataView, dataRevision: undefined }
    layer.paint(context)
    layer.paint({
      ...context,
      data: context.data.map((point) => ({ ...point, price: 12, average: 12 })),
    })
    expect(lines(context.primitives.mock.lastCall![0])[0]!.paths[0]![0]!.y).toBe(100)
  })
})
