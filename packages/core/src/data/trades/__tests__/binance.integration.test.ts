/** 真实 Connector 验收：标准 Provider → 足迹执行器，逐根 K 线成交额对齐。 */
import { expect, it } from 'vitest'
import { createFootprintExecution } from '../../../components/footprint/runtime/impl/footprintExecution.js'
import { FOOTPRINT_METRICS } from '../../../components/footprint/types.js'
import { MarketDataProviderRegistry } from '../../provider/registry.js'
import { installBuiltinProviders } from '../../provider/impl/sources/index.js'
import { unavailableEventStream } from '../../stream/__tests__/helpers/eventStreamKit.js'
import { DataSource } from '@363045841yyt/klinechart-plot-contracts'
import { TRADE_STATUS } from '../types.js'

const registry = new MarketDataProviderRegistry()
installBuiltinProviders(registry, {
  // 本用例只走范围查询，不建立实时连接。
  fetchImpl: (input, init) => globalThis.fetch(input, init),
  openEventStream: unavailableEventStream,
})
const binanceMarketDataProvider = registry.getRequired(DataSource.binance)

it.skipIf(!process.env.BINANCE_CONNECTOR_TEST_URL)(
  'matches a closed Binance candle using aggregated trades through the standard pipeline',
  async () => {
    registry.setConfig('binance', {
      baseUrl: process.env.BINANCE_CONNECTOR_TEST_URL,
    })
    const provider = binanceMarketDataProvider
    if (!provider.catalog || !provider.bars || !provider.trades)
      throw new Error('Binance Provider capabilities missing')
    const signal = AbortSignal.timeout(60_000)
    const instruments = await provider.catalog.search({ keyword: 'BTCUSDT', limit: 10, signal })
    const instrument = instruments.find((item) => item.symbol === 'BTCUSDT')
    if (!instrument) throw new Error('BTCUSDT absent from actual Binance directory')
    const result = await provider.bars.fetch({
      instrument,
      period: '1min',
      adjustment: 'none',
      barAggregation: 'original',
      limit: 2,
      signal,
    })
    const first = result.data[0]
    const next = result.data[1]
    if (!first || !next) throw new Error('Missing actual candle boundary')
    const batch = await provider.trades.fetch({
      instrument,
      range: { from: first.timestamp, to: next.timestamp },
      signal,
    })
    expect(batch.items.length).toBeGreaterThan(0)
    const output = createFootprintExecution()({
      requestId: 1,
      marketKey: `${instrument.source}:${instrument.id}:1min`,
      data: result.data,
      params: { ticksPerRow: 100, imbalanceRatio: 3, metric: FOOTPRINT_METRICS.Turnover },
      trades: {
        mode: 'replace',
        snapshot: {
          revision: 1,
          tickSize: String(instrument.tickSize),
          status: TRADE_STATUS.ready,
          batches: [batch],
          coverage: [batch.range],
          latestTimestamp: batch.range.to,
          message: null,
        },
      },
    })
    if (!('series' in output)) throw new Error(output.error)
    const series = output.series
    expect(series.bars[0]?.complete).toBe(true)
    // 聚合成交按成交额累计，应与同一根 K 线的成交额一致。
    const turnover = first.turnover ?? 0
    const total = Number(series.bars[0]?.total)
    expect(turnover).toBeGreaterThan(0)
    expect(Math.abs(total - turnover) / turnover).toBeLessThan(1e-6)
    expect(series.bars[0]?.timestamp).toBe(first.timestamp)
  },
  75_000,
)
