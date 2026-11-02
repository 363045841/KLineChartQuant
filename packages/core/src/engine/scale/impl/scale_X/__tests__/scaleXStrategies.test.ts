/** 横向标尺策略契约：各数据视图只通过自身策略派生横向几何与能力。 */
import { describe, expect, it } from 'vitest'
import type { TimeShareRange } from '@/data/provider/types'
import {
  createTimeShareDay,
  createTimeSharePoints,
  createTimeShareRange,
} from '@/engine/__tests__/helpers/timeShareTestKit'
import { ChartDataViewId } from '@/foundation/types/chartView'
import type { ChartSeriesDatum } from '@/foundation/types/price'
import { ASHARE_MARKET_SESSION } from '@/foundation/utils/timeShareAxisLabels'
import { SCALE_X_STRATEGIES } from '../scaleXStrategies'
import type { ScaleXInput } from '../types'

/** 分时点统一落在 A 股上午 session 内，保证 slot 索引与数组下标一致。 */
const TIME_SHARE_OPEN = Date.UTC(2026, 0, 5, 1, 30)

function timeSharePoints(length: number): ChartSeriesDatum[] {
  return createTimeSharePoints(length, (index) => ({
    timestamp: TIME_SHARE_OPEN + index * 60_000,
    price: 10 + index * 0.01,
    average: 10,
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
  return createTimeShareRange({
    days: [
      createTimeShareDay({
        tradingDate: '2026-01-05',
        preClose: 10,
        data: [{ timestamp: TIME_SHARE_OPEN, price: 10, average: 10 }],
      }),
      createTimeShareDay({
        tradingDate: '2026-01-06',
        preClose: 10,
        data: [{ timestamp: TIME_SHARE_OPEN + 86_400_000, price: 10.2, average: 10.1 }],
      }),
    ],
  })
}

function input(overrides: Partial<ScaleXInput> & Pick<ScaleXInput, 'view'>): ScaleXInput {
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

describe('SCALE_X_STRATEGIES', () => {
  it.each([400, 800, 1600])('blank buffers follow the current plot width %s', (width) => {
    const strategy = SCALE_X_STRATEGIES[ChartDataViewId.KLine]
    const projected = strategy.project(input({ view: ChartDataViewId.KLine, width }))
    expect(projected.domOffset).toBe(width)
    expect(projected.contentWidth - projected.seriesWidth).toBe(width * 2)
    expect(projected.scrollBounds.min).toBeGreaterThanOrEqual(-width)
  })
  it('K 线保持模型滚动并由中心网格派生索引', () => {
    const snapshot = SCALE_X_STRATEGIES[ChartDataViewId.KLine].project(
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
    const strategy = SCALE_X_STRATEGIES[ChartDataViewId.TimeShare]
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

  it('普通分时在时间戳落在交易时段外时保持索引对齐并断段', () => {
    const points = timeSharePoints(3)
    points[1] = { ...points[1]!, timestamp: Date.UTC(2026, 0, 5, 4, 0) }

    const snapshot = SCALE_X_STRATEGIES[ChartDataViewId.TimeShare].project(
      input({
        view: ChartDataViewId.TimeShare,
        data: points,
        dataLength: 3,
        marketSession: ASHARE_MARKET_SESSION,
      }),
    )

    expect(snapshot.centers).toHaveLength(3)
    expect(snapshot.timeShareGeometry?.segments).toEqual([
      expect.objectContaining({ dataStartIndex: 0, dataEndIndex: 1 }),
      expect.objectContaining({ dataStartIndex: 2, dataEndIndex: 3 }),
    ])
  })

  it('五日分时按交易日与交易槽位派生内容宽度并限制导航', () => {
    const snapshot = SCALE_X_STRATEGIES[ChartDataViewId.FiveDayTimeShare].project(
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

  it('只注册 K 线、分时与五日分时三种图表视图', () => {
    expect(Object.keys(SCALE_X_STRATEGIES).sort()).toEqual([
      'fiveDayTimeShare',
      'kline',
      'timeshare',
    ])
  })
})
