/** X 轴刻度、十字线时间签与绘图轴标签的绘制入口。 */

import { makePluginLayerId } from '../../foundation/plugin/impl/rendererLayerId.js'
import type { AxisLabelCollector, RenderContext } from '../../foundation/plugin/index.js'
import { AXIS_LABEL_KIND, RENDERER_PRIORITY } from '../../foundation/plugin/index.js'
import { resolveThemeColors } from '../../foundation/tokens/index.js'
import {
  isDailyPeriod,
  isMinutePeriod,
  isTimeSharePeriod,
} from '../../foundation/types/chartPeriod.js'
import type { KLineData } from '../../foundation/types/price.js'
import { getMarketSessionTimeFormatter } from '../../foundation/utils/dateFormat.js'
import {
  formatFutureSlotLabel,
  formatPastSlotLabel,
  resolveAxisTimeLabel,
} from '../../foundation/utils/futureSlotLabel.js'
import {
  ASHARE_MARKET_SESSION,
  computeTimeShareTimeLabels,
  minuteOfDayToTimestamp,
  resolveTimestampSessionSlot,
} from '../../foundation/utils/timeShareAxisLabels.js'
import type { Layer } from '../../rendering/scene/types.js'
import { LAYER_PANE_GLOBAL } from '../../rendering/scene/types.js'
import { paintAxisLabels, registerAxisLabel } from '../labels/index.js'
import { createKLineSlotGrid, slotWorldX } from '../viewport/slotGrid.js'

/** 未来占位刻度之间的最小逻辑像素间距。 */
const FUTURE_TICK_MIN_SPACING = 56

/** 将领域交易日格式化为五日轴标签。 */
function formatTradingDateLabel(tradingDate: string): string {
  return tradingDate.slice(5)
}

/** 分时/普通 K 线共用的十字线时间文本：分时走市场时段 HH:mm。 */
function formatCrosshairTime(context: RenderContext, timestamp: number): string {
  return isTimeSharePeriod(context.period)
    ? getMarketSessionTimeFormatter(
        context.marketSession?.timeZone ?? ASHARE_MARKET_SESSION.timeZone,
      ).formatAxisTime(timestamp)
    : context.displayTimeFormatter.formatDate(timestamp)
}

/**
 * 解析十字线索引的时间戳：优先真实 bar，未来槽位只读取数据源日历。
 * @returns 时间戳；无法解析（负索引、无数据、无 session）返回 null
 */
export function resolveCrosshairTimestamp(context: RenderContext, index: number): number | null {
  const k = (context.data as KLineData[])[index]
  if (k) return k.timestamp
  return context.getTimestampAtLogicalIndex?.(index) ?? null
}

/**
 * 生产底部时间轴刻度文字标签（普通 K 线 / 分时 / 五日分时）并注册到 xTicks 表面。
 *
 * @param context - 当前时间轴渲染上下文
 * @param surface - xTicks 表面收集器
 * @param width - 时间轴逻辑宽度
 */
