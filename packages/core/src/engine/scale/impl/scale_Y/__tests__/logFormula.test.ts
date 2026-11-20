import { describe, expect, it } from 'vitest'

import { type LogFormula, fromLog, logFormulaForPriceRange, toLog } from '../logFormula'

describe('logFormula', () => {
  const defaultFormula: LogFormula = { logicalOffset: 4, coordOffset: 0.0001 }

  describe('toLog / fromLog', () => {
    it.each([1, 10, 100, 0.1, 0.01, 50000, 0.0001, -1, -10, -100, -0.1, -0.01, 1e-9])(
      '价格 %s 往返后保持精度',
      (price) => {
        const back = fromLog(toLog(price, defaultFormula), defaultFormula)
        expect(back).toBeCloseTo(price, 10)
      },
    )

    it('零在 log 空间仍为零', () => {
      expect(toLog(0, defaultFormula)).toBe(0)
      expect(fromLog(0, defaultFormula)).toBe(0)
    })

    it('保留价格符号', () => {
      expect(toLog(100, defaultFormula)).toBeGreaterThan(0)
      expect(toLog(-100, defaultFormula)).toBeLessThan(0)
    })
  })

  describe('logFormulaForPriceRange', () => {
    it.each([
      { name: '常规范围', range: { minPrice: 10, maxPrice: 100 }, logicalOffset: 4, coordOffset: 0.0001 },
      { name: '差值 ≥ 1', range: { minPrice: 0.5, maxPrice: 2.5 }, logicalOffset: 4, coordOffset: 0.0001 },
      {
        name: '小范围 (< 1)',
        range: { minPrice: 0.001, maxPrice: 0.002 },
        logicalOffset: 7,
        coordOffset: 1e-7,
      },
      {
        name: '极小范围',
        range: { minPrice: 1e-9, maxPrice: 2e-9 },
        logicalOffset: 13,
        coordOffset: 1e-13,
      },
      { name: '空范围', range: null, logicalOffset: 4, coordOffset: 0.0001 },
      { name: '零差值', range: { minPrice: 100, maxPrice: 100 }, logicalOffset: 4, coordOffset: 0.0001 },
    ])('$name 使用对应偏移', ({ range, logicalOffset, coordOffset }) => {
      const formula = logFormulaForPriceRange(range)
      expect(formula).toEqual({ logicalOffset, coordOffset })
    })
  })

  describe('动态公式精度', () => {
    it.each([
      { name: '加密小价', minPrice: 1e-9, maxPrice: 5e-9, price: 2.5e-9 },
      { name: '纳级价格', minPrice: 1e-12, maxPrice: 2e-12, price: 1.5e-12 },
    ])('$name 往返保持精度', ({ minPrice, maxPrice, price }) => {
      const formula = logFormulaForPriceRange({ minPrice, maxPrice })
      expect(fromLog(toLog(price, formula), formula)).toBeCloseTo(price, 10)
    })
  })
})
