/**
 * 交易日划分：只按市场会话声明的「交易日起点」把时间戳归入交易日。
 *
 * 不读取任何交易日历：周末、节假日造成的行情缺口不会产生额外语义，
 * 相邻两根 K 线分属不同交易日即视为一次交易日切换。夜盘归入下一交易日的
 * 唯一依据是 `tradingDayStartMinute`，跨零点本身不构成切换。
 *
 * 时区偏移与时间轴刻度共用同一取舍：按参考时间戳解析一次偏移，窗口内的
 * 差异最多只有 DST 切换的那一小时，且切换点（凌晨 2 点）不落在任何内置市场的
 * 交易日起点上。
 */

import type { ScriptMarketSession } from '@363045841yyt/klinechart-plot-contracts'
import { DAY_MS, zoneOffsetMs } from './dtf.js'

/** 交易日划分所需的会话字段；时间戳以外的配置不参与计算。 */
export type TradingDaySession = Pick<ScriptMarketSession, 'timeZone' | 'tradingDayStartMinute'>

/**
 * 创建交易日索引函数。
 *
 * 返回值把时间戳映射为连续整数：同一天的 K 线得到相同值，交易日切换处递增，
 * 因此调用方只需比较相邻两根 K 线的索引即可判断分隔位置。
 *
 * @param session 市场会话；只消费时区与交易日起点
 * @param referenceTimestamp 窗口内任一真实时间戳，用于解析时区偏移
 * @returns 时间戳 → 交易日索引；无效时间戳返回 NaN
 */
export function createTradingDayIndexer(
  session: TradingDaySession,
  referenceTimestamp: number,
): (timestamp: number) => number {
  const startMs = (session.tradingDayStartMinute ?? 0) * 60_000
  const offsetMs = zoneOffsetMs(referenceTimestamp, session.timeZone)
  return (timestamp) => Math.floor((timestamp + offsetMs - startMs) / DAY_MS)
}
