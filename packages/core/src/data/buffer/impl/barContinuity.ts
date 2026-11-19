/**
 * K 线序列的区间连续性工具。
 *
 * 落盘页按时间戳去重合并后可能留下缺口。缺口在数组里表现为相邻的两根 bar，
 * 图表按索引绘制就会画成断崖，Agent 读到的相邻关系也随之错位。装配前必须裁到
 * 末尾连续段：宁可从网络重取，也不把断开的数据交给上层。
 */
import { KLinePeriod } from '@/data/provider/types.js'
import type { KLineData } from '@/foundation/types/price.js'

/** 日内周期的固定步长（毫秒）。日线及以上的边界随交易日历变化，不在这里登记。 */
const PERIOD_STEP_MS: Readonly<Record<string, number>> = {
  [KLinePeriod.Min1]: 60_000,
  [KLinePeriod.Min5]: 300_000,
  [KLinePeriod.Min15]: 900_000,
  [KLinePeriod.Min30]: 1_800_000,
  [KLinePeriod.Min60]: 3_600_000,
  [KLinePeriod.Hour4]: 14_400_000,
}

/**
 * 返回周期的固定步长。
 *
 * @param period - 图表标准周期
 * @returns 日内周期的毫秒步长；日线及以上返回 null，表示不做连续性校验
 */
export function periodStepMs(period: KLinePeriod): number | null {
  return PERIOD_STEP_MS[period] ?? null
}

/**
 * 从序列末尾回溯，返回时间戳严格连续的一段。
 *
 * @param bars - 已按时间升序且时间戳唯一的 K 线序列
 * @param stepMs - 期望步长；null 表示该周期不做校验，原样返回
 * @returns 末尾连续段；整段不连续时只剩最后一根
 */
export function continuousTail(
  bars: readonly KLineData[],
  stepMs: number | null,
): readonly KLineData[] {
  if (stepMs === null || bars.length < 2) return bars
  let start = bars.length - 1
  while (start > 0 && bars[start].timestamp - bars[start - 1].timestamp === stepMs) start--
  return start === 0 ? bars : bars.slice(start)
}