function collectTimeAxisTicks(
  context: RenderContext,
  surface: AxisLabelCollector,
  width: number,
): void {
  const { data, range, scrollLeft, period } = context
  const klineData = data as KLineData[]
  const colors = resolveThemeColors(
    context.theme,
    context.isAsiaMarket,
    context.colorPresetSettings,
  )
  const textColor = colors.text.secondary
  const fontSize = 12

  if (context.fiveDayTimeShareGeometry) {
    for (const day of context.fiveDayTimeShareGeometry.days) {
      const screenX = day.labelX - scrollLeft
      if (screenX < 0 || screenX > width) continue
      surface.register({
        kind: AXIS_LABEL_KIND.TICK,
        text: formatTradingDateLabel(day.tradingDate),
        pos: screenX,
        color: textColor,
        fontSize,
      })
    }
    return
  }

  if (isTimeSharePeriod(period)) {
    const market = context.marketSession ?? ASHARE_MARKET_SESSION
    const labels = computeTimeShareTimeLabels({
      axisWidth: width,
      marketSession: market,
      minLabelSpacingPx: 56,
    })
    const baseTs = klineData[0]?.timestamp ?? Date.now()
    const centerBySlot = new Map<number, number>()
    for (let index = range.start; index < range.end; index++) {
      const item = klineData[index]
      const centerX = context.kLineCenters[index - range.start]
      if (!item || centerX === undefined) continue
      const slotIndex = resolveTimestampSessionSlot(item.timestamp, market)
      if (slotIndex !== null) centerBySlot.set(slotIndex, centerX)
    }
    const formatter = getMarketSessionTimeFormatter(market.timeZone)
    for (const label of labels) {
      const centerX = centerBySlot.get(label.slotIndex)
      if (centerX === undefined) continue
      const drawX = centerX - scrollLeft
      if (drawX < 0 || drawX > width) continue
      const ts = minuteOfDayToTimestamp(baseTs, label.minuteOfDay, market.timeZone)
      surface.register({
        kind: AXIS_LABEL_KIND.TICK,
        text: formatter.formatAxisTime(ts),
        pos: drawX,
        color: textColor,
        fontSize,
      })
    }
    return
  }

  const isMinuteData = isMinutePeriod(period)
  const showOnlyYear = !isMinuteData && !isDailyPeriod(period)
  const displayTimeFormatter = context.displayTimeFormatter
  const boundaries = isMinuteData
    ? displayTimeFormatter.getDayBoundaries(klineData)
    : displayTimeFormatter.getMonthBoundaries(klineData)
  const labelFn = isMinuteData
    ? displayTimeFormatter.formatAxisDay
    : displayTimeFormatter.formatAxisMonthOrYear
  const paddingX = 8
  const minX = paddingX
  const maxX = Math.max(paddingX, width - paddingX)

  // 过去空白使用同一槽位中心网格，不伪造首根行情之前的交易日期。
  const grid = createKLineSlotGrid(context.kWidth, context.kGap, context.dpr)
  const pastStep = resolveFutureTickStep(grid.step, FUTURE_TICK_MIN_SPACING)
  const pastStart = Math.ceil((scrollLeft + minX - grid.origin) / grid.step)
  const pastEnd = Math.min(-1, Math.floor((scrollLeft + maxX - grid.origin) / grid.step))
  for (
    let index = Math.ceil(pastStart / pastStep) * pastStep;
    index <= pastEnd;
    index += pastStep
  ) {
    const text = formatPastSlotLabel(index)
    if (text === null) continue
    surface.register({
      kind: AXIS_LABEL_KIND.TICK,
      text,
      pos: slotWorldX(grid, index) - scrollLeft,
      color: colors.text.tertiary,
      fontSize,
    })
  }

  for (const idx of boundaries) {
    if (idx < range.start || idx >= range.end) continue
    const k = klineData[idx]
    if (!k) continue
    const { text, isYear } = labelFn(k.timestamp)
    if (showOnlyYear && !isYear) continue
    const centerX = context.kLineCenters[idx - range.start]
    if (centerX === undefined) continue
    const screenX = centerX - scrollLeft
    if (screenX < minX || screenX > maxX) continue
    surface.register({
      kind: AXIS_LABEL_KIND.TICK,
      text,
      pos: Math.min(Math.max(screenX, minX), maxX),
      color: textColor,
      fontSize,
      bold: isYear,
    })
  }

  // 已知的未来日期仍按日/月边界生成刻度。
  const futureBoundaries = collectFutureTimeBoundaries({
    dataLength: klineData.length,
    rangeStart: range.start,
    rangeEnd: range.end,
    kind: isMinuteData ? 'day' : 'month',
    getTimestamp: (idx) => context.getTimestampAtLogicalIndex?.(idx) ?? null,
    dateKeyOf: (ts) => displayTimeFormatter.formatDate(ts),
  })
  for (const boundary of futureBoundaries) {
    // 对称防御：collect 已保证界内
    if (boundary.index < range.start || boundary.index >= range.end) continue
    const { text, isYear } = labelFn(boundary.timestamp)
    if (showOnlyYear && !isYear) continue
    const centerX = context.kLineCenters[boundary.index - range.start]
    if (centerX === undefined) continue
    const screenX = centerX - scrollLeft
    if (screenX < minX || screenX > maxX) continue
    surface.register({
      kind: AXIS_LABEL_KIND.TICK,
      text,
      pos: Math.min(Math.max(screenX, minX), maxX),
      // 未来日期显示为辅助信息，刻度降级为 tertiary
      color: colors.text.tertiary,
      fontSize,
      bold: isYear,
    })
  }

  // 日历未覆盖的槽位按整齐的相对索引步长标注；位置始终由槽位 index 决定。
  // 不强制补 T+1：首条未来刻度完全由步长决定，避免紧贴末根 K 线的标签拥挤。
  if (!klineData.length || range.end <= klineData.length) return
  const step = resolveFutureTickStep(context.kWidth + context.kGap, FUTURE_TICK_MIN_SPACING)
  const firstOffset = Math.max(1, range.start - klineData.length + 1)
  for (
    let offset = Math.ceil(firstOffset / step) * step;
    offset <= range.end - klineData.length;
    offset += step
  ) {
    const index = klineData.length - 1 + offset
    if (context.getTimestampAtLogicalIndex?.(index) != null) continue
    const centerX = context.kLineCenters[index - range.start]
    if (centerX === undefined) continue
    const screenX = centerX - scrollLeft
    if (screenX < minX || screenX > maxX) continue
    // 与已有的历史刻度或日历刻度保持距离，避免文字相互覆盖。
    if (surface.labels.some((label) => Math.abs(label.pos - screenX) < FUTURE_TICK_MIN_SPACING))
      continue
    const text = formatFutureSlotLabel(index, klineData.length)
    if (text === null) continue
    surface.register({
      kind: AXIS_LABEL_KIND.TICK,
      text,
      pos: screenX,
      color: colors.text.tertiary,
      fontSize,
    })
  }
}

