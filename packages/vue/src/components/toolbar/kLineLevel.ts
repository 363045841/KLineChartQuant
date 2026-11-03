/**
 * K 线周期档位的单一事实来源：类型、展示顺序与标签、类型守卫。
 * 下拉组件负责渲染，工具栏负责按品种能力过滤，二者共用本模块避免档位列表漂移。
 */
import { KLinePeriod } from '@363045841yyt/klinechart-core/market-data'

export type KLineLevel = KLinePeriod | 'timeshare' | '5daytimeshare'

/** 下拉选项的展示顺序与标签，supportedLevels 只做过滤、不重排。 */
export const K_LINE_LEVEL_OPTIONS: ReadonlyArray<{ label: string; value: KLineLevel }> = [
  { label: '分时', value: 'timeshare' },
  { label: '5日分时', value: '5daytimeshare' },
  { label: '1day', value: KLinePeriod.Daily },
  { label: '1min', value: KLinePeriod.Min1 },
  { label: '5min', value: KLinePeriod.Min5 },
  { label: '15min', value: KLinePeriod.Min15 },
  { label: '30min', value: KLinePeriod.Min30 },
  { label: '1小时', value: KLinePeriod.Min60 },
  { label: '4小时', value: KLinePeriod.Hour4 },
  { label: '1周', value: KLinePeriod.Weekly },
  { label: '1月', value: KLinePeriod.Monthly },
  { label: '3月', value: KLinePeriod.Quarterly },
  { label: '12月', value: KLinePeriod.Yearly },
]

/** 判断数据源周期是否属于图表可展示的 K 线档位。 */
export function isKLineLevel(level: string): level is KLineLevel {
  return K_LINE_LEVEL_OPTIONS.some((option) => option.value === level)
}
