import { describe, it, expect, beforeAll } from 'vitest'

import {
  calcBOLLData,
  calcEXPMAData,
  calcENEData,
  calcMAData,
  calcRSIData,
  calcCCIData,
  calcSTOCHData,
  calcMOMData,
  calcWMSRData,
  calcKSTData,
  calcFASTKData,
  calcMACDData,
} from '../calculators'
import type {
  BOLLPoint,
  EXPMAPoint,
  ENEPoint,
  STOCHPoint,
  KSTPoint,
  MACDPoint,
} from '../calculators'
import {
  SharedKLineBuffer,
  getClosesView,
  getHighsLowsViews,
  getOHLCViews,
  type KLineSoALayout,
} from '../soa'

import type { KLineData } from '@/types/price'

// SoA wrapper functions (test-only — convert SoA → AoS before computing)
function calcBOLLDataSoA(layout: KLineSoALayout, period: number, multiplier: number): BOLLPoint[] {
  return calcBOLLData(SharedKLineBuffer.toKLineData(layout), period, multiplier)
}
function calcEXPMADataSoA(
  layout: KLineSoALayout,
  fastPeriod: number,
  slowPeriod: number,
): EXPMAPoint[] {
  return calcEXPMAData(SharedKLineBuffer.toKLineData(layout), fastPeriod, slowPeriod)
}
function calcENEDataSoA(layout: KLineSoALayout, period: number, deviation: number): ENEPoint[] {
  return calcENEData(SharedKLineBuffer.toKLineData(layout), period, deviation)
}
function calcMADataSoA(layout: KLineSoALayout, period: number): (number | undefined)[] {
  return calcMAData(SharedKLineBuffer.toKLineData(layout), period)
}
function calcRSIDataSoA(layout: KLineSoALayout, period: number): (number | undefined)[] {
  return calcRSIData(SharedKLineBuffer.toKLineData(layout), period)
}
function calcCCIDataSoA(layout: KLineSoALayout, period: number): (number | undefined)[] {
  return calcCCIData(SharedKLineBuffer.toKLineData(layout), period)
}
function calcSTOCHDataSoA(layout: KLineSoALayout, n: number, m: number): STOCHPoint[] {
  return calcSTOCHData(SharedKLineBuffer.toKLineData(layout), n, m)
}
function calcMOMDataSoA(layout: KLineSoALayout, period: number): (number | undefined)[] {
  return calcMOMData(SharedKLineBuffer.toKLineData(layout), period)
}
function calcWMSRDataSoA(layout: KLineSoALayout, period: number): (number | undefined)[] {
  return calcWMSRData(SharedKLineBuffer.toKLineData(layout), period)
}
function calcKSTDataSoA(
  layout: KLineSoALayout,
  roc1: number,
  roc2: number,
  roc3: number,
  roc4: number,
  signalPeriod: number,
): KSTPoint[] {
  return calcKSTData(SharedKLineBuffer.toKLineData(layout), roc1, roc2, roc3, roc4, signalPeriod)
}
function calcFASTKDataSoA(layout: KLineSoALayout, period: number): (number | undefined)[] {
  return calcFASTKData(SharedKLineBuffer.toKLineData(layout), period)
}
function calcMACDDataSoA(
  layout: KLineSoALayout,
  fastPeriod: number,
  slowPeriod: number,
  signalPeriod: number,
): MACDPoint[] {
  return calcMACDData(SharedKLineBuffer.toKLineData(layout), fastPeriod, slowPeriod, signalPeriod)
}

/**
 * 生成测试用的 K线数据
 */
function generateTestData(length: number): KLineData[] {
  const data: KLineData[] = []
  let price = 100
  const now = Date.now()

  for (let i = 0; i < length; i++) {
    const change = (Math.random() - 0.5) * 5
    const open = price
    const close = price + change
    const high = Math.max(open, close) + Math.random() * 2
    const low = Math.min(open, close) - Math.random() * 2

    data.push({
      timestamp: now + i * 60000, // 每分钟
      open,
      high,
      low,
      close,
      volume: Math.floor(Math.random() * 1000000),
      turnover: Math.floor(Math.random() * 100000000),
    })

    price = close
  }

  return data
}

/**
 * 比较两个数字数组，考虑浮点精度误差
 */
