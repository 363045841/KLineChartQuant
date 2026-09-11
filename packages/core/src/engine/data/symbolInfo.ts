// 本文件把业务 SymbolSpec 映射为可登记的 SymbolInfo 目录条目。
import type { SymbolInfo, SymbolSpec } from '../../controllers/types'

/** 将 SymbolSpec 转为 SymbolInfo；存在 instrument 时优先取其品种信息。 */
export function symbolInfoFromSpec(spec: SymbolSpec): SymbolInfo {
  const instrument = spec.instrument
  return {
    id: spec.id,
    assetClass: instrument?.assetClass,
    sessionId: instrument?.sessionId ?? spec.market,
    capabilities: instrument?.capabilities,
    symbol: instrument?.symbol ?? spec.symbol,
    market: spec.market,
    description: instrument?.name ?? spec.symbol,
    exchange: instrument?.exchange ?? spec.exchange,
    source: spec.source,
    params: spec.params,
  }
}
