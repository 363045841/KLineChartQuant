import { describe, expect, it, vi } from 'vitest'
import {
  createMockCanvasContext,
  createMockRenderContext,
} from '@/engine/__tests__/helpers/renderTestKit'
import { createGridLinesLayer } from '@/engine/render/layers/gridLinesLayer'
import type { ChartDataView } from '@/foundation/types/chartView'
import { ChartDataViewId } from '@/foundation/types/chartView'
import { createDisplayTimeFormatter } from '@/foundation/utils/dateFormat'
import { createDailyBars, createDailyFutureTimestamp } from './helpers/futureAxisTestKit'

/** 构造记录 fillRect 矩形的画布。 */
function createMockCtx() {
  const fillRects: Array<{ x: number; y: number; width: number; height: number }> = []
  const ctx = createMockCanvasContext()
  ctx.fillRect = vi.fn((x: number, y: number, width: number, height: number) => {
    fillRects.push({ x, y, width, height })
  })
  return { ctx, fillRects }
}

// 首尾跨月（1 月 → 2 月），保证 K 线模式下会产生月份纵向分界线
const CROSS_MONTH_DATA = [
  {
    timestamp: new Date('2026-01-31T09:30:00+08:00').getTime(),
    open: 0,
    high: 0,
    low: 0,
    close: 0,
  },
  {
    timestamp: new Date('2026-02-02T09:30:00+08:00').getTime(),
    open: 0,
    high: 0,
    low: 0,
    close: 0,
  },
  {
    timestamp: new Date('2026-02-03T09:30:00+08:00').getTime(),
    open: 0,
    high: 0,
    low: 0,
    close: 0,
  },
]

function buildContext(dataView: ChartDataView) {
  const { ctx, fillRects } = createMockCtx()
  const context = createMockRenderContext({
    ctx,
    data: CROSS_MONTH_DATA,
    range: { start: 0, end: 3 },
    kWidth: 8,
    kGap: 2,
    kLinePositions: [0, 10, 20],
    kLineCenters: [1, 11, 21],
    pane: { top: 0, height: 400 },
    period: 'daily',
    dataView,
    isAsiaMarket: true,
    colorPresetSettings: {},
    displayTimeFormatter: createDisplayTimeFormatter('UTC'),
  })
  return { ctx, fillRects, context }
}

describe('gridLines mode', () => {
  it('draws vertical month boundary lines in kline mode', () => {
    const { fillRects, context } = buildContext(ChartDataViewId.KLine)
    createGridLinesLayer().paint(context)
    const verticals = fillRects.filter((r) => r.width < r.height)
    expect(verticals.length).toBeGreaterThan(0)
    expect(verticals[0]?.x).toBe(1)
  })

  it('does not draw vertical month boundary lines in timeshare mode', () => {
    const { fillRects, context } = buildContext(ChartDataViewId.TimeShare)
    createGridLinesLayer().paint(context)
    const verticals = fillRects.filter((r) => r.width < r.height)
    expect(verticals.length).toBe(0)
  })

  it('draws first-day, day-separator, and last-day boundaries in five-day timeshare mode', () => {
    const { fillRects, context } = buildContext(ChartDataViewId.FiveDayTimeShare)
    context.fiveDayTimeShareGeometry = {
      sessionSlots: 240,
      contentWidth: 800,
      days: [],
      verticalGridLineXs: [0, 400, 800],
    }

    createGridLinesLayer().paint(context)

    const verticals = fillRects.filter((r) => r.width < r.height)
    expect(verticals.map((line) => line.x)).toEqual([0, 400, 800])
  })
})

describe('gridLines 未来区纵向网格', () => {
  // 未来区不产生纵向网格线：有无交易日历回调都只按历史月界定位，结果必须一致。
  it.each([
    { label: '有交易日历回调', withCalendar: true },
    { label: '无交易日历回调', withCalendar: false },
  ])('$label 时未来区不产生纵向网格线', ({ withCalendar }) => {
    const dataLength = 100
    const { ctx, fillRects } = createMockCtx()
    const context = createMockRenderContext({
      ctx,
      data: createDailyBars(dataLength),
      period: 'daily',
      dataView: ChartDataViewId.KLine,
      isAsiaMarket: true,
      colorPresetSettings: {},
      displayTimeFormatter: createDisplayTimeFormatter('UTC'),
      range: { start: 0, end: 160 },
      kLineCenters: Array.from({ length: 160 }, (_, i) => 8 * i + 4),
      ...(withCalendar
        ? { getTimestampAtLogicalIndex: createDailyFutureTimestamp(dataLength) }
        : {}),
      pane: { top: 0, height: 400 },
    })

    createGridLinesLayer().paint(context)

    // 只保留历史月界（首根 + 三个月界）；未来槽位不参与网格线定位。
    const verticals = fillRects.filter((r) => r.width < r.height)
    expect(verticals.map((line) => line.x)).toEqual([4, 76, 316, 564])
  })
})
