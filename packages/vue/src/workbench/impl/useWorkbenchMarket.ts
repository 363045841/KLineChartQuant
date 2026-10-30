/** 工作台只解析用户选择，不取历史、不写 Buffer；查询和订阅仍由 Core 运行时负责。 */
import type { SymbolSpec } from '@363045841yyt/klinechart-core/controllers'
import { onScopeDispose, shallowRef, watch } from 'vue'
import { useMarketDataContext } from '../../composables/market/useMarketDataContext.js'
import type { KlineWorkbenchProps } from '../types.js'

/** 初次挂载与受控品种切换共用同一解析操作，并取消过期解析。 */
export function useWorkbenchMarket(props: KlineWorkbenchProps) {
  const context = props.marketDataContext ?? useMarketDataContext()
  const symbols = shallowRef<ReadonlyArray<SymbolSpec>>()
  let active: AbortController | undefined
  onScopeDispose(() => active?.abort())

  /** 只提交当前解析结果，已取消的旧请求不影响新选择。 */
  async function resolve(): Promise<void> {
    active?.abort()
    const selection = props.instrument
    if (!selection) { symbols.value = undefined; return }
    const period = props.period ?? 'daily'
    const abort = new AbortController()
    active = abort
    symbols.value = []
    try {
      const instrument = await context.resolveInstrument(selection.sourceId, selection.id, abort.signal)
      if (abort.signal.aborted) return
      symbols.value = [{ id: instrument.id, instrument, symbol: instrument.symbol,
        market: instrument.sessionId ?? instrument.exchange, exchange: instrument.exchange,
        source: instrument.sourceId, period, adjust: 'none' }]
    } catch (error) {
      if (!abort.signal.aborted) throw error
    }
  }

  watch(() => [props.instrument?.sourceId, props.instrument?.id, props.period], resolve)
  return { context, symbols, initialize: resolve }
}
