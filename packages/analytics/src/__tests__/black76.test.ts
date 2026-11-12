/**
 * Black-76 gamma 单元测试。
 *
 * 参考值来自实测对比：BTC-27NOV26-73000-C（F≈75135.92、mark_iv 41.89%、DTE 17.7 天）
 * 的 Deribit 官方 `greeks.gamma` 为 0.00006（5 位有效数字），本地自算 0.0000575，
 * 比值 1.044。因此断言落在 5.3e-5 ~ 6.3e-5 区间，既锁定量纲又容许日期取整差异。
 */
import { describe, expect, it } from 'vitest'
import { ANALYTICS_ERROR_CODES } from '../errors'
import { black76Gamma, standardNormalDensity } from '../options/impl/black76'
import { expectAnalyticsError } from './testUtils'

/** 研究文档实测的参考合约参数。 */
const REFERENCE = {
  forward: 75135.92,
  strike: 73000,
  volatility: 0.4189,
  timeToExpiryYears: 17.7 / 365,
} as const

describe('standardNormalDensity', () => {
  it('在 0 处等于 1/√(2π)', () => {
    expect(standardNormalDensity(0)).toBeCloseTo(0.3989422804014327, 12)
  })

  it('关于 0 对称', () => {
    expect(standardNormalDensity(1.3)).toBeCloseTo(standardNormalDensity(-1.3), 15)
  })
})

describe('black76Gamma', () => {
  it('与 Deribit 官方 gamma 同量级', () => {
    const gamma = black76Gamma(REFERENCE)
    expect(gamma).toBeGreaterThan(5.3e-5)
    expect(gamma).toBeLessThan(6.3e-5)
  })

  it('平值附近最大，离平值越远越小', () => {
    const atTheMoney = black76Gamma({ ...REFERENCE, strike: 75135.92 })
    const awayFromMoney = black76Gamma({ ...REFERENCE, strike: 90000 })
    expect(atTheMoney).toBeGreaterThan(awayFromMoney)
  })

  it('剩余时间越长 gamma 越小', () => {
    const near = black76Gamma({ ...REFERENCE, timeToExpiryYears: 7 / 365 })
    const far = black76Gamma({ ...REFERENCE, timeToExpiryYears: 60 / 365 })
    expect(near).toBeGreaterThan(far)
  })

  it.each([
    ['期货价为零', { ...REFERENCE, forward: 0 }],
    ['行权价为零', { ...REFERENCE, strike: 0 }],
    ['波动率为零', { ...REFERENCE, volatility: 0 }],
    ['已到期', { ...REFERENCE, timeToExpiryYears: 0 }],
  ])('%s 时抛错', (_label, input) => {
    expectAnalyticsError(() => black76Gamma(input), ANALYTICS_ERROR_CODES.AGGREGATE_INPUT_INVALID)
  })
})
