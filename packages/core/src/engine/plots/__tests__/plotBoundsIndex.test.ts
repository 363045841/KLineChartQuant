/** 可见区间极值索引：块聚合必须与逐根扫描完全一致（空值、NaN、OHLC、空窗口与块边界）。 */

import {
  type CandlePlot,
  createPlot,
  isOhlcPlot,
  type Plot,
} from '@363045841yyt/klinechart-plot-contracts'
import { describe, expect, it } from 'vitest'
import { queryPlotBounds } from '../impl/plotBoundsIndex.js'

/** 重构前的逐根扫描，作为块索引的对照实现。 */
function scan(plot: Plot, start: number, end: number) {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  let hasValues = false
  const from = Math.max(0, start)
  const to = Math.min(plot.data.length, end)
  if (isOhlcPlot(plot)) {
    for (let index = from; index < to; index++) {
      const point = plot.data[index]
      if (!point) continue
      hasValues = true
      min = Math.min(min, point.low)
      max = Math.max(max, point.high)
    }
  } else {
    for (let index = from; index < to; index++) {
      const value = plot.data[index]?.value
      if (value === undefined || !Number.isFinite(value)) continue
      hasValues = true
      min = Math.min(min, value)
      max = Math.max(max, value)
    }
  }
  return hasValues ? { min, max } : undefined
}

/** 600 根值列：每 17 根一个空位、每 23 根一个 NaN，覆盖跳过规则与块边界。 */
const valuePlot = createPlot(
  { name: 'line', kind: 'line', color: '#fff' },
  Array.from({ length: 600 }, (_, index) => {
    if (index % 17 === 0) return undefined
    if (index % 23 === 0) return { value: Number.NaN }
    return { value: Math.sin(index / 7) * 100 }
  }),
)

/** 400 根蜡烛：含空位与一根 NaN low，覆盖 NaN 传播规则。 */
const ohlcData = Array.from({ length: 400 }, (_, index) => {
  if (index % 31 === 0) return undefined
  const base = 100 + index * 0.1
  return {
    open: base,
    high: base + 2,
    low: index === 5 ? Number.NaN : base - 2,
    close: base + 0.5,
    color: '#0f0',
    wickColor: '#0f0',
    borderColor: '#0f0',
  }
})
const ohlcPlot: CandlePlot = {
  id: 'candle',
  label: 'candle',
  kind: 'candle',
  data: ohlcData,
  color: '#0f0',
  visible: true,
  offset: 0,
}

/** 覆盖整段、单根、块边界跨越、空窗口、越界与纯空位窗口。 */
const windows: ReadonlyArray<readonly [number, number]> = [
  [0, 600],
  [0, 1],
  [127, 129],
  [128, 257],
  [255, 257],
  [300, 301],
  [599, 600],
  [600, 600],
  [700, 800],
  [-5, 3],
  [17, 18],
  [16, 18],
]

describe('可见区间极值索引', () => {
  it.each(windows)('值列窗口 [%i, %i) 与逐根扫描一致', (start, end) => {
    expect(queryPlotBounds(valuePlot, start, end)).toEqual(scan(valuePlot, start, end))
  })

  it.each(windows)('OHLC 窗口 [%i, %i) 与逐根扫描一致', (start, end) => {
    expect(queryPlotBounds(ohlcPlot, start, Math.min(end, 400))).toEqual(
      scan(ohlcPlot, start, Math.min(end, 400)),
    )
  })

  it('OHLC 的非有限 low 与逐根扫描一样传播 NaN', () => {
    const bounds = queryPlotBounds(ohlcPlot, 0, 30)
    expect(bounds?.min).toBeNaN()
    expect(scan(ohlcPlot, 0, 30)?.min).toBeNaN()
  })

  it('空窗口与全空位窗口返回 undefined', () => {
    expect(queryPlotBounds(valuePlot, 300, 300)).toBeUndefined()
    expect(queryPlotBounds(valuePlot, 17, 18)).toBeUndefined()
    expect(queryPlotBounds(valuePlot, 600, 700)).toBeUndefined()
  })
})
