/**
 * K 线周期档位的单一事实来源：类型、展示顺序与标签、类型守卫。
 * 下拉组件负责渲染，工具栏负责按品种能力过滤，二者共用本模块避免档位列表漂移。
 */

export type KLineLevel =
  | '1min'
  | '5min'
  | '15min'
  | '30min'
  | '60min'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'quarterly'
  | 'yearly'
  | 'timeshare'
  | '5daytimeshare'

/** 下拉选项的展示顺序与标签，supportedLevels 只做过滤、不重排。 */
export const K_LINE_LEVEL_OPTIONS: ReadonlyArray<{ label: string; value: KLineLevel }> = [
  { label: '分时', value: 'timeshare' },
  { label: '5日分时', value: '5daytimeshare' },
  { label: '1day', value: 'daily' },
  { label: '1min', value: '1min' },
  { label: '5min', value: '5min' },
  { label: '15min', value: '15min' },
  { label: '30min', value: '30min' },
  { label: '1小时', value: '60min' },
  { label: '1周', value: 'weekly' },
  { label: '1月', value: 'monthly' },
  { label: '3月', value: 'quarterly' },
  { label: '12月', value: 'yearly' },
]

/** 判断数据源周期是否属于图表可展示的 K 线档位。 */
export function isKLineLevel(level: string): level is KLineLevel {
  return K_LINE_LEVEL_OPTIONS.some((option) => option.value === level)
}
