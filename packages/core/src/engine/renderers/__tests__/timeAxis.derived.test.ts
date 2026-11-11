/** 时间轴完全消费帧坐标：过去、真实与未来槽位都显示同一套推导日期。 */
import { describe, expect, it } from 'vitest'
import { createMockRenderContext } from '@/engine/__tests__/helpers/renderTestKit'
import { AXIS_LABEL_KIND, type AxisTickLabel, type RenderContext } from '@/foundation/plugin/index'
import { createTimeFormatter } from '@/foundation/time/index'
import type { KLineData } from '@/foundation/types/price'
import { createTimeAxisLayer } from '../timeAxis'
import { createDailyBars } from './helpers/dailyBarsTestKit'

const DATA_LENGTH = 100
const FIRST_BAR_TS = Date.UTC(2025, 9, 23)
const formatter = createTimeFormatter('UTC')

/** 以时间轴身份调用时间轴 Layer.paint。 */
function paint(context: RenderContext, crosshair?: { x: number; index: number }): void {
  createTimeAxisLayer({ height: 24, getCrosshair: () => crosshair ?? null }).paint({
    ...context,
    paneId: 'xAxis',
    clear: false,
  })
}

/** 只取刻度文字，保持断言与颜色、位置解耦。 */
function tickTexts(context: RenderContext): string[] {
  return context.axisLabels
    .forSurface('xTicks')
    .labels.filter((label): label is AxisTickLabel => label.kind === AXIS_LABEL_KIND.TICK)
    .map((label) => label.text)
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
  scrollLeft?: number
  paneWidth?: number
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
  it('未来月界显示推导日期，不再出现相对索引占位', () => {
    const context = dailyContext({ start: 60, end: 160 })
    paint(context)

    const texts = tickTexts(context)
    expect(texts).toEqual(['11月', '12月', '2026', '2月', '3月'])
    expect(texts.some((text) => text.startsWith('T'))).toBe(false)
  })

  it('纯未来视口同样按推导日期产出刻度', () => {
    const context = dailyContext({ start: 120, end: 160 }, 1000, 723)
    paint(context)

    const texts = tickTexts(context)
    expect(texts[0]).toBe('3月')
    expect(texts.some((text) => text.startsWith('T'))).toBe(false)
  })

  it('过去留白显示推导日期，不再出现负索引占位', () => {
    const context = dailyContext({ start: 0, end: 0 }, 800, -1000)
    paint(context)

    const texts = tickTexts(context)
    expect(texts).toEqual(['6月', '7月', '8月', '9月'])
    expect(texts.some((text) => text.startsWith('T'))).toBe(false)
  })

  it.each([
    { label: '未来槽位', index: DATA_LENGTH },
    { label: '过去槽位', index: -10 },
  ])('$label 的十字线签使用推导日期', ({ index }) => {
    const context = dailyContext({ start: 90, end: 120 })
    paint(context, { x: 42, index })

    const timestamp = context.coordinates.logicalToTime(index)!
    expect(context.axisLabels.forSurface('xCrosshair').labels[0]?.text).toBe(
      formatter.formatDateWithWeekday(timestamp),
    )
  })
})

describe('低周期时间显示', () => {
  it('小时级刻度按日界显示日期且不补时分', () => {
    const context = intradayContext({
      period: '4h',
      stepMs: 4 * 60 * 60 * 1000,
      count: 12,
      scrollLeft: -8,
      paneWidth: 80,
    })
    paint(context)

    const texts = tickTexts(context)
    expect(texts).toEqual(['10-23', '10-24'])
    expect(texts.some((text) => text.includes(':'))).toBe(false)
  })

  it('日内十字线签在日期后补齐时分', () => {
    const context = intradayContext({ period: '5min', stepMs: 5 * 60 * 1000, count: 12 })
    paint(context, { x: 42, index: 5 })

    const timestamp = context.coordinates.logicalToTime(5)!
    expect(context.axisLabels.forSurface('xCrosshair').labels[0]?.text).toBe(
      formatter.formatDateTimeWithWeekday(timestamp),
    )
  })
})
