/**
 * 成本模型与成本敏感度单元测试。
 *
 * 覆盖：单边 bps 的 R 折算、按档位重算、盈亏平衡点、空集与负期望边界。
 */
import { describe, expect, it } from 'vitest'
import { costRForPrices, costRPerBps, projectTradeCost } from '../impl/cost'
import { computeCostSensitivity } from '../impl/stats'
import { BASE_TIME, HOUR_MS, makeTrade } from './testUtils'

describe('costRForPrices', () => {
  it('按单边名义计，入场与出场各一次', () => {
    // entry 100、exit 110、risk 5、单边 10bp：(100 + 110) * 0.001 / 5 = 0.042
    expect(costRForPrices(100, 110, 5, 10)).toBeCloseTo(0.042, 12)
  })

  it('0 bp 时成本为 0', () => {
    expect(costRForPrices(100, 110, 5, 0)).toBe(0)
  })

  it('风险越小，同样 bps 折算的 R 越大', () => {
    expect(costRForPrices(100, 110, 1, 10)).toBeGreaterThan(costRForPrices(100, 110, 10, 10))
  })
})

describe('projectTradeCost', () => {
  it('毛 R 不变，净 R = 毛 R - 成本', () => {
    const trade = makeTrade({ id: 1, rMultiple: 2, entryTime: BASE_TIME })
    const projected = projectTradeCost(trade, 10)
    expect(projected.grossR).toBe(2)
    expect(projected.costR).toBeCloseTo(costRPerBps(100, 110, 5) * 10, 12)
    expect(projected.rMultiple).toBeCloseTo(2 - projected.costR, 12)
  })

  it('不修改入参', () => {
    const trade = makeTrade({ id: 1, rMultiple: 2, entryTime: BASE_TIME })
    projectTradeCost(trade, 10)
    expect(trade.costR).toBe(0)
    expect(trade.rMultiple).toBe(2)
  })
})

describe('computeCostSensitivity', () => {
  const trades = [
    makeTrade({ id: 1, rMultiple: 2, entryTime: BASE_TIME }),
    makeTrade({ id: 2, rMultiple: -1, entryTime: BASE_TIME + HOUR_MS }),
  ]

  it('0 bp 档位的期望等于毛期望', () => {
    const sensitivity = computeCostSensitivity(trades, [0, 5, 10])
    expect(sensitivity.levels[0].expectancyR).toBeCloseTo(0.5, 12)
  })

  it('各档位期望随成本线性下降', () => {
    const sensitivity = computeCostSensitivity(trades, [0, 5, 10])
    const step1 = sensitivity.levels[1].expectancyR - sensitivity.levels[0].expectancyR
    const step2 = sensitivity.levels[2].expectancyR - sensitivity.levels[1].expectancyR
    expect(step1).toBeCloseTo(step2, 12)
    expect(step1).toBeLessThan(0)
  })

  it('盈亏平衡点处期望归零', () => {
    const sensitivity = computeCostSensitivity(trades, [0])
    const breakeven = sensitivity.breakevenBpsPerSide
    if (breakeven === null) {
      throw new Error('毛期望为正，应当给出盈亏平衡成本')
    }
    expect(computeCostSensitivity(trades, [breakeven]).levels[0].expectancyR).toBeCloseTo(0, 10)
  })

  it('毛期望非正时盈亏平衡点为 null', () => {
    const losers = [makeTrade({ id: 1, rMultiple: -1, entryTime: BASE_TIME })]
    expect(computeCostSensitivity(losers, [0]).breakevenBpsPerSide).toBeNull()
  })

  it('空交易集：各档位期望为 0，盈亏平衡为 null', () => {
    const sensitivity = computeCostSensitivity([], [0, 10])
    expect(sensitivity.levels).toHaveLength(2)
    expect(sensitivity.levels[1].expectancyR).toBe(0)
    expect(sensitivity.breakevenBpsPerSide).toBeNull()
  })
})
