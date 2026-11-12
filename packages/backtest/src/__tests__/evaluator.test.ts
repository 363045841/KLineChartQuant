/**
 * L2 信号判定与 A/B 分级单元测试。
 *
 * 指标序列直接手工构造：判定函数只消费序列，这样可以精确控制 regime、云侧与 TK 交叉。
 */
import { describe, expect, it } from 'vitest'
import { classifyGrade, evaluateL2Signal, meetsMinStopDistance } from '../impl/evaluator'
import type { IchimokuSeries } from '../types'
import { BASE_TIME, HOUR_MS, makeCandle } from './testUtils'

/** 构造一个长度固定的空序列。 */
function emptySeries(length: number): {
  close: number[]
  tenkan: (number | null)[]
  kijun: (number | null)[]
  spanA: (number | null)[]
  spanB: (number | null)[]
  atr: (number | null)[]
  regimeDiff: (number | null)[]
} {
  return {
    close: new Array<number>(length).fill(100),
    tenkan: new Array<number | null>(length).fill(null),
    kijun: new Array<number | null>(length).fill(null),
    spanA: new Array<number | null>(length).fill(null),
    spanB: new Array<number | null>(length).fill(null),
    atr: new Array<number | null>(length).fill(null),
    regimeDiff: new Array<number | null>(length).fill(null),
  }
}

/** 把可变数组升格为契约类型。 */
function toSeries(raw: ReturnType<typeof emptySeries>): IchimokuSeries {
  return {
    length: raw.close.length,
    close: raw.close,
    tenkan: raw.tenkan,
    kijun: raw.kijun,
    spanA: raw.spanA,
    spanB: raw.spanB,
    atr: raw.atr,
    regimeDiff: raw.regimeDiff,
  }
}

/** 构造 N 根价格恒定的 K 线（判定只用长度，价格从序列读取）。 */
function makeCandles(length: number) {
  return Array.from({ length }, (_, index) =>
    makeCandle(BASE_TIME + index * HOUR_MS, { open: 100, high: 101, low: 99, close: 100 }),
  )
}

describe('evaluateL2Signal', () => {
  it('TK 上穿 + regime 向上 + 价格在云上方 = 多头信号', () => {
    const raw = emptySeries(40)
    raw.tenkan[29] = 99
    raw.kijun[29] = 100
    raw.tenkan[30] = 101
    raw.kijun[30] = 100
    raw.spanA[30] = 100
    raw.spanB[30] = 98
    raw.regimeDiff[30] = 5
    raw.close[30] = 105

    const result = evaluateL2Signal(makeCandles(40), toSeries(raw), 30)
    expect(result).not.toBeNull()
    expect(result?.direction).toBe('long')
    expect(result?.cloudTop).toBe(100)
    expect(result?.cloudBottom).toBe(98)
    expect(result?.cloudThickness).toBe(2)
  })

  it('价格落在云内时不构成信号', () => {
    const raw = emptySeries(40)
    raw.tenkan[29] = 99
    raw.kijun[29] = 100
    raw.tenkan[30] = 101
    raw.kijun[30] = 100
    raw.spanA[30] = 100
    raw.spanB[30] = 98
    raw.regimeDiff[30] = 5
    raw.close[30] = 99

    expect(evaluateL2Signal(makeCandles(40), toSeries(raw), 30)).toBeNull()
  })

  it('TK 下穿 + regime 向下 + 价格在云下方 = 空头信号', () => {
    const raw = emptySeries(40)
    raw.tenkan[29] = 101
    raw.kijun[29] = 100
    raw.tenkan[30] = 99
    raw.kijun[30] = 100
    raw.spanA[30] = 100
    raw.spanB[30] = 102
    raw.regimeDiff[30] = -5
    raw.close[30] = 95

    const result = evaluateL2Signal(makeCandles(40), toSeries(raw), 30)
    expect(result?.direction).toBe('short')
    expect(result?.cloudTop).toBe(102)
    expect(result?.cloudBottom).toBe(100)
  })

  it('指标未就绪时不构成信号', () => {
    const raw = emptySeries(40)
    raw.tenkan[20] = 101
    raw.kijun[20] = 100
    raw.spanA[20] = 100
    raw.spanB[20] = 98
    raw.regimeDiff[20] = 5
    raw.close[20] = 105

    expect(evaluateL2Signal(makeCandles(40), toSeries(raw), 20)).toBeNull()
  })
})

describe('classifyGrade', () => {
  it('距离不超过 0.5 × 云厚为 A 级', () => {
    expect(classifyGrade(100, 10, [104], 0.5)).toBe('A')
    expect(classifyGrade(100, 10, [95, 104], 0.5)).toBe('A')
  })

  it('超出容差为 B 级', () => {
    expect(classifyGrade(100, 10, [106], 0.5)).toBe('B')
  })

  it('没有期权数据时为 null', () => {
    expect(classifyGrade(100, 10, null, 0.5)).toBeNull()
    expect(classifyGrade(100, 10, [], 0.5)).toBeNull()
  })
})

describe('meetsMinStopDistance', () => {
  it('比例为 0 时不设限', () => {
    expect(meetsMinStopDistance(100, 100, 0)).toBe(true)
    expect(meetsMinStopDistance(100, 95, 0)).toBe(true)
  })

  it('距离恰好等于阈值时通过（含等号）', () => {
    expect(meetsMinStopDistance(100, 95, 0.05)).toBe(true)
  })

  it('距离小于阈值时剔除', () => {
    expect(meetsMinStopDistance(100, 99.6, 0.005)).toBe(false)
  })

  it('空头方向用绝对距离，同样生效', () => {
    expect(meetsMinStopDistance(100, 101, 0.005)).toBe(true)
    expect(meetsMinStopDistance(100, 100.4, 0.005)).toBe(false)
  })
})
