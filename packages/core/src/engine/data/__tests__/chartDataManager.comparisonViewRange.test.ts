/** 比较叠加协调器测试：主序列、逻辑坐标与指标数据不被比较集合替换。 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { KLineData } from '@/controllers/types'
import type { ChartDataManager } from '../chartDataManager'
import { ComparisonManager } from '../comparisonManager'
import { createTestChartDataManager, createTestDocument } from './helpers/chartDataManagerTestKit'

const primary: KLineData[] = [
  { timestamp: 1, open: 100, high: 110, low: 90, close: 100 },
  { timestamp: 2, open: 100, high: 112, low: 88, close: 102 },
  { timestamp: 3, open: 102, high: 113, low: 89, close: 101 },
]
const compared: KLineData[] = [
  { timestamp: 2, open: 50, high: 500, low: 1, close: 50 },
  { timestamp: 3, open: 60, high: 500, low: 1, close: 60 },
]

describe('K 线比较叠加数据', () => {
  let manager: ChartDataManager
  beforeEach(() => {
    manager = createTestChartDataManager(createTestDocument(), {
      viewport: { visibleRange: { start: 0, end: 3 } },
    }).manager
  })
  afterEach(() => {
    manager.destroy()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  /** 使用真实内联 Buffer 加载主品种和延迟出现的比较品种。 */
  function load(): void {
    manager.setSymbols([{ symbol: 'MAIN', market: 'CN', period: 'daily', source: 'mock' }])
    manager.setData(primary)
    manager.setComparisonData('CMP', compared)
  }

  it('保留主品种渲染数据、指标数据和逻辑坐标', () => {
    load()
    expect(manager.getRenderData()).toEqual(primary)
    expect(manager.getInternalData()).toEqual(primary)
    expect(manager.getTimestampAtLogicalIndex(0)).toBe(1)
    expect(manager.getLogicalIndexAtTimestamp(3)).toBe(2)
    expect(manager.getLogicalSlotCount()).toBe(primary.length + 24)
  })

  it('价格范围同时包含主品种影线和比较折线，不使用比较品种原始 high/low', () => {
    load()
    const projection = manager.getComparisonProjection({ start: 0, end: 3 }, [0, 10, 20], 0, 100)
    expect(projection?.basePrice).toBe(100)
    expect(projection?.min).toBe(88)
    expect(projection?.max).toBe(120)
    expect(projection?.series[0]?.points).toEqual([
      { index: 1, price: 100 },
      { index: 2, price: 120 },
    ])
  })

  it('比较集合为空或没有主品种数据时不替换主图', () => {
    expect(manager.getComparisonProjection({ start: 0, end: 3 }, [0, 10, 20], 0, 100)).toBeNull()
    manager.setComparisonData('CMP', compared)
    expect(manager.getRenderData()).toEqual([])
    expect(manager.getComparisonProjection({ start: 0, end: 3 }, [0, 10, 20], 0, 100)).toBeNull()
  })

  it('主品种已覆盖可见范围时仍检查比较折线的历史覆盖', () => {
    load()
    const ensure = vi.spyOn(ComparisonManager.prototype, 'ensureRange')
    manager.checkVisibleRangeGap()
    expect(ensure).toHaveBeenCalledWith(primary[0]!.timestamp)
  })

  it('滚动重算主品种基准且不纳入屏外比较点', () => {
    load()
    const projection = manager.getComparisonProjection({ start: 0, end: 3 }, [0, 10, 20], 10, 10)
    expect(projection?.basePrice).toBe(102)
    expect(projection?.min).toBe(88)
    expect(projection?.max).toBeCloseTo(122.4)
  })
})
