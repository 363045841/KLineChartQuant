/** 警报品种与计算数据身份之间的唯一换算；周期与复权缺省只在这里归一。 */
import type { SymbolSpec } from '@/foundation/types/instrument.js'
import { DEFAULT_KLINE_ADJUSTMENT, DEFAULT_KLINE_PERIOD } from '../../../data/provider/types.js'
import { createDataIdentity, type DataIdentity } from '../../../engine/calculation/index.js'

/** 由品种规格得到行情数据身份；与图表实例无关。 */
export function alertFeedIdentity(symbol: SymbolSpec): DataIdentity {
  return createDataIdentity({
    scope: 'alerts',
    source: symbol.instrument.source,
    instrument: symbol.instrument.id,
    period: symbol.period,
    adjustment: symbol.adjust,
    defaultPeriod: DEFAULT_KLINE_PERIOD,
    defaultAdjustment: DEFAULT_KLINE_ADJUSTMENT,
  })
}
