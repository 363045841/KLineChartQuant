/** 序列视口键：同一品种、周期只记一份视图。 */
import { DEFAULT_KLINE_PERIOD } from '@/data/provider/types.js'
import type { SymbolSpec } from '@/data/symbolSpec.js'

/**
 * 生成稳定的序列视图键。
 *
 * instrument.id 已按来源唯一，键只保留 id 与周期；复权共用同一份视图。
 *
 * @param spec - 业务品种
 * @returns 视图键，例如 `binance:spot:BTCUSDT:daily`
 */
export function seriesViewportKey(spec: SymbolSpec): string {
  return [spec.instrument.id, spec.period ?? DEFAULT_KLINE_PERIOD].join(':')
}
