/** 显式开启的真实 Connector 验收：标准 Provider → 指标实例执行 → 投影 → K 线成交量核对。 */
import { expect, it } from 'vitest'
import type { FootprintRenderState, FootprintSeries } from '../../../components/footprint/types.js'
import {
  getRegisteredIndicatorDefinition,
  getRegisteredIndicatorDefinitions,
} from '../../../engine/indicators/indicatorDefinitionRegistry.js'
import { readIndicatorSeriesEntry } from '../../../engine/indicators/indicatorMetadata.js'
import { createIndicatorInstancePipeline } from '../../../engine/indicators/instances/assembly/indicatorInstancePipeline.js'
import { createInstanceCalculationDefinitions } from '../../../engine/indicators/instances/assembly/instanceDefinitionCatalog.js'
import { expandIndicatorCalculationOutputs } from '../../../engine/indicators/instances/domain/instanceCalculationPlan.js'
import { IndicatorInstanceExecutionRuntime } from '../../../engine/indicators/instances/execution/instanceExecutionRuntime.js'
import { composeInstanceRenderState } from '../../../engine/indicators/stateComposer.js'
import { marketDataProviderRegistry } from '../../provider/impl/registry.js'
import { binanceMarketDataProvider } from '../../provider/impl/sources/binance.js'
import { TRADE_STATUS } from '../types.js'

// 默认不访问外网；设置 BINANCE_CONNECTOR_TEST_URL 指向已启动的真实 Go 服务。
it.skipIf(!process.env.BINANCE_CONNECTOR_TEST_URL)(
  'matches a closed Binance candle using aggregated trades through the standard pipeline',
  async () => {
    marketDataProviderRegistry.setConfig('binance', {
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
    const pipeline = createIndicatorInstancePipeline({ createId: () => 'footprint-test' })
    pipeline.instances.create({
      definitionId: 'footprint',
      paneId: 'main',
      calculation: {
        definitionId: 'footprint',
        params: { ticksPerRow: 100, imbalanceRatio: 3 },
        context: {},
      },
      presentation: {},
    })
    const runtime = new IndicatorInstanceExecutionRuntime(
      createInstanceCalculationDefinitions(getRegisteredIndicatorDefinitions()),
    )
    runtime.setData([...result.data], 1, {
      mode: 'replace',
      snapshot: {
        revision: 1,
        tickSize: String(instrument.tickSize),
        status: TRADE_STATUS.ready,
        batches: [batch],
        message: null,
      },
    })
    const plan = pipeline.calculationPlan()
    const outputs = runtime.execute(plan)
    const series = readIndicatorSeriesEntry<FootprintSeries>(outputs[0]?.series, 'footprint')
    expect(series.bars[0]?.complete).toBe(true)
    expect(Number(series.bars[0]?.totalVolume)).toBeCloseTo(first.volume ?? 0, 6)
    const definition = getRegisteredIndicatorDefinition('footprint')
    const instanceResult = expandIndicatorCalculationOutputs(plan, outputs, 1).get('footprint-test')
    if (!definition || !instanceResult) throw new Error('Footprint registered result missing')
    const state = readIndicatorSeriesEntry<FootprintRenderState>(
      composeInstanceRenderState(definition, instanceResult, {}, { start: 0, end: 2 }, 1),
      'footprint',
    )
    expect(state.series.bars[0]?.timestamp).toBe(first.timestamp)
  },
  75_000,
)
