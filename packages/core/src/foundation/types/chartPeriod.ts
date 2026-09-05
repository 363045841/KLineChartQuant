// 图表数据请求周期的领域常量与分类。

/** 分时数据在 SymbolSpec.period 中使用的专用周期标识。 */
export const TIME_SHARE_PERIOD = 'timeshare' as const
/** 五日分时数据在 SymbolSpec.period 中使用的专用周期标识。 */
export const FIVE_DAY_TIME_SHARE_PERIOD = '5daytimeshare' as const
/** 五日分时请求的实际交易日数量。 */
export const FIVE_DAY_TIME_SHARE_DAYS = 5

/** 判断周期是否属于分时数据视图。 */
export function isTimeSharePeriod(period: string | undefined): boolean {
  return period === TIME_SHARE_PERIOD || period === FIVE_DAY_TIME_SHARE_PERIOD
}
