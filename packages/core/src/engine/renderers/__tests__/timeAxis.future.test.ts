/**
 * 未来区时间轴测试：collectFutureTimeBoundaries 纯函数语义与 timeAxis 渲染接线。
 *
 * 语义锚点：数据止于 2026-01-30（周五），FOREX 日历外推跳周末；
 * 未来刻度按外推时间的年月 key 变化检测，color 降级为 text.tertiary。
 */
import { describe, expect, it } from 'vitest'

import { createMockRenderContext } from '@/engine/__tests__/helpers/renderTestKit'
import { AXIS_LABEL_KIND, type AxisTickLabel } from '@/foundation/plugin/index'
import { resolveThemeColors } from '@/foundation/tokens/index'
import { createDisplayTimeFormatter } from '@/foundation/utils/dateFormat'
import { collectFutureTimeBoundaries, createTimeAxisRendererPlugin } from '../timeAxis'
import { createDailyBars, createDailyFutureTimestamp } from './helpers/futureAxisTestKit'

const DATA_LENGTH = 100
const RANGE_END = 160
const formatter = createDisplayTimeFormatter('UTC')
const getTimestamp = createDailyFutureTimestamp(DATA_LENGTH)

/** 提取边界列表的槽位索引，保持断言只关注 index。 */
const indexesOf = (boundaries: Array<{ index: number }>): number[] =>
  boundaries.map((boundary) => boundary.index)

/** FOREX 日历下第 steps 个未来槽位的日期 key（UTC 年月日）。 */
function futureKey(steps: number): string {
  return formatter.formatDate(getTimestamp(DATA_LENGTH + steps) ?? Number.NaN)
}

describe('collectFutureTimeBoundaries 纯函数', () => {
  it('检出未来月界，边界落在 [dataLength, rangeEnd) 且 key 变化', () => {
    const boundaries = collectFutureTimeBoundaries({
      dataLength: DATA_LENGTH,
      rangeStart: 90,
      rangeEnd: RANGE_END,
      kind: 'month',
      getTimestamp,
      dateKeyOf: (ts) => formatter.formatDate(ts),
    })

    expect(boundaries.length).toBeGreaterThan(0)
    for (const idx of indexesOf(boundaries)) {
      expect(idx).toBeGreaterThanOrEqual(DATA_LENGTH)
      expect(idx).toBeLessThan(RANGE_END)
    }
    // 夹具提供连续槽位时间戳，月界由返回的时间戳决定。
    expect(indexesOf(boundaries)).toEqual([101, 129])
    expect(futureKey(1)).toBe('2026-02-01')
  })

  it('无未来槽位（rangeEnd <= dataLength）返回空数组', () => {
    expect(
      collectFutureTimeBoundaries({
        dataLength: DATA_LENGTH,
        rangeStart: 90,
        rangeEnd: DATA_LENGTH,
        kind: 'month',
        getTimestamp,
        dateKeyOf: (ts) => formatter.formatDate(ts),
      }),
    ).toEqual([])
  })

  it('getTimestamp 全部返回 null 时跳过所有槽位', () => {
    expect(
      collectFutureTimeBoundaries({
        dataLength: DATA_LENGTH,
        rangeStart: DATA_LENGTH,
        rangeEnd: RANGE_END,
        kind: 'month',
        getTimestamp: () => null,
        dateKeyOf: (ts) => formatter.formatDate(ts),
      }),
    ).toEqual([])
  })

  it('day kind 检出跨日边界，同日后续槽位不记', () => {
    // 日内场景：小时槽位，24/7 连续交易日历（线性外推），末根 2026-01-30 23:00 UTC
    const lastTs = Date.UTC(2026, 0, 30, 23)
    const hourlyTimestamp = (index: number): number | null =>
      index < 100 ? Date.UTC(2025, 11, 1) + index * 3_600_000 : lastTs + (index - 99) * 3_600_000

    const boundaries = collectFutureTimeBoundaries({
      dataLength: DATA_LENGTH,
      rangeStart: DATA_LENGTH,
      rangeEnd: DATA_LENGTH + 30,
      kind: 'day',
      getTimestamp: hourlyTimestamp,
      dateKeyOf: (ts) => formatter.formatDate(ts),
    })

    // 未来区日界：01-31 00:00（slot 100）与 02-01 00:00（slot 124）；同日其余小时槽不记
    expect(indexesOf(boundaries)).toEqual([DATA_LENGTH, DATA_LENGTH + 24])
  })

  it('dataLength 为 0 返回空数组', () => {
    expect(
      collectFutureTimeBoundaries({
        dataLength: 0,
        rangeStart: 0,
        rangeEnd: 10,
        kind: 'month',
        getTimestamp: () => 0,
        dateKeyOf: () => '2026-01',
      }),
    ).toEqual([])
  })

  it('纯未来视口（rangeStart > dataLength）锚点取扫描起点前一槽，不误判首槽月界', () => {
    // 每个槽位与前一槽比较日期 key，而不是与最后一根历史 K 线比较。
    const boundaries = collectFutureTimeBoundaries({
      dataLength: DATA_LENGTH,
      rangeStart: 130,
      rangeEnd: 190,
      kind: 'month',
      getTimestamp,
      dateKeyOf: (ts) => formatter.formatDate(ts),
    })

    expect(indexesOf(boundaries)).toEqual([160])
    expect(indexesOf(boundaries)).not.toContain(130)
    expect(boundaries[0]?.timestamp).toBe(Date.UTC(2026, 3, 1))
  })
})