function compareNumberArrays(
  a: (number | undefined)[],
  b: (number | undefined)[],
  epsilon: number = 1e-10,
): boolean {
  if (a.length !== b.length) return false

  for (let i = 0; i < a.length; i++) {
    const va = a[i]
    const vb = b[i]

    if (va === undefined && vb === undefined) continue
    if (va === undefined || vb === undefined) return false
    if (Math.abs(va - vb) > epsilon) return false
  }

  return true
}

describe('SharedKLineBuffer', () => {
  const testDataLength = 100
  let testData: KLineData[]

  beforeAll(() => {
    testData = generateTestData(testDataLength)
  })

  describe('detectSupport', () => {
    it('应该返回布尔值', () => {
      const result = SharedKLineBuffer.detectSupport()
      expect(typeof result).toBe('boolean')
    })
  })

  describe('fromKLineData', () => {
    it('应该正确转换 KLineData[] 到 SoA 布局', () => {
      const layout = SharedKLineBuffer.fromKLineData(testData)

      expect(layout.length).toBe(testDataLength)
      expect(layout.timestamps.length).toBe(testDataLength)
      expect(layout.opens.length).toBe(testDataLength)
      expect(layout.highs.length).toBe(testDataLength)
      expect(layout.lows.length).toBe(testDataLength)
      expect(layout.closes.length).toBe(testDataLength)
      expect(layout.volumes.length).toBe(testDataLength)
      expect(layout.turnovers.length).toBe(testDataLength)
    })

    it('应该正确填充数据', () => {
      const layout = SharedKLineBuffer.fromKLineData(testData)

      for (let i = 0; i < testDataLength; i++) {
        const original = testData[i]!
        expect(layout.timestamps[i]).toBe(original.timestamp)
        expect(layout.opens[i]).toBe(original.open)
        expect(layout.highs[i]).toBe(original.high)
        expect(layout.lows[i]).toBe(original.low)
        expect(layout.closes[i]).toBe(original.close)
        expect(layout.volumes[i]).toBe(original.volume ?? 0)
        expect(layout.turnovers[i]).toBe(original.turnover ?? 0)
      }
    })

    it('应该正确检测 hasVolume 和 hasTurnover', () => {
      const dataWithVolume = generateTestData(10)
      const layoutWithVolume = SharedKLineBuffer.fromKLineData(dataWithVolume)
      expect(layoutWithVolume.hasVolume).toBe(true)
      expect(layoutWithVolume.hasTurnover).toBe(true)

      const dataWithoutVolume: KLineData[] = dataWithVolume.map((d) => ({
        timestamp: d.timestamp,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      }))
      const layoutWithoutVolume = SharedKLineBuffer.fromKLineData(dataWithoutVolume)
      expect(layoutWithoutVolume.hasVolume).toBe(false)
      expect(layoutWithoutVolume.hasTurnover).toBe(false)
    })

    it('应该正确计算缓冲区大小', () => {
      const layout = SharedKLineBuffer.fromKLineData(testData)
      const expectedByteLength = testDataLength * 8 * 7 // 7 列 x 8 字节
      expect(layout.buffer.byteLength).toBe(expectedByteLength)
    })

    it('isShared 应该与 detectSupport 一致', () => {
      const layout = SharedKLineBuffer.fromKLineData(testData, true)
      expect(layout.isShared).toBe(SharedKLineBuffer.detectSupport())

      const layoutArrayBuffer = SharedKLineBuffer.fromKLineData(testData, false)
      expect(layoutArrayBuffer.isShared).toBe(false)
    })
  })

  describe('toKLineData', () => {
    it('应该正确将 SoA 转换回 AoS', () => {
      const layout = SharedKLineBuffer.fromKLineData(testData)
      const restored = SharedKLineBuffer.toKLineData(layout)

      expect(restored.length).toBe(testData.length)

      for (let i = 0; i < testData.length; i++) {
        const original = testData[i]!
        const recovered = restored[i]!

        expect(recovered.timestamp).toBe(original.timestamp)
        expect(recovered.open).toBe(original.open)
        expect(recovered.high).toBe(original.high)
        expect(recovered.low).toBe(original.low)
        expect(recovered.close).toBe(original.close)
        expect(recovered.volume).toBe(original.volume)
        expect(recovered.turnover).toBe(original.turnover)
      }
    })

    it('应该正确处理缺失的 volume 和 turnover', () => {
      const dataWithoutVolume: KLineData[] = testData.slice(0, 10).map((d) => ({
        timestamp: d.timestamp,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      }))
      const layout = SharedKLineBuffer.fromKLineData(dataWithoutVolume)
      const restored = SharedKLineBuffer.toKLineData(layout)

      for (const item of restored) {
        expect(item.volume).toBeUndefined()
        expect(item.turnover).toBeUndefined()
      }
    })
  })

  describe('roundtrip conversion', () => {
    it('AoS -> SoA -> AoS 应该保持数据一致性', () => {
      const layout = SharedKLineBuffer.fromKLineData(testData)
      const restored = SharedKLineBuffer.toKLineData(layout)

      expect(restored).toEqual(testData)
    })
  })

  describe('updateExisting', () => {
    it('相同长度数据应该复用缓冲区', () => {
      const layout = SharedKLineBuffer.fromKLineData(testData)
      const originalBuffer = layout.buffer

      // 修改数据但保持相同长度
      const newData = generateTestData(testDataLength)
      const updated = SharedKLineBuffer.updateExisting(layout, newData)

      expect(updated.buffer).toBe(originalBuffer)
      expect(updated.length).toBe(testDataLength)
    })

    it('不同长度数据应该创建新缓冲区', () => {
      const layout = SharedKLineBuffer.fromKLineData(testData)
      const originalBuffer = layout.buffer

      const newData = generateTestData(testDataLength + 10)
      const updated = SharedKLineBuffer.updateExisting(layout, newData)

      expect(updated.buffer).not.toBe(originalBuffer)
      expect(updated.length).toBe(testDataLength + 10)
    })

    it('应该正确更新数据内容', () => {
      const layout = SharedKLineBuffer.fromKLineData(testData)
      const newData = generateTestData(testDataLength)

      SharedKLineBuffer.updateExisting(layout, newData)

      for (let i = 0; i < testDataLength; i++) {
        expect(layout.timestamps[i]).toBe(newData[i]!.timestamp)
        expect(layout.closes[i]).toBe(newData[i]!.close)
      }
    })
  })

  describe('createSubview', () => {
    it('应该创建正确的子视图', () => {
      const layout = SharedKLineBuffer.fromKLineData(testData)
      const subview = SharedKLineBuffer.createSubview(layout, 10, 30)

      expect(subview.length).toBe(20)
      expect(subview.buffer).toBe(layout.buffer)
    })

    it('子视图应该共享同一缓冲区', () => {
      const layout = SharedKLineBuffer.fromKLineData(testData)
      const subview = SharedKLineBuffer.createSubview(layout, 10, 30)

      // 修改子视图应该影响原视图
      subview.closes[0] = 999.99
      expect(layout.closes[10]).toBe(999.99)
    })

    it('越界范围应该自动截断', () => {
      const layout = SharedKLineBuffer.fromKLineData(testData)
      const subview = SharedKLineBuffer.createSubview(
        layout,
        testDataLength - 5,
        testDataLength + 10,
      )

      expect(subview.length).toBe(5)
    })

    it('无效范围应该抛出错误', () => {
      const layout = SharedKLineBuffer.fromKLineData(testData)
      expect(() => SharedKLineBuffer.createSubview(layout, 50, 50)).toThrow()
      expect(() => SharedKLineBuffer.createSubview(layout, 50, 40)).toThrow()
    })
  })

  describe('getBufferInfo', () => {
    it('应该返回正确的缓冲区信息', () => {
      const layout = SharedKLineBuffer.fromKLineData(testData)
      const info = SharedKLineBuffer.getBufferInfo(layout)

      expect(info.byteLength).toBe(layout.buffer.byteLength)
      expect(info.isShared).toBe(layout.isShared)
      expect(info.length).toBe(layout.length)
      expect(info.columns).toHaveLength(7)
    })
  })

  describe('helper functions', () => {
    it('getClosesView 应该返回 closes 数组', () => {
      const layout = SharedKLineBuffer.fromKLineData(testData)
      const closes = getClosesView(layout)
      expect(closes).toBe(layout.closes)
    })

    it('getHighsLowsViews 应该返回 highs 和 lows', () => {
      const layout = SharedKLineBuffer.fromKLineData(testData)
      const { highs, lows } = getHighsLowsViews(layout)
      expect(highs).toBe(layout.highs)
      expect(lows).toBe(layout.lows)
    })

    it('getOHLCViews 应该返回全部价格视图', () => {
      const layout = SharedKLineBuffer.fromKLineData(testData)
      const views = getOHLCViews(layout)
      expect(views.opens).toBe(layout.opens)
      expect(views.highs).toBe(layout.highs)
      expect(views.lows).toBe(layout.lows)
      expect(views.closes).toBe(layout.closes)
    })
  })
})

