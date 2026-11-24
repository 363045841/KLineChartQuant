/**
 * 底部时间轴标签：刻度与十字线时间签。
 *
 * 位置一律表达为连续逻辑槽位，像素由列投影换算；时间文本按周期与市场时段
 * 格式化，是时间轴独有的语义，不进入值轴格式化。
 */

import { getMarketSessionTimeFormatter } from '@/foundation/time/index.js'
import { resolveThemeColors } from '@/foundation/tokens/index.js'
import { isIntradayPeriod, isTimeSharePeriod } from '@/foundation/types/chartPeriod.js'
import { ChartDataViewId } from '@/foundation/types/chartView.js'
import {
  ASHARE_MARKET_SESSION,
  computeTimeShareTimeLabels,
  minuteOfDayToTimestamp,
  resolveTimestampSessionSlot,
} from '@/foundation/utils/timeShareAxisLabels.js'
import type { AxisLabel, AxisLabelScope, AxisLabelSource } from '../types.js'

/** 交易日标签只显示月日。 */
function formatTradingDateLabel(tradingDate: string): string {
  return tradingDate.slice(5)
}

/**
 * 分时/普通 K 线共用的十字线时间文本。
 *
 * 分时走市场时段 HH:mm；日线以下补齐时分，其余周期只显示日期与周几。
 */
function formatCrosshairTime(scope: AxisLabelScope, timestamp: number): string {
  if (isTimeSharePeriod(scope.period))
    return getMarketSessionTimeFormatter(
      scope.marketSession?.timeZone ?? ASHARE_MARKET_SESSION.timeZone,
    ).formatAxisTime(timestamp)
  return isIntradayPeriod(scope.period)
    ? scope.timeFormatter.formatDateTimeWithWeekday(timestamp)
    : scope.timeFormatter.formatDateWithWeekday(timestamp)
}

/**
 * 建立会话槽位 → 数据下标索引；同一槽位以最后一次出现的 K 线为准。
 *
 * @param scope 当前收集输入
 * @returns 槽位到绝对下标
 */
function slotIndexToBarIndex(scope: AxisLabelScope): ReadonlyMap<number, number> {
  const market = scope.marketSession ?? ASHARE_MARKET_SESSION
  const bySlot = new Map<number, number>()
  scope.data.forEach((bar, index) => {
    const slot = resolveTimestampSessionSlot(bar.timestamp, market)
    if (slot !== null) bySlot.set(slot, index)
  })
  return bySlot
}

/** 生成时间轴刻度标签：五日按交易日、分时按市场时段、其余消费帧刻度。 */
function collectTicks(scope: AxisLabelScope): AxisLabel[] {
  const labels: AxisLabel[] = []
  if (scope.dataView === ChartDataViewId.FiveDayTimeShare && scope.timeShareGeometry) {
    for (const day of scope.timeShareGeometry.days) {
      if (day.tradingDate === undefined) continue
      const index = scope.worldXToLogical(day.labelX)
      if (index === null) continue
      labels.push({
        kind: 'time',
        role: 'tick',
        index,
        text: formatTradingDateLabel(day.tradingDate),
      })
    }
    return labels
  }

  if (isTimeSharePeriod(scope.period)) {
    const market = scope.marketSession ?? ASHARE_MARKET_SESSION
    const baseTimestamp = scope.data[0]?.timestamp
    if (baseTimestamp === undefined) return labels
    const bySlot = slotIndexToBarIndex(scope)
    const formatter = getMarketSessionTimeFormatter(market.timeZone)
    const slots = computeTimeShareTimeLabels({
      axisWidth: scope.timeAxisWidth,
      marketSession: market,
      minLabelSpacingPx: 56,
    })
    for (const slot of slots) {
      const index = bySlot.get(slot.slotIndex)
      if (index === undefined) continue
      const timestamp = minuteOfDayToTimestamp(baseTimestamp, slot.minuteOfDay, market.timeZone)
      labels.push({ kind: 'time', role: 'tick', index, text: formatter.formatAxisTime(timestamp) })
    }
    return labels
  }

  for (const tick of scope.timeTicks)
    labels.push({
      kind: 'time',
      role: 'tick',
      index: tick.index,
      text: tick.label,
      bold: tick.major,
    })
  return labels
}

export const timeAxisSource: AxisLabelSource = {
  collect(scope: AxisLabelScope): readonly AxisLabel[] {
    const labels = collectTicks(scope)
    if (scope.crosshair) {
      const timestamp = scope.logicalToTime(scope.crosshair.index)
      if (timestamp !== null) {
        const colors = resolveThemeColors(
          scope.theme.theme,
          scope.theme.isAsiaMarket,
          scope.theme.colorPresetSettings,
        )
        labels.push({
          kind: 'time',
          role: 'marker',
          index: scope.crosshair.index,
          text: formatCrosshairTime(scope, timestamp),
          background: colors.crosshairLabelBg,
        })
      }
    }
    return labels
  },
}