/** 取不小于所需间隔的 1/2/5 × 10^n 槽位步长。 */
export function resolveFutureTickStep(slotWidth: number, minSpacing: number): number {
  if (!(slotWidth > 0) || !(minSpacing > 0)) return 1
  const desired = minSpacing / slotWidth
  if (desired <= 1) return 1
  const power = 10 ** Math.floor(Math.log10(desired))
  for (const factor of [1, 2, 5, 10]) {
    const step = factor * power
    if (step >= desired) return step
  }
  return 10 * power
}

/**
 * 收集未来槽位的时间边界（月界或日界），与历史边界同帧渲染。
 *
 * 纯函数只做 key 变化检测：时间戳经 getTimestamp 回调获取（未来索引读取数据源日历，
 * null 跳过且 previous 不变），渲染器不推导时间。
 *
 * @param params.dataLength 真实数据长度（边界只从 >= dataLength 的槽位起）
 * @param params.rangeStart 当前可见区间起点
 * @param params.rangeEnd 当前可见区间终点（开区间）
 * @param params.kind 边界粒度：'month'（年月 key）| 'day'（年月日 key）
 * @param params.getTimestamp 逻辑索引 → 时间戳（未来索引无日历值时返回 null）
 * @param params.dateKeyOf 时间戳 → 时区感知日期 key（YYYY-MM-DD）
 * @returns 边界列表（升序，含槽位索引与该槽时间戳）
 */