describe('SoA Calculator Wrappers', () => {
  const testDataLength = 200
  let testData: KLineData[]
  let layout: KLineSoALayout

  beforeAll(() => {
    testData = generateTestData(testDataLength)
    layout = SharedKLineBuffer.fromKLineData(testData)
  })

  describe('calcBOLLDataSoA', () => {
    it('SoA 结果应该与 AoS 结果一致', () => {
      const aosResult = calcBOLLData(testData, 20, 2)
      const soaResult = calcBOLLDataSoA(layout, 20, 2)

      expect(soaResult.length).toBe(aosResult.length)

      for (let i = 0; i < aosResult.length; i++) {
        const a = aosResult[i]
        const s = soaResult[i]

        if (a === undefined) {
          expect(s).toBeUndefined()
        } else {
          expect(s).toBeDefined()
          expect(s!.upper).toBeCloseTo(a.upper, 10)
          expect(s!.middle).toBeCloseTo(a.middle, 10)
          expect(s!.lower).toBeCloseTo(a.lower, 10)
        }
      }
    })
  })

  describe('calcEXPMADataSoA', () => {
    it('SoA 结果应该与 AoS 结果一致', () => {
      const aosResult = calcEXPMAData(testData, 12, 50)
      const soaResult = calcEXPMADataSoA(layout, 12, 50)

      for (let i = 0; i < aosResult.length; i++) {
        const a = aosResult[i]
        const s = soaResult[i]

        if (a === undefined) {
          expect(s).toBeUndefined()
        } else {
          expect(s!.fast).toBeCloseTo(a.fast, 10)
          expect(s!.slow).toBeCloseTo(a.slow, 10)
        }
      }
    })
  })

  describe('calcENEDataSoA', () => {
    it('SoA 结果应该与 AoS 结果一致', () => {
      const aosResult = calcENEData(testData, 10, 11)
      const soaResult = calcENEDataSoA(layout, 10, 11)

      for (let i = 0; i < aosResult.length; i++) {
        const a = aosResult[i]
        const s = soaResult[i]

        if (a === undefined) {
          expect(s).toBeUndefined()
        } else {
          expect(s!.upper).toBeCloseTo(a.upper, 10)
          expect(s!.middle).toBeCloseTo(a.middle, 10)
          expect(s!.lower).toBeCloseTo(a.lower, 10)
        }
      }
    })
  })

  describe('calcMADataSoA', () => {
    it('SoA 结果应该与 AoS 结果一致', () => {
      const aosResult = calcMAData(testData, 20)
      const soaResult = calcMADataSoA(layout, 20)

      expect(compareNumberArrays(aosResult, soaResult)).toBe(true)
    })
  })

  describe('calcRSIDataSoA', () => {
    it('SoA 结果应该与 AoS 结果一致', () => {
      const aosResult = calcRSIData(testData, 14)
      const soaResult = calcRSIDataSoA(layout, 14)

      expect(compareNumberArrays(aosResult, soaResult)).toBe(true)
    })
  })

  describe('calcCCIDataSoA', () => {
    it('SoA 结果应该与 AoS 结果一致', () => {
      const aosResult = calcCCIData(testData, 14)
      const soaResult = calcCCIDataSoA(layout, 14)

      expect(compareNumberArrays(aosResult, soaResult)).toBe(true)
    })
  })

  describe('calcSTOCHData', () => {
    it('J 值应按 3K - 2D 计算', () => {
      const data: KLineData[] = [
        { timestamp: 1, open: 5, high: 10, low: 0, close: 5, volume: 1 },
        { timestamp: 2, open: 8, high: 10, low: 0, close: 8, volume: 1 },
        { timestamp: 3, open: 2, high: 10, low: 0, close: 2, volume: 1 },
      ]

      expect(calcSTOCHData(data, 2, 2)[2]).toMatchObject({ k: 20, d: 50, j: -40 })
    })
  })

  describe('calcSTOCHDataSoA', () => {
    it('SoA 结果应该与 AoS 结果一致', () => {
      const aosResult = calcSTOCHData(testData, 9, 3)
      const soaResult = calcSTOCHDataSoA(layout, 9, 3)

      for (let i = 0; i < aosResult.length; i++) {
        const a = aosResult[i]
        const s = soaResult[i]

        if (a === undefined) {
          expect(s).toBeUndefined()
        } else {
          expect(s!.k).toBeCloseTo(a.k, 10)
          expect(s!.d).toBeCloseTo(a.d, 10)
          expect(s!.j).toBeCloseTo(a.j, 10)
        }
      }
    })
  })

  describe('calcMOMDataSoA', () => {
    it('SoA 结果应该与 AoS 结果一致', () => {
      const aosResult = calcMOMData(testData, 10)
      const soaResult = calcMOMDataSoA(layout, 10)

      expect(compareNumberArrays(aosResult, soaResult)).toBe(true)
    })
  })

  describe('calcWMSRDataSoA', () => {
    it('SoA 结果应该与 AoS 结果一致', () => {
      const aosResult = calcWMSRData(testData, 14)
      const soaResult = calcWMSRDataSoA(layout, 14)

      expect(compareNumberArrays(aosResult, soaResult)).toBe(true)
    })
  })

  describe('calcKSTDataSoA', () => {
    it('SoA 结果应该与 AoS 结果一致', () => {
      const aosResult = calcKSTData(testData, 10, 15, 20, 30, 9)
      const soaResult = calcKSTDataSoA(layout, 10, 15, 20, 30, 9)

      for (let i = 0; i < aosResult.length; i++) {
        const a = aosResult[i]
        const s = soaResult[i]

        if (a === undefined) {
          expect(s).toBeUndefined()
        } else {
          expect(s!.kst).toBeCloseTo(a.kst, 10)
          expect(s!.signal).toBeCloseTo(a.signal, 10)
        }
      }
    })
  })

  describe('calcFASTKDataSoA', () => {
    it('SoA 结果应该与 AoS 结果一致', () => {
      const aosResult = calcFASTKData(testData, 9)
      const soaResult = calcFASTKDataSoA(layout, 9)

      expect(compareNumberArrays(aosResult, soaResult)).toBe(true)
    })
  })

  describe('calcMACDDataSoA', () => {
    it('SoA 结果应该与 AoS 结果一致', () => {
      const aosResult = calcMACDData(testData, 12, 26, 9)
      const soaResult = calcMACDDataSoA(layout, 12, 26, 9)

      for (let i = 0; i < aosResult.length; i++) {
        const a = aosResult[i]
        const s = soaResult[i]

        if (a === undefined) {
          expect(s).toBeUndefined()
        } else {
          expect(s!.dif).toBeCloseTo(a.dif, 10)
          expect(s!.dea).toBeCloseTo(a.dea, 10)
          expect(s!.macd).toBeCloseTo(a.macd, 10)
        }
      }
    })
  })
})

describe('SoA Performance', () => {
  it('大容量数据转换应该高效', () => {
    const largeData = generateTestData(10000)

    const start = performance.now()
    const layout = SharedKLineBuffer.fromKLineData(largeData)
    const layoutTime = performance.now() - start

    const start2 = performance.now()
    const restored = SharedKLineBuffer.toKLineData(layout)
    const restoreTime = performance.now() - start2

    // 转换应该在合理时间内完成（10K 数据 < 100ms）
    expect(layoutTime).toBeLessThan(100)
    expect(restoreTime).toBeLessThan(100)
    expect(restored.length).toBe(10000)
  })

  it('SoA 计算器应该与 AoS 产生相同结果', () => {
    const data = generateTestData(1000)
    const layout = SharedKLineBuffer.fromKLineData(data)

    const aosResult = calcBOLLData(data, 20, 2)
    const soaResult = calcBOLLDataSoA(layout, 20, 2)

    expect(soaResult.length).toBe(aosResult.length)
  })
})
