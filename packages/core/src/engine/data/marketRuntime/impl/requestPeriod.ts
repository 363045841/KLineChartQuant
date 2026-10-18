/** Request 周期写法映射到 Provider 的标准周期；未支持的值直接拒绝。 */
import { isKLinePeriod, KLINE_PERIODS, type KLinePeriod } from '@/data/provider/types.js'

/**
 * 对外短写法与标准周期名不一致的部分。
 *
 * 标准周期名（如 '60min'、'daily'）由 isKLinePeriod 恒等放行，不在这里重复登记；
 * 别名只做显式映射，不对错误周期做近似替代。
 */
const REQUEST_PERIOD_ALIASES: Readonly<Record<string, KLinePeriod>> = {
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
}

/** security 第一版只接受同周期或高周期，低周期数组属于独立接口。 */
export function assertSecurityPeriod(target: KLinePeriod, primary: KLinePeriod): void {
  if (KLINE_PERIODS.indexOf(target) < KLINE_PERIODS.indexOf(primary))
    throw new TypeError('request.security 暂不支持低于主图的周期')
}

/** 先解析别名，再恒等放行标准周期名，其余一律拒绝。 */
export function requestPeriod(value: string): KLinePeriod {
  const alias = REQUEST_PERIOD_ALIASES[value]
  if (alias !== undefined) return alias
  if (isKLinePeriod(value)) return value
  throw new TypeError(`不支持的 Request 周期：${value}`)
}
