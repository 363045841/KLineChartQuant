import type {
  AxisLabelCollector,
  RenderContext,
  RendererPlugin,
} from '../../foundation/plugin/index.js'
import { AXIS_LABEL_KIND, RENDERER_PRIORITY } from '../../foundation/plugin/index.js'
import { resolveThemeColors } from '../../foundation/tokens/index.js'
import { isDailyPeriod, isMinutePeriod, isTimeSharePeriod } from '../../foundation/types/chartPeriod.js'
import type { KLineData } from '../../foundation/types/price.js'
import { getMarketSessionTimeFormatter } from '../../foundation/utils/dateFormat.js'
import {
  ASHARE_MARKET_SESSION,
  computeTimeShareTimeLabels,
  minuteOfDayToTimestamp,
  resolveTimestampSessionSlot,
} from '../../foundation/utils/timeShareAxisLabels.js'
import { paintAxisLabels, registerAxisLabel } from '../axisLabels/index.js'

/** 时间轴面板 ID（特殊标识，用于单独渲染） */
const TIME_AXIS_PANE_ID = Symbol('time-axis')

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
}

/**
 * 创建时间轴渲染器插件
 * 注意：时间轴渲染到 xAxisCanvas，需要特殊处理
 */
export function createTimeAxisRendererPlugin(options: {
  height: number
  getCrosshair?: () => { x: number; index: number } | null
}): RendererPlugin {
  return {
    name: 'timeAxis',
    version: '1.0.0',
    description: '时间轴渲染器',
    debugName: '时间轴',
    paneId: TIME_AXIS_PANE_ID,
    priority: RENDERER_PRIORITY.SYSTEM_XAXIS,
    isSystem: true, // 系统渲染器：由 Scene Layer 调度

    draw(context: RenderContext) {
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

      // 十字线时间签：注册到 xCrosshair 表面后绘制（先于装饰标签）
      const crosshair = options.getCrosshair?.()
      if (crosshair && typeof crosshair.index === 'number') {
        const k = (context.data as KLineData[])[crosshair.index]
        if (k) {
          registerAxisLabel(context, 'xCrosshair', {
            kind: AXIS_LABEL_KIND.TAG,
            text: formatCrosshairTime(context, k.timestamp),
            pos: crosshair.x,
            bgColor: colors.label.bg,
            textColor: colors.label.text,
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
  }
}
