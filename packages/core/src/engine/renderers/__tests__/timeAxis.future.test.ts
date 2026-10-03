/**
 * 未来区时间轴测试：collectFutureTimeBoundaries 纯函数语义与 timeAxis 渲染接线。
 *
 * 语义锚点：测试夹具提供连续的未来时间戳；有日历显示年月边界，
 * 无日历按相对索引步长显示 T+X，未来刻度使用 text.tertiary。
 */
import { describe, expect, it } from 'vitest'

import { createMockRenderContext } from '@/engine/__tests__/helpers/renderTestKit'
import { AXIS_LABEL_KIND, type AxisTickLabel, type RenderContext } from '@/foundation/plugin/index'
import { resolveThemeColors } from '@/foundation/tokens/index'
import { createDisplayTimeFormatter } from '@/foundation/utils/dateFormat'
import {
  collectFutureTimeBoundaries,
  createTimeAxisLayer,
  resolveFutureTickStep,
} from '../timeAxis'
import { createDailyBars, createDailyFutureTimestamp } from './helpers/futureAxisTestKit'

/** 以时间轴身份调用时间轴 Layer.paint。 */
function paint(context: RenderContext): void {
  createTimeAxisLayer({ height: 24 }).paint({ ...context, paneId: 'xAxis', clear: false })
}

const DATA_LENGTH = 100
const RANGE_END = 160
const formatter = createDisplayTimeFormatter('UTC')
const getTimestamp = createDailyFutureTimestamp(DATA_LENGTH)

/** 提取边界列表的槽位索引，保持断言只关注 index。 */
const indexesOf = (boundaries: Array<{ index: number }>): number[] =>
  boundaries.map((boundary) => boundary.index)

/** 测试日历中第 steps 个未来槽位的日期 key（UTC 年月日）。 */
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
    paint(context)

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

  it('无交易日历时按整数步长显示 T+X，纯未来视口也有刻度', () => {
    const data = createDailyBars(DATA_LENGTH)
    const context = createMockRenderContext({
      data,
      period: 'daily',
      range: { start: 60, end: RANGE_END },
      kLineCenters: Array.from({ length: RANGE_END - 60 }, (_, i) => 6 * (60 + i) + 3),
      paneWidth: 1400,
      displayTimeFormatter: formatter,
    })
    paint(context)

    // 一槽 8px，最小间距 56px → 取 10 槽步长，刻度只落在 T+10 的倍数，
    // 不再强制补 T+1（首条未来刻度由步长决定）。
    const labels = context.axisLabels
      .forSurface('xTicks')
      .labels.filter((label): label is AxisTickLabel => label.kind === AXIS_LABEL_KIND.TICK)
    const colors = resolveThemeColors('light')
    expect(
      labels.filter((label) => label.color === colors.text.tertiary).map((label) => label.text),
    ).toEqual(['T+10', 'T+20', 'T+30', 'T+40', 'T+50', 'T+60'])

    const futureOnly = createMockRenderContext({
      data,
      period: 'daily',
      range: { start: 120, end: 160 },
      kLineCenters: Array.from({ length: 40 }, (_, i) => 8 * (120 + i) + 4),
      scrollLeft: 900,
    })
    paint(futureOnly)
    expect(futureOnly.axisLabels.forSurface('xTicks').labels.map((label) => label.text)).toEqual([
      'T+30',
      'T+40',
      'T+50',
      'T+60',
    ])
  })

  it('日历仅覆盖部分槽位时，已知日期继续展示，未覆盖的槽显示 T+X', () => {
    const data = createDailyBars(DATA_LENGTH)
    const context = createMockRenderContext({
      data,
      period: 'daily',
      range: { start: 90, end: 140 },
      kLineCenters: Array.from({ length: 50 }, (_, i) => 8 * (90 + i) + 4),
      paneWidth: 1200,
      getTimestampAtLogicalIndex: (index) => (index < 110 ? getTimestamp(index) : null),
      displayTimeFormatter: formatter,
    })
    paint(context)
    const future = context.axisLabels
      .forSurface('xTicks')
      .labels.filter((label): label is AxisTickLabel => label.kind === AXIS_LABEL_KIND.TICK)
      .filter((label) => label.color === resolveThemeColors('light').text.tertiary)
      .map((label) => label.text)
    expect(future).toContain('2月')
    expect(future).toContain('T+20')
    expect(future).not.toContain('T+10')
  })

  it('缩放时占位步长采用 1/2/5 倍数，且标签间距不少于 56px', () => {
    expect(resolveFutureTickStep(8, 56)).toBe(10)
    expect(resolveFutureTickStep(3, 56)).toBe(20)
    expect(resolveFutureTickStep(1, 56)).toBe(100)
  })
})
