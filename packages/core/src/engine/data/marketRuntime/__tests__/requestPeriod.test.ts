/** Request 周期写法解析：别名、标准名与脚本 Timeframe 枚举的对照关系。 */
import { Timeframe } from '@363045841yyt/klinechart-plot-contracts'
import { describe, expect, it } from 'vitest'
import { KLINE_PERIODS, type KLinePeriod } from '@/data/provider/types.js'
import { assertSecurityPeriod, requestPeriod } from '../impl/requestPeriod.js'

/**
 * Timeframe 每个取值对应的标准周期。
 *
 * 键是脚本能写的写法，值是 Provider 的标准周期；这张表同时守住枚举与枚举解析的漂移：
 * 少登记一个枚举取值或多出一个无法解析的取值，下面的用例都会失败。
 */
const TIMEFRAME_PERIODS: Readonly<Record<string, KLinePeriod>> = {
  '1': '1min',
  '5': '5min',
  '15': '15min',
  '30': '30min',
  '60': '60min',
  '240': '4h',
  D: 'daily',
  W: 'weekly',
  M: 'monthly',
  '3M': 'quarterly',
  '12M': 'yearly',
}

describe('requestPeriod', () => {
  it('Timeframe 每个取值都能解析到对应标准周期', () => {
    expect(Object.keys(TIMEFRAME_PERIODS).sort()).toEqual(
      [...new Set(Object.values(Timeframe))].sort(),
    )
    for (const [code, period] of Object.entries(TIMEFRAME_PERIODS)) {
      expect(requestPeriod(code)).toBe(period)
    }
  })

  it('枚举覆盖的周期集与图表支持的标准周期一致', () => {
    expect([...new Set(Object.values(TIMEFRAME_PERIODS))].sort()).toEqual([...KLINE_PERIODS].sort())
  })

  it('标准周期名恒等放行，未登记的写法直接拒绝', () => {
    for (const period of KLINE_PERIODS) expect(requestPeriod(period)).toBe(period)
    expect(() => requestPeriod('120')).toThrow()
    expect(() => requestPeriod('daily ')).toThrow()
  })

  it('只接受同周期或高周期', () => {
    expect(() => assertSecurityPeriod('daily', '60min')).not.toThrow()
    expect(() => assertSecurityPeriod('60min', '60min')).not.toThrow()
    expect(() => assertSecurityPeriod('1min', 'daily')).toThrow()
  })
})
