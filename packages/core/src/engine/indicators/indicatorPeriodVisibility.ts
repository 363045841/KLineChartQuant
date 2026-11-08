// 指标周期可见性判定：把图表周期解析成「单位 + 数值」，再与指标声明的可见范围比较。
import type { KLinePeriod } from '../../data/provider/types.js'
import type {
  IndicatorInputOption,
  IndicatorPeriodUnit,
  IndicatorPeriodVisibility,
} from './indicatorMetadata.js'

/** 周期解析结果：单位与同单位内的数值。 */
export interface ParsedIndicatorPeriod {
  readonly unit: IndicatorPeriodUnit
  readonly value: number
}

/** 周期到单位/数值的静态映射；顺序即枚举顺序（由短到长）。 */
const PERIOD_PARTS: Readonly<Record<string, ParsedIndicatorPeriod>> = {
  '1min': { unit: 'minute', value: 1 },
  '5min': { unit: 'minute', value: 5 },
  '15min': { unit: 'minute', value: 15 },
  '30min': { unit: 'minute', value: 30 },
  '60min': { unit: 'minute', value: 60 },
  '4h': { unit: 'hour', value: 4 },
  daily: { unit: 'day', value: 1 },
  weekly: { unit: 'week', value: 1 },
  monthly: { unit: 'month', value: 1 },
  quarterly: { unit: 'quarter', value: 1 },
  yearly: { unit: 'month', value: 12 },
}

/** 周期顺序表与索引：实例区间判定按此顺序比较长短。 */
const PERIOD_ORDER: ReadonlyArray<string> = Object.keys(PERIOD_PARTS)
const PERIOD_INDEX: ReadonlyMap<string, number> = new Map(
  PERIOD_ORDER.map((period, index) => [period, index]),
)

/** 参数表里的可见周期区间字段；两端都是周期键，与定义声明取交集。 */
export const INDICATOR_PERIOD_RANGE_PARAM_KEYS = {
  from: 'visibleFrom',
  to: 'visibleTo',
} as const

/** 解析后的可见周期区间；某一端缺省表示该端不约束。 */
export interface IndicatorPeriodRange {
  readonly from?: string
  readonly to?: string
}

/**
 * 参数面板里的周期选项。
 *
 * 取值必须与 `PERIOD_PARTS` 的键完全一致，顺序也由短到长；
 * 此处单独列出是为了让面板显示中文名，一致性由单测锁定。
 */
export const INDICATOR_PERIOD_INPUT_OPTIONS: ReadonlyArray<IndicatorInputOption> = [
  { value: '1min', label: '1 分钟' },
  { value: '5min', label: '5 分钟' },
  { value: '15min', label: '15 分钟' },
  { value: '30min', label: '30 分钟' },
  { value: '60min', label: '60 分钟' },
  { value: '4h', label: '4 小时' },
  { value: 'daily', label: '日线' },
  { value: 'weekly', label: '周线' },
  { value: 'monthly', label: '月线' },
  { value: 'quarterly', label: '季线' },
  { value: 'yearly', label: '年线' },
]

/**
 * 解析图表周期。
 * @param period 图表周期
 * @returns 单位与数值；未知周期返回 undefined
 */
export function parseIndicatorPeriod(
  period: KLinePeriod | string,
): ParsedIndicatorPeriod | undefined {
  return PERIOD_PARTS[period]
}

/** 读取参数表里的周期键；非字符串视为未声明。 */
function readPeriodParam(
  params: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = params?.[key]
  return typeof value === 'string' ? value : undefined
}

/**
 * 由定义默认参数与实例参数解析可见周期区间。
 *
 * 实例参数只保存改动过的字段，缺失项必须用定义默认值补齐，
 * 否则「没改过参数」与「改成默认值」会产生不同的可见性。
 * @param defaults 定义声明的默认参数
 * @param params 实例参数
 * @returns 区间两端；都缺省表示不约束
 */
export function resolveIndicatorPeriodRange(
  defaults: Record<string, unknown> | undefined,
  params: Record<string, unknown> | undefined,
): IndicatorPeriodRange {
  const merged = { ...defaults, ...params }
  return {
    from: readPeriodParam(merged, INDICATOR_PERIOD_RANGE_PARAM_KEYS.from),
    to: readPeriodParam(merged, INDICATOR_PERIOD_RANGE_PARAM_KEYS.to),
  }
}

/**
 * 判断周期是否落在实例配置的区间内。
 *
 * 任一端未声明、或当前周期/边界值无法解析时都不做约束，
 * 避免参数残缺时把指标整块隐藏。
 * @param period 当前图表周期
 * @param from 区间起点周期键，含
 * @param to 区间终点周期键，含
 * @returns 是否在区间内
 */
export function isPeriodInRange(
  period: KLinePeriod | string,
  from: string | undefined,
  to: string | undefined,
): boolean {
  if (from === undefined && to === undefined) return true
  const current = PERIOD_INDEX.get(period)
  if (current === undefined) return true
  const lower = from === undefined ? 0 : PERIOD_INDEX.get(from)
  const upper = to === undefined ? PERIOD_ORDER.length - 1 : PERIOD_INDEX.get(to)
  if (lower === undefined || upper === undefined) return true
  return current >= lower && current <= upper
}

/**
 * 判断指标在当前周期是否可见。
 *
 * 定义声明的范围是能力上限，窗口区间只能在其中进一步收窄；
 * 两者都未声明时始终可见。
 * @param period 当前图表周期
 * @param ranges 指标声明的可见范围
 * @param range 实例解析出的可见周期区间
 * @returns 是否可见
 */
export function isIndicatorVisibleOnPeriod(
  period: KLinePeriod | string,
  ranges: readonly IndicatorPeriodVisibility[] | undefined,
  range?: IndicatorPeriodRange,
): boolean {
  if (!isPeriodInRange(period, range?.from, range?.to)) return false
  if (ranges === undefined || ranges.length === 0) return true
  const parsed = parseIndicatorPeriod(period)
  if (parsed === undefined) return true
  return ranges.some((item) => {
    if (item.unit !== parsed.unit) return false
    if (item.min !== undefined && parsed.value < item.min) return false
    if (item.max !== undefined && parsed.value > item.max) return false
    return true
  })
}
