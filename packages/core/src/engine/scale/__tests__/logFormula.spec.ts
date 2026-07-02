import { describe, it, expect } from 'vitest'

import {
  toLog,
  fromLog,
  logFormulaForPriceRange,
  convertPriceRangeToLog,
  convertPriceRangeFromLog,
  logFormulasAreSame,
  type LogFormula,
} from '../logFormula'

describe('logFormula', () => {
  const defaultFormula: LogFormula = { logicalOffset: 4, coordOffset: 0.0001 }

  describe('toLog / fromLog', () => {
    it('should round-trip for positive prices', () => {
      const testPrices = [1, 10, 100, 0.1, 0.01, 50000, 0.0001]
      for (const price of testPrices) {
        const logical = toLog(price, defaultFormula)
        const back = fromLog(logical, defaultFormula)
        expect(back).toBeCloseTo(price, 10)
      }
    })

    it('should round-trip for negative prices', () => {
      const testPrices = [-1, -10, -100, -0.1, -0.01]
      for (const price of testPrices) {
        const logical = toLog(price, defaultFormula)
        const back = fromLog(logical, defaultFormula)
        expect(back).toBeCloseTo(price, 10)
      }
    })

    it('should return 0 for zero', () => {
      expect(toLog(0, defaultFormula)).toBe(0)
      expect(fromLog(0, defaultFormula)).toBe(0)
    })

    it('should handle very small prices with precision', () => {
      const tinyPrice = 1e-9
      const logical = toLog(tinyPrice, defaultFormula)
      const back = fromLog(logical, defaultFormula)
      expect(back).toBeCloseTo(tinyPrice, 10)
    })

    it('should preserve sign', () => {
      expect(toLog(100, defaultFormula)).toBeGreaterThan(0)
      expect(toLog(-100, defaultFormula)).toBeLessThan(0)
    })
  })

  describe('logFormulaForPriceRange', () => {
    it('should return default formula for normal range', () => {
      const range = { minPrice: 10, maxPrice: 100 }
      const formula = logFormulaForPriceRange(range)
      expect(formula.logicalOffset).toBe(4)
      expect(formula.coordOffset).toBe(0.0001)
    })

    it('should return default formula for range >= 1', () => {
      const range = { minPrice: 0.5, maxPrice: 2.5 } // diff = 2
      const formula = logFormulaForPriceRange(range)
      expect(formula.logicalOffset).toBe(4)
    })

    it('should increase offsets for small range (< 1)', () => {
      const range = { minPrice: 0.001, maxPrice: 0.002 } // diff = 0.001 = 1e-3
      const formula = logFormulaForPriceRange(range)
      // diff = 0.001, digits = ceil(3) = 3
      // logicalOffset = 4 + 3 = 7
      expect(formula.logicalOffset).toBe(7)
      expect(formula.coordOffset).toBe(1e-7)
    })

    it('should handle very small range', () => {
      const range = { minPrice: 1e-9, maxPrice: 2e-9 }
      const formula = logFormulaForPriceRange(range)
      // diff = 1e-9, digits = ceil(9) = 9
      // logicalOffset = 4 + 9 = 13
      expect(formula.logicalOffset).toBe(13)
      expect(formula.coordOffset).toBe(1e-13)
    })

    it('should return default formula for null range', () => {
      const formula = logFormulaForPriceRange(null)
      expect(formula.logicalOffset).toBe(4)
      expect(formula.coordOffset).toBe(0.0001)
    })

    it('should return default formula for zero diff', () => {
      const range = { minPrice: 100, maxPrice: 100 }
      const formula = logFormulaForPriceRange(range)
      expect(formula.logicalOffset).toBe(4)
    })
  })

  describe('convertPriceRangeToLog / convertPriceRangeFromLog', () => {
    it('should round-trip range conversion', () => {
      const range = { minPrice: 10, maxPrice: 1000 }
      const logRange = convertPriceRangeToLog(range, defaultFormula)
      const back = convertPriceRangeFromLog(logRange, defaultFormula)
      expect(back.minPrice).toBeCloseTo(range.minPrice, 10)
      expect(back.maxPrice).toBeCloseTo(range.maxPrice, 10)
    })
  })

  describe('logFormulasAreSame', () => {
    it('should return true for identical formulas', () => {
      const a: LogFormula = { logicalOffset: 4, coordOffset: 0.0001 }
      const b: LogFormula = { logicalOffset: 4, coordOffset: 0.0001 }
      expect(logFormulasAreSame(a, b)).toBe(true)
    })

    it('should return false for different offsets', () => {
      const a: LogFormula = { logicalOffset: 4, coordOffset: 0.0001 }
      const b: LogFormula = { logicalOffset: 5, coordOffset: 0.0001 }
      expect(logFormulasAreSame(a, b)).toBe(false)
    })

    it('should return false for different coordOffsets', () => {
      const a: LogFormula = { logicalOffset: 4, coordOffset: 0.0001 }
      const b: LogFormula = { logicalOffset: 4, coordOffset: 0.001 }
      expect(logFormulasAreSame(a, b)).toBe(false)
    })
  })

  describe('precision with dynamic formula', () => {
    it('should maintain precision for crypto-scale prices', () => {
      const range = { minPrice: 1e-9, maxPrice: 5e-9 }
      const formula = logFormulaForPriceRange(range)

      // Test that we can represent values in this range accurately
      const testPrice = 2.5e-9
      const logical = toLog(testPrice, formula)
      const back = fromLog(logical, formula)
      expect(back).toBeCloseTo(testPrice, 10)
    })

    it('should handle nano-scale prices', () => {
      const range = { minPrice: 1e-12, maxPrice: 2e-12 }
      const formula = logFormulaForPriceRange(range)
      const testPrice = 1.5e-12
      const logical = toLog(testPrice, formula)
      const back = fromLog(logical, formula)
      expect(back).toBeCloseTo(testPrice, 10)
    })
  })
})
