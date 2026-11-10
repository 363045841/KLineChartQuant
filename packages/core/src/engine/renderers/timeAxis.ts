/** X 轴刻度与十字线时间签的展示层：时间与位置全部来自本帧坐标服务。 */

import { primitiveSink } from '@/rendering/primitives/impl/paint.js'
import { makePluginLayerId } from '../../foundation/plugin/impl/rendererLayerId.js'
import type { AxisLabelCollector, RenderContext } from '../../foundation/plugin/index.js'
import { AXIS_LABEL_KIND, RENDERER_PRIORITY } from '../../foundation/plugin/index.js'
import { resolveThemeColors } from '../../foundation/tokens/index.js'
import {
  isDailyPeriod,
  isMinutePeriod,
  isTimeSharePeriod,
} from '../../foundation/types/chartPeriod.js'
import { ChartDataViewId } from '../../foundation/types/chartView.js'
import type { KLineData } from '../../foundation/types/price.js'
import { getMarketSessionTimeFormatter } from '../../foundation/utils/dateFormat.js'
import {
  ASHARE_MARKET_SESSION,
  computeTimeShareTimeLabels,
  minuteOfDayToTimestamp,
  resolveTimestampSessionSlot,
} from '../../foundation/utils/timeShareAxisLabels.js'
import type { ContextLayer } from '../../rendering/scene/types.js'
import { LAYER_PANE_GLOBAL } from '../../rendering/scene/types.js'
import { createKLineSlotGrid } from '../viewport/slotGrid.js'
import { paintAxisLabels, registerAxisLabel } from './impl/labels/index.js'

/** 时间轴文字与绘图区边界的留白。 */
const AXIS_LABEL_PADDING = 8

/** 将领域交易日格式化为五日轴标签。 */
function formatTradingDateLabel(tradingDate: string): string {
  return tradingDate.slice(5)
}

/**
 * 分时/普通 K 线共用的十字线时间文本。
 *
 * 分时走市场时段 HH:mm；其余周期在日期前带周几，日期与周几使用同一显示时区。
 */
function formatCrosshairTime(context: RenderContext, timestamp: number): string {
  return isTimeSharePeriod(context.period)
    ? getMarketSessionTimeFormatter(
        context.marketSession?.timeZone ?? ASHARE_MARKET_SESSION.timeZone,
      ).formatAxisTime(timestamp)
    : context.displayTimeFormatter.formatDateWithWeekday(timestamp)
}

/**
 * 生产底部时间轴刻度文字标签（普通 K 线 / 分时 / 五日分时）并注册到 xTicks 表面。
 *
 * 普通 K 线逐槽读取本帧坐标服务：位置来自 logicalToX，日期来自 logicalToTime。
 * 过去留白、真实行情与未来留白使用同一套推算，因此日期 key 变化即月界/日界，
 * 不再区分历史边界与相对索引占位。
 *
 * @param context 当前时间轴渲染上下文
 * @param surface xTicks 表面收集器
 * @param width 时间轴逻辑宽度
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

  if (context.dataView === ChartDataViewId.FiveDayTimeShare && context.timeShareGeometry) {
    for (const day of context.timeShareGeometry.days) {
      if (day.tradingDate === undefined) continue
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

  const displayTimeFormatter = context.displayTimeFormatter
  const isMinuteData = isMinutePeriod(period)
  const showOnlyYear = !isMinuteData && !isDailyPeriod(period)
  const labelFn = isMinuteData
    ? displayTimeFormatter.formatAxisDay
    : displayTimeFormatter.formatAxisMonthOrYear
  const keySize = isMinuteData ? 10 : 7
  const minX = AXIS_LABEL_PADDING
  const maxX = Math.max(AXIS_LABEL_PADDING, width - AXIS_LABEL_PADDING)

  // 可见槽位由同一横轴网格给出，包含左侧过去留白与右侧未来留白。
  const grid = createKLineSlotGrid(context.kWidth, context.kGap, context.dpr)
  const firstIndex = Math.floor((scrollLeft + minX - grid.origin) / grid.step)
  const lastIndex = Math.ceil((scrollLeft + maxX - grid.origin) / grid.step)

  /** 起始键取扫描起点前一槽，避免把视口左缘误当成月界；无时间时首槽自行成界。 */
  const leadingTime = context.coordinates.logicalToTime(firstIndex - 1)
  let previousKey =
    leadingTime === null ? null : displayTimeFormatter.formatDate(leadingTime).slice(0, keySize)

  for (let index = firstIndex; index <= lastIndex; index++) {
    const timestamp = context.coordinates.logicalToTime(index)
    if (timestamp === null) continue
    const key = displayTimeFormatter.formatDate(timestamp).slice(0, keySize)
    if (key === previousKey) continue
    previousKey = key
    const screenX = context.coordinates.logicalToX(index)
    if (screenX === null || screenX < minX || screenX > maxX) continue
    const { text, isYear } = labelFn(timestamp)
    if (showOnlyYear && !isYear) continue
    surface.register({
      kind: AXIS_LABEL_KIND.TICK,
      text,
      pos: screenX,
      color: textColor,
      fontSize,
      bold: isYear,
    })
  }
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
export function createTimeAxisLayer(options: TimeAxisLayerOptions): ContextLayer<RenderContext> {
  return {
    kind: 'context',
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
        primitiveSink()(
          ctx,
          [
            {
              kind: 'fill',
              paths: [
                [
                  { x: screenLeftX, y: 0 },
                  { x: screenRightX, y: 0 },
                  { x: screenRightX, y: height },
                  { x: screenLeftX, y: height },
                ],
              ],
              color: range.color,
              opacity: range.opacity,
            },
          ],
          dpr,
        )
      }

      // 十字线时间签与刻度共用本帧坐标服务；越界槽位同样有推导时间。
      const crosshair = options.getCrosshair?.()
      if (crosshair && typeof crosshair.index === 'number') {
        const timestamp = context.coordinates.logicalToTime(crosshair.index)
        if (timestamp !== null) {
          registerAxisLabel(context, 'xCrosshair', {
            kind: AXIS_LABEL_KIND.TAG,
            text: formatCrosshairTime(context, timestamp),
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
