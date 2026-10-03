/** 视图策略契约：各视图只通过自身策略派生几何与能力。 */
import { describe, expect, it } from 'vitest'
import type { TimeShareRange } from '@/data/provider/types'
import { ChartDataViewId } from '@/foundation/types/chartView'
import type { ChartSeriesDatum } from '@/foundation/types/price'
import { ASHARE_MARKET_SESSION } from '@/foundation/utils/timeShareAxisLabels'
import { VIEW_STRATEGIES } from '../impl/viewStrategies'
import type { ViewInput } from '../types'

/** 分时点落在 A 股上午 session 内，slot 索引与数组下标一致。 */
function timeSharePoints(length: number): ChartSeriesDatum[] {
  const open = Date.UTC(2026, 0, 5, 1, 30)
  return Array.from({ length }, (_, i) => ({
    timestamp: open + i * 60_000,
    price: 10 + i * 0.01,
    average: 10,
    volume: 1,
  }))
}

function bars(length: number): ChartSeriesDatum[] {
  return Array.from({ length }, (_, i) => ({
    timestamp: 20260101 + i,
    open: 10,
    high: 11,
    low: 9,
    close: 10,
  }))
}

/** 五日快照：两个交易日，每日一个 session 点。 */
function fiveDayRange(): TimeShareRange {
  const open = Date.UTC(2026, 0, 5, 1, 30)
  return {
    instrumentId: 'test',
    timezone: 'Asia/Shanghai',
    requestedDays: 2,
    olderData: 'exhausted',
    days: [
      {
        tradingDate: '2026-01-05',
        preClose: 10,
        data: [{ timestamp: open, price: 10, average: 10 }],
      },
      {
        tradingDate: '2026-01-06',
        preClose: 10,
        data: [{ timestamp: open + 86_400_000, price: 10.2, average: 10.1 }],
      },
    ],
  }
}

function input(overrides: Partial<ViewInput> & Pick<ViewInput, 'view'>): ViewInput {
  return {
    width: 600,
    dpr: 1,
    kWidth: 8,
    sessionSlotWidth: null,
    data: bars(20),
    dataLength: 20,
    marketSession: null,
    timeShareRange: null,
    scroll: 0,
    ...overrides,
  }
}

describe('VIEW_STRATEGIES', () => {
  it.each([400, 800, 1600])('blank buffers follow the current plot width %s', (width) => {
    const strategy = VIEW_STRATEGIES[ChartDataViewId.KLine]
    const projected = strategy.project(input({ view: ChartDataViewId.KLine, width }))
    expect(projected.domOffset).toBe(width)
    expect(projected.contentWidth - projected.seriesWidth).toBe(width * 2)
    expect(projected.scrollBounds.min).toBeGreaterThanOrEqual(-width)
  })
  it('K 线保持模型滚动并由中心网格派生索引', () => {
    const snapshot = VIEW_STRATEGIES[ChartDataViewId.KLine].project(
      input({ view: ChartDataViewId.KLine, scroll: 0 }),
    )
    expect(snapshot.scroll).toBe(0)
    expect(snapshot.range.end).toBeGreaterThan(0)
    expect(snapshot.viewportWidth).toBe(600)
    const negative = snapshot.indexAtWorld(-5000)!
    expect(negative).toBeLessThan(0)
    // 负索引落在最近槽位中心（kWidth=8、gap=3 → step=10，ORIGIN 对齐物理像素），故存在半个槽位误差。
    expect(Math.abs(snapshot.worldAtIndex(negative)! + 5000)).toBeLessThanOrEqual(
      snapshot.grid.step / 2,
    )
  })

  it('普通分时忽略传入滚动与遗留槽宽，固定适配视口', () => {
    const strategy = VIEW_STRATEGIES[ChartDataViewId.TimeShare]
    const snapshot = strategy.project(
      input({
        view: ChartDataViewId.TimeShare,
        data: timeSharePoints(10),
        dataLength: 10,
        marketSession: ASHARE_MARKET_SESSION,
        sessionSlotWidth: 50,
        scroll: 9999,
      }),
    )
    expect(snapshot.scroll).toBe(0)
    expect(snapshot.contentWidth).toBe(600)
    expect(snapshot.capabilities.allowPan).toBe(false)
    // 视口宽 600 时每个交易槽约 2.5px，数据点落在其实际 session 槽位中心。
    expect(snapshot.centers[0]).toBe(61)
    expect(strategy.navigate(snapshot, 500)).toBe(0)
  })

  it('五日分时按交易日与交易槽位派生内容宽度并限制导航', () => {
    const snapshot = VIEW_STRATEGIES[ChartDataViewId.FiveDayTimeShare].project(
      input({
        view: ChartDataViewId.FiveDayTimeShare,
        data: timeSharePoints(2),
        dataLength: 2,
        marketSession: ASHARE_MARKET_SESSION,
        timeShareRange: fiveDayRange(),
      }),
    )
    // 2 个交易日 × 240 槽全部分布在视口内：每槽恰好占 1px，其余物理余量留给右侧未来空间。
    expect(snapshot.range.end).toBe(2)
    expect(snapshot.capabilities.allowPan).toBe(true)
    expect(snapshot.grid.step).toBeCloseTo(1, 10)
    expect(snapshot.contentWidth).toBe(600)
    expect(snapshot.indexAtWorld(snapshot.centers[0]!)).toBe(0)
  })

  it('对比视图复用 K 线横向规则', () => {
    const bars = VIEW_STRATEGIES[ChartDataViewId.KLine]
    const comparison = VIEW_STRATEGIES[ChartDataViewId.Comparison]
    expect(comparison.project).toBe(bars.project)
    expect(comparison.navigate).toBe(bars.navigate)
  })
})
