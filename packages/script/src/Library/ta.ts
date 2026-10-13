/** 技术分析库：接收序列并返回可引用历史的派生序列。 */
import { deriveSeries, readSeriesAt } from '../series/impl/seriesRuntime.js'
import type { Series } from '../series/types.js'
import type { TechnicalAnalysisLibrary } from './types.js'

/** 校验金融计算窗口。 */
function validateLength(length: number): void {
  if (!Number.isSafeInteger(length) || length <= 0) throw new RangeError('length 必须是正整数')
}

/** 计算完整窗口，任何缺失值都会产生 NaN。 */
function windowValue(
  index: number,
  length: number,
  read: (index: number) => number,
  kind: 'sma' | 'highest' | 'lowest',
): number {
  if (index + 1 < length) return Number.NaN
  let value = kind === 'highest' ? -Infinity : kind === 'lowest' ? Infinity : 0
  for (let i = index - length + 1; i <= index; i++) {
    const current = read(i)
    value =
      kind === 'highest'
        ? Math.max(value, current)
        : kind === 'lowest'
          ? Math.min(value, current)
          : value + current
  }
  return kind === 'sma' ? value / length : value
}

/** 简单移动平均，完整窗口之前返回 NaN。 */
function sma(source: Series, length: number): Series {
  validateLength(length)
  return deriveSeries(source, `sma:${length}`, (index, read) =>
    windowValue(index, length, read, 'sma'),
  )
}

/** 指数移动平均，以首个完整窗口 SMA 为初始值。 */
function ema(source: Series, length: number): Series {
  validateLength(length)
  return deriveSeries(source, `ema:${length}`, (index, read, previous) =>
    Number.isNaN(previous)
      ? windowValue(index, length, read, 'sma')
      : previous + (2 / (length + 1)) * (read(index) - previous),
  )
}

/** 窗口最高值。 */
function highest(source: Series, length: number): Series {
  validateLength(length)
  return deriveSeries(source, `highest:${length}`, (index, read) =>
    windowValue(index, length, read, 'highest'),
  )
}

/** 窗口最低值。 */
function lowest(source: Series, length: number): Series {
  validateLength(length)
  return deriveSeries(source, `lowest:${length}`, (index, read) =>
    windowValue(index, length, read, 'lowest'),
  )
}

/** Wilder RSI，分别平滑上涨与下跌幅度。 */
function rsi(source: Series, length: number): Series {
  validateLength(length)
  const gain = deriveSeries(source, `rsi-gain:${length}`, (index, read, previous) => {
    if (index < length) return Number.NaN
    if (!Number.isNaN(previous))
      return (previous * (length - 1) + Math.max(read(index) - read(index - 1), 0)) / length
    let total = 0
    for (let i = index - length + 1; i <= index; i++) total += Math.max(read(i) - read(i - 1), 0)
    return total / length
  })
  const loss = deriveSeries(source, `rsi-loss:${length}`, (index, read, previous) => {
    if (index < length) return Number.NaN
    if (!Number.isNaN(previous))
      return (previous * (length - 1) + Math.max(read(index - 1) - read(index), 0)) / length
    let total = 0
    for (let i = index - length + 1; i <= index; i++) total += Math.max(read(i - 1) - read(i), 0)
    return total / length
  })
  return deriveSeries(source, `rsi:${length}`, (index) => {
    const up = readSeriesAt(gain, index)
    const down = readSeriesAt(loss, index)
    if (Number.isNaN(up) || Number.isNaN(down)) return Number.NaN
    if (down === 0) return up === 0 ? 50 : 100
    return 100 - 100 / (1 + up / down)
  })
}

/** 当前发生上穿；历史不足时返回 false。 */
function crossover(left: Series, right: Series): boolean {
  return left[0] > right[0] && left[1] <= right[1]
}

/** 当前发生下穿；历史不足时返回 false。 */
function crossunder(left: Series, right: Series): boolean {
  return left[0] < right[0] && left[1] >= right[1]
}

/** 技术分析库函数表；由宿主显式绑定到执行作用域。 */
export const taLibrary = Object.freeze({
  sma,
  ema,
  rsi,
  highest,
  lowest,
  crossover,
  crossunder,
} satisfies TechnicalAnalysisLibrary)
