/** 时间轴来源：刻度与十字线签完全消费帧坐标，并按周期与市场时段格式化。 */
import { describe, expect, it } from 'vitest'
import { createMockRenderContext } from '@/engine/__tests__/helpers/renderTestKit'
import { createDailyBars } from '@/engine/renderers/__tests__/helpers/dailyBarsTestKit'
import { createTimeFormatter } from '@/foundation/time/index'
import type { KLineData } from '@/foundation/types/price'
import { HK_MARKET_SESSION } from '@/foundation/utils/sessionTimeLabels'
import { collectAxisLabels, TIME_AXIS } from '../index.js'
import type { AxisLabel } from '../types.js'
import { createLabelScope, crosshairTimeText, timeTickTexts } from './helpers.js'

const DATA_LENGTH = 100
const FIRST_BAR_TS = Date.UTC(2025, 9, 23)
const formatter = createTimeFormatter('UTC')

/** 收集时间轴标签，只取时间轴分桶。 */
function collectTimeLabels(
  context: ReturnType<typeof createMockRenderContext>,
  crosshair: { y: number; index: number } | null = null,
): readonly AxisLabel[] {
  return collectAxisLabels([createLabelScope(context, { crosshair })]).forAxis(TIME_AXIS)
}

/** 每日一根、常规槽距一天；中心点与 4px 柱宽 + 2px 间隙的槽位网格一致。 */
function dailyContext(range: { start: number; end: number }, paneWidth = 800, scrollLeft = 0) {
  return createMockRenderContext({
    data: createDailyBars(DATA_LENGTH),
    period: 'daily',
    kWidth: 4,
    kGap: 2,
    range,
    scrollLeft,
    kLineCenters: Array.from(
      { length: range.end - range.start },
      (_, i) => 6 * (range.start + i) + 3,
    ),
    paneWidth,
    displayTimeFormatter: formatter,
  })
}

/** 日内夹具：从 2025-10-23 00:00 UTC 起按固定槽距生成，中心点与槽位网格一致。 */
function intradayContext(options: {
  period: string
  stepMs: number
  count: number
  paneWidth?: number
  scrollLeft?: number
}) {
  const data: KLineData[] = Array.from({ length: options.count }, (_, index) => ({
    timestamp: FIRST_BAR_TS + index * options.stepMs,
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 1000,
  }))
  return createMockRenderContext({
    data,
    period: options.period,
    kWidth: 4,
    kGap: 2,
    range: { start: 0, end: options.count },
    scrollLeft: options.scrollLeft ?? 0,
    kLineCenters: data.map((_, index) => 6 * index + 3),
    paneWidth: options.paneWidth ?? 800,
    displayTimeFormatter: formatter,
  })
}

describe('时间轴刻度消费帧坐标', () => {
  it.each([
    {
      label: '未来月界',
      context: () => dailyContext({ start: 60, end: 160 }),
      expected: ['11月', '12月', '2026', '2月', '3月'],
    },
    {
      label: '纯未来视口',
      context: () => dailyContext({ start: 120, end: 160 }, 1000, 723),
      expected: ['3月'],
    },
    {
      label: '过去留白',
      context: () => dailyContext({ start: 0, end: 0 }, 800, -1000),
      expected: ['6月', '7月', '8月', '9月'],
    },
  ])('$label 显示推导日期', ({ context, expected }) => {
    const texts = timeTickTexts(collectTimeLabels(context()))
    expect(texts.slice(0, expected.length)).toEqual(expected)
  })

  it.each([
    { label: '未来槽位', index: DATA_LENGTH },
    { label: '过去槽位', index: -10 },
  ])('$label 的十字线签使用推导日期', ({ index }) => {
    const context = dailyContext({ start: 90, end: 120 })
    const labels = collectTimeLabels(context, { y: 12, index })
    const timestamp = context.coordinates.logicalToTime(index)!
    expect(crosshairTimeText(labels)).toBe(formatter.formatDateWithWeekday(timestamp))
  })

  it('小时级刻度按日界显示日期且不补时分', () => {
    const context = intradayContext({
      period: '4h',
      stepMs: 4 * 60 * 60 * 1000,
      count: 12,
      scrollLeft: -8,
      paneWidth: 80,
    })
    const texts = timeTickTexts(collectTimeLabels(context))
    expect(texts).toEqual(['10-23', '10-24'])
    expect(texts.some((text) => text.includes(':'))).toBe(false)
  })

  it('日内十字线签在日期后补齐时分', () => {
    const context = intradayContext({ period: '5min', stepMs: 5 * 60 * 1000, count: 12 })
    const timestamp = context.coordinates.logicalToTime(5)!
    expect(crosshairTimeText(collectTimeLabels(context, { y: 12, index: 5 }))).toBe(
      formatter.formatDateTimeWithWeekday(timestamp),
    )
  })
})

describe('时间轴市场时段', () => {
  it('分时按活动市场时段出标签', () => {
    const context = createMockRenderContext({
      data: [
        {
          timestamp: new Date('2026-07-28T09:30:00+08:00').getTime(),
          open: 0,
          high: 0,
          low: 0,
          close: 0,
        },
        {
          timestamp: new Date('2026-07-28T16:00:00+08:00').getTime(),
          open: 0,
          high: 0,
          low: 0,
          close: 0,
        },
      ],
      range: { start: 0, end: 2 },
      kWidth: 1,
      kGap: 0,
      paneWidth: 330,
      kLineCenters: [17, 301],
      period: 'timeshare',
      marketSession: HK_MARKET_SESSION,
    })

    const texts = timeTickTexts(collectTimeLabels(context))
    expect(texts).toContain('09:30')
    expect(texts).toContain('16:00')
    expect(texts).not.toContain('15:00')
  })
})
