/** 脚本请求周期写法映射到标准周期；未支持的写法直接拒绝。 */
import { isKLinePeriod, KLINE_PERIODS, KLinePeriod } from '@/data/provider/types.js'

/** 对外短写法与标准周期名不一致的部分；标准名由校验恒等放行。 */
const REQUEST_PERIOD_ALIASES: Readonly<Record<string, KLinePeriod>> = {
  '1': KLinePeriod.Min1,
  '5': KLinePeriod.Min5,
  '15': KLinePeriod.Min15,
  '30': KLinePeriod.Min30,
  '60': KLinePeriod.Min60,
  '240': KLinePeriod.Hour4,
  D: KLinePeriod.Daily,
  W: KLinePeriod.Weekly,
  M: KLinePeriod.Monthly,
  '3M': KLinePeriod.Quarterly,
  '12M': KLinePeriod.Yearly,
}

/** security 只接受同周期或更高周期；低周期走 lower_tf。 */
export function assertSecurityPeriod(target: KLinePeriod, primary: KLinePeriod): void {
  if (KLINE_PERIODS.indexOf(target) < KLINE_PERIODS.indexOf(primary)) {
    throw new TypeError('request.security 暂不支持低于主图的周期')
  }
}

/** 先解析别名，再恒等放行标准周期名，其余一律拒绝。 */
export function requestPeriod(value: string): KLinePeriod {
  const alias = REQUEST_PERIOD_ALIASES[value]
  if (alias !== undefined) return alias
  if (isKLinePeriod(value)) return value
  throw new TypeError(`不支持的 Request 周期：${value}`)
}
