// 本文件把业务 SymbolSpec 映射为可登记的 SymbolInfo 目录条目。
import type { SymbolInfo } from '../../controllers/types.js'
import type { SymbolSpec } from '@/foundation/types/instrument.js'

/**
 * 将业务品种转换为目录条目。
 *
 * @param spec 业务品种
 * @returns 与 instrument 完全一致的目录条目
 */
export function symbolInfoFromSpec(spec: SymbolSpec): SymbolInfo {
  const { instrument } = spec
  return {
    id: instrument.id,
    instrumentType: instrument.instrumentType,
    sessionId: instrument.sessionId,
    capabilities: instrument.capabilities,
    tickSize: instrument.tickSize,
    lotSize: instrument.lotSize,
    currency: instrument.currency,
    symbol: instrument.symbol,
    market: instrument.sessionId ?? instrument.exchange,
    description: instrument.name,
    exchange: instrument.exchange,
    source: instrument.source,
    params: instrument.providerRef,
  }
}
