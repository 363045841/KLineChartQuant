// 图表数据请求周期的领域常量与分类。

/** 分时数据在 SymbolSpec.period 中使用的专用周期标识。 */
export const TIME_SHARE_PERIOD = 'timeshare' as const
/** 五日分时数据在 SymbolSpec.period 中使用的专用周期标识。 */
export const FIVE_DAY_TIME_SHARE_PERIOD = '5daytimeshare' as const
/** 五日分时请求的实际交易日数量。 */
export const FIVE_DAY_TIME_SHARE_DAYS = 5

const DAILY_PERIOD = 'daily' as const
const MINUTE_PERIOD_MARKER = 'min'
const HOUR_PERIOD_MARKER = 'h'

export function isMinutePeriod(period: string | undefined): boolean {
  return period?.includes(MINUTE_PERIOD_MARKER) ?? false
}

/** 判断周期是否低于日线（分钟或小时），用于日内时间显示与日内边界。 */
export function isIntradayPeriod(period: string | undefined): boolean {
  return isMinutePeriod(period) || (period?.endsWith(HOUR_PERIOD_MARKER) ?? false)
}

export function isDailyPeriod(period: string | undefined): boolean {
  return period === DAILY_PERIOD
}

/** 判断周期是否属于分时数据视图。 */
export function isTimeSharePeriod(period: string | undefined): boolean {
  return period === TIME_SHARE_PERIOD || period === FIVE_DAY_TIME_SHARE_PERIOD
}
