/** 回归通道：线性轴按价格等差、对数轴按对数等差拟合，端点与半宽都随空间换算。 */
import { describe, expect, it } from 'vitest'
import { computeRegressionChannel } from '../impl/regressionChannel.js'

describe('computeRegressionChannel', () => {
  it('keeps fitted values attached to their actual anchor indexes', () => {
    const model = computeRegressionChannel([10, 20, 30, 40], 3, 0, 2, 'price')

    expect(model?.firstValue).toBe(40)
    expect(model?.secondValue).toBe(10)
    expect(model?.regression.slope).toBe(10)
  })

  it('rejects invalid prices and normalizes invalid sigma', () => {
    expect(computeRegressionChannel([10, Number.NaN, 30], 0, 2, 2, 'price')).toBeNull()
    expect(computeRegressionChannel([10, 20, 30], 0, 2, -1, 'price')?.sigma).toBe(2)
  })

  it('对数轴按对数价格拟合：等比序列在屏幕上是一条直线', () => {
    const model = computeRegressionChannel([100, 200, 400, 800], 0, 3, 2, 'log')

    // 等比序列取对数后是等差，残差为 0，因此半宽为 0。
    expect(model?.deviation).toBeCloseTo(0, 12)
    expect(model?.space).toBe('log')
    // 拟合线回到价格空间仍落在原序列上。
    expect(model?.firstValue).toBeCloseTo(100, 9)
    expect(model?.secondValue).toBeCloseTo(800, 9)
  })

  it('对数轴的端点由对数拟合转回价格，与价格等差拟合结果不同', () => {
    const logModel = computeRegressionChannel([100, 200, 400], 0, 2, 0, 'log')
    const priceModel = computeRegressionChannel([100, 200, 400], 0, 2, 0, 'price')

    // 对数拟合的斜率是等比倍数；价格等差拟合的斜率是等差增量（每根 +150）。
    expect(logModel?.regression.slope).toBeCloseTo(Math.log(2), 9)
    expect(priceModel?.regression.slope).toBeCloseTo(150, 9)
    // 端点都落在原序列末项上，但中间点的拟合值不同：对数中点为 200，价格中点为 233.33。
    expect(logModel?.secondValue).toBeCloseTo(400, 9)
    expect(priceModel?.secondValue).toBeCloseTo(383.33, 2)
  })

  it('对数轴遇到非正价格时返回 null，不做隐式降级', () => {
    expect(computeRegressionChannel([0, 100, 200], 0, 2, 2, 'log')).toBeNull()
    expect(computeRegressionChannel([-100, 100, 200], 0, 2, 2, 'log')).toBeNull()
  })
})
