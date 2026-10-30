/** React 内部适配器预览与正式工作台使用相同的注册数据源，不保留数组注入示例。 */
import type { ChartController, SymbolSpec } from '@363045841yyt/klinechart-core'
import { createMarketDataHost } from '@363045841yyt/klinechart-core/market-data'
import React, { useEffect, useMemo, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { createE2eDataSource } from '../../desktop-electron/src/features/agent/chart-e2e-fixture'
import { KLineChart } from '../src/direct'

/** 每次挂载拥有独立宿主，StrictMode 清理后不能复用已注销的来源。 */
function App() {
  const host = useMemo(() => createMarketDataHost(), [])
  const [symbols, setSymbols] = useState<readonly SymbolSpec[]>([])
  useEffect(() => {
    const abort = new AbortController()
    const fixture = createE2eDataSource()
    const unregister = host.registerDataSource(fixture.source)
    void host.resolveInstrument(fixture.instrument.sourceId, fixture.instrument.id, abort.signal).then((instrument) => {
      if (!abort.signal.aborted) setSymbols([{ instrument, symbol: instrument.symbol, market: 'CN', source: instrument.sourceId, period: 'daily' }])
    }).catch((error: unknown) => { if (!abort.signal.aborted) throw error })
    return () => { abort.abort(); unregister() }
  }, [host])
  return <KLineChart marketDataContext={host} symbols={symbols}
    onReady={(controller: ChartController) => console.log('[kcq] ready', controller.viewport.peek())} />
}

ReactDOM.createRoot(document.getElementById('app')!).render(<React.StrictMode><App /></React.StrictMode>)
