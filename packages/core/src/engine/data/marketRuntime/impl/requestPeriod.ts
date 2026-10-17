/** Request 周期写法映射到 Provider 的标准周期；未支持的值直接拒绝。 */
import type { KLinePeriod } from '@/data/provider/types.js'

const REQUEST_PERIODS: Readonly<Record<string, KLinePeriod>> = {
  '1': '1min',
  '5': '5min',
  '15': '15min',
  '30': '30min',
  '60': '60min',
  '240': '4h',
  D: 'daily',
  W: 'weekly',
  M: 'monthly',
  '3M': 'quarterly',
  '12M': 'yearly',
  '1min': '1min',
  '5min': '5min',
  '15min': '15min',
  '30min': '30min',
  '60min': '60min',
  '4h': '4h',
  daily: 'daily',
  weekly: 'weekly',
  monthly: 'monthly',
  quarterly: 'quarterly',
  yearly: 'yearly',
}

const PERIOD_ORDER: readonly KLinePeriod[] = [
  '1min',
  '5min',
  '15min',
  '30min',
  '60min',
  '4h',
  'daily',
  'weekly',
  'monthly',
  'quarterly',
  'yearly',
]

/** security 第一版只接受同周期或高周期，低周期数组属于独立接口。 */
export function assertSecurityPeriod(target: KLinePeriod, primary: KLinePeriod): void {
  if (PERIOD_ORDER.indexOf(target) < PERIOD_ORDER.indexOf(primary))
    throw new TypeError('request.security 暂不支持低于主图的周期')
}

/** 显式映射别名，不对错误周期做近似替代。 */
export function requestPeriod(value: string): KLinePeriod {
  const period = REQUEST_PERIODS[value]
  if (period === undefined) throw new TypeError(`不支持的 Request 周期：${value}`)
  return period
}