describe('collectTimeAxisTicks 未来区接线', () => {
  /**
   * 构造跨未来区的日 K RenderContext：历史月界与未来月界同屏。
   * 槽位间距 6px（center = 6*idx + 3），paneWidth 800 内可见 idx <= 131。
   */
  function buildFutureContext() {
    const data = createDailyBars(DATA_LENGTH)
    const context = createMockRenderContext({
      data,
      period: 'daily',
      range: { start: 60, end: RANGE_END },
      kLineCenters: Array.from({ length: RANGE_END - 60 }, (_, i) => 6 * (60 + i) + 3),
      getTimestampAtLogicalIndex: getTimestamp,
      displayTimeFormatter: formatter,
    })
    return context
  }

  it('未来月界刻度以 text.tertiary 注册，历史刻度保持 secondary', () => {
    const context = buildFutureContext()
    createTimeAxisRendererPlugin({ height: 24 }).draw(context)

    // xTicks 表面只注册 TICK 变体，kind 收窄后读取 color/bold
    const labels = context.axisLabels
      .forSurface('xTicks')
      .labels.filter((label): label is AxisTickLabel => label.kind === AXIS_LABEL_KIND.TICK)
    const colors = resolveThemeColors('light')
    const future = labels.filter((label) => label.color === colors.text.tertiary)
    const historical = labels.filter((label) => label.color === colors.text.secondary)

    // 可视范围内未来月界：idx 100（'2月'）、idx 120（'3月'）；idx 142 超出 paneWidth 被裁剪
    expect(future.map((label) => label.text)).toEqual(['2月', '3月'])
    // 历史年界 idx 70（2026-01-01）保持原样式
    expect(historical.map((label) => label.text)).toContain('2026')
    expect(historical.find((label) => label.text === '2026')?.bold).toBe(true)
  })

  it('无 getTimestampAtLogicalIndex 时（分时路径）不产生未来刻度', () => {
    const data = createDailyBars(DATA_LENGTH)
    const context = createMockRenderContext({
      data,
      period: 'daily',
      range: { start: 60, end: RANGE_END },
      kLineCenters: Array.from({ length: RANGE_END - 60 }, (_, i) => 6 * (60 + i) + 3),
      displayTimeFormatter: formatter,
    })
    createTimeAxisRendererPlugin({ height: 24 }).draw(context)

    // xTicks 表面只注册 TICK 变体，kind 收窄后读取 color
    const labels = context.axisLabels
      .forSurface('xTicks')
      .labels.filter((label): label is AxisTickLabel => label.kind === AXIS_LABEL_KIND.TICK)
    const colors = resolveThemeColors('light')
    expect(labels.filter((label) => label.color === colors.text.tertiary)).toEqual([])
  })
})