export function collectFutureTimeBoundaries(params: {
  dataLength: number
  rangeStart: number
  rangeEnd: number
  kind: 'month' | 'day'
  getTimestamp: (index: number) => number | null
  dateKeyOf: (timestamp: number) => string
}): Array<{ index: number; timestamp: number }> {
  const { dataLength, rangeStart, rangeEnd, kind, getTimestamp, dateKeyOf } = params
  // 无历史数据无法取 previous 初值，且无未来槽位时无边界
  if (dataLength === 0 || rangeEnd <= dataLength) return []

  const keySize = kind === 'month' ? 7 : 10
  // previous 取扫描起点前一槽的 key：每槽与自身前一槽比 key 恒正确，纯未来视口
  // （rangeStart > dataLength）不会误跨末根历史 bar 的 key；
  // rangeStart <= dataLength 时该槽即末根历史 bar，首个未来槽位跨历史 key 仍成界
  const start = Math.max(dataLength, rangeStart)
  const anchorTs = getTimestamp(start - 1)
  if (anchorTs === null) return []
  let previous = dateKeyOf(anchorTs).slice(0, keySize)

  const boundaries: Array<{ index: number; timestamp: number }> = []
  for (let index = start; index < rangeEnd; index++) {
    const ts = getTimestamp(index)
    if (ts === null) continue
    const key = dateKeyOf(ts).slice(0, keySize)
    if (key !== previous) {
      boundaries.push({ index, timestamp: ts })
      previous = key
    }
  }
  return boundaries
}

/** 时间轴 Layer 选项。 */
export interface TimeAxisLayerOptions {
  height: number
  getCrosshair?: () => { x: number; index: number } | null
}

/**
 * 时间轴 Layer。时间轴渲染到 xAxisCanvas，由 ChartRenderer 直接调度。
 * @param options 时间轴高度与十字线读取器
 */
export function createTimeAxisLayer(options: TimeAxisLayerOptions): Layer<RenderContext> {
  return {
    id: makePluginLayerId('timeAxis'),
    role: 'background',
    pane: LAYER_PANE_GLOBAL,
    z: RENDERER_PRIORITY.SYSTEM_XAXIS,
    visible: true,
    paint(context) {
      const { ctx, paneWidth, dpr } = context
      const colors = resolveThemeColors(
        context.theme,
        context.isAsiaMarket,
        context.colorPresetSettings,
      )

      // 时间轴绘制到传入的 ctx，使用 paneWidth 作为宽度确保与视口一致
      const width = paneWidth
      const height = options.height
      const metrics = { dpr, axisWidth: width, axisHeight: height }

      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.scale(dpr, dpr)
      ctx.clearRect(0, 0, width, height)

      // 刻度文字：经 axisLabels 模块生产并绘制
      const tickSurface = context.axisLabels.forSurface('xTicks')
      collectTimeAxisTicks(context, tickSurface, width)
      paintAxisLabels(ctx, tickSurface.labels, 'xTicks', metrics)

      // 绘制来自 xAxisRanges 的时间范围带（先于十字线与装饰标签）
      for (const range of context.xAxisRanges) {
        const screenLeftX = range.leftX - context.scrollLeft
        const screenRightX = range.rightX - context.scrollLeft
        const bandWidth = screenRightX - screenLeftX
        if (bandWidth <= 0) continue
        ctx.save()
        ctx.globalAlpha = range.opacity
        ctx.fillStyle = range.color
        ctx.fillRect(screenLeftX, 0, bandWidth, height)
        ctx.restore()
      }

      // 十字线时间签：真实 bar 或日历显示日期；无日历的未来槽显示相对索引。
      const crosshair = options.getCrosshair?.()
      if (crosshair && typeof crosshair.index === 'number') {
        const ts = resolveCrosshairTimestamp(context, crosshair.index)
        const text = resolveAxisTimeLabel(crosshair.index, context.data.length, ts, (timestamp) =>
          formatCrosshairTime(context, timestamp),
        )
        if (text !== null) {
          registerAxisLabel(context, 'xCrosshair', {
            kind: AXIS_LABEL_KIND.TAG,
            text,
            pos: crosshair.x,
            bgColor: colors.crosshairLabelBg,
            textColor: colors.crosshairLabelText,
            fontSize: 12,
          })
        }
      }
      paintAxisLabels(
        ctx,
        context.axisLabels.forSurface('xCrosshair').labels,
        'xCrosshair',
        metrics,
      )

      // 图元装饰标签（帧准备阶段注册）最后绘制
      paintAxisLabels(ctx, context.axisLabels.forSurface('xLabels').labels, 'xLabels', metrics)
    },
    dispose() {},
  }
}
