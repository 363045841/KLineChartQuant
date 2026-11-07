/** 图表业务态的品种身份键：统一走品种标识模块，缺失 ID 时回退到完整路由字段。 */

import type { DataSourceParams, SymbolSpec } from '../../controllers/types.js'
import { instrumentIdentityKey } from '../../data/provider/impl/instrumentIdentity.js'

type SymbolIdentity = Pick<SymbolSpec, 'id' | 'source' | 'market' | 'exchange' | 'symbol'> & {
  params?: DataSourceParams
}

/**
 * 生成图表业务态的品种身份键。
 *
 * 有统一品种 ID 时直接用 ID：`id` 已带 `sourceId` 前缀，再拼一次会得到
 * `binance:binance:spot:BTCUSDT`。只有旧调用（无 ID）才回退到来源与路由字段。
 * @param spec 品种描述
 * @returns 稳定身份键
 */
export function symbolSpecIdentityKey(spec: SymbolIdentity): string {
  if (spec.id?.trim()) {
    return instrumentIdentityKey({
      id: spec.id,
      sourceId: spec.source?.trim() ?? spec.id.trim().split(':')[0] ?? '',
    })
  }
  const params = Object.entries(spec.params ?? {}).sort(([left], [right]) =>
    left.localeCompare(right),
  )
  return JSON.stringify([spec.source ?? '', spec.market, spec.exchange ?? '', spec.symbol, params])
}
