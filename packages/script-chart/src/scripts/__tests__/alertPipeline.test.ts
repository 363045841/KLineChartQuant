import { systemClock } from '@363045841yyt/klinechart-core'
/** 端到端：脚本 alert → Worker → CalculationHub → AlertService → 通知。 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createDefinitionRegistry,
  createMarketRuntime,
  resolveBarsSelection,
} from '@363045841yyt/klinechart-core'
import { createBuiltinMarketDataContext } from '@363045841yyt/klinechart-core/market-data/sources'
import {
  type AlertDocument,
  createAlertService,
  DEFAULT_ALERT_LIMITS,
} from '@363045841yyt/klinechart-core'
import { createMemoryDocumentStore } from '@363045841yyt/klinechart-core/persistence'
import { createScriptService } from '../impl/createScriptService.js'
import { makeSymbolSpec } from '../../../../core/src/engine/data/__tests__/helpers/symbolSpecFixture.js'
import { testScriptPool } from './helpers/scriptTestPool.js'

const SOURCE = `
defineAlert({
  version: 2,
  name: 'PipelineAlert',
  frequency: 'per-bar',
  onBar() {
    const price = input.float(10, { title: '价格', min: 0, step: 0.01 })
    const previous = barstate.prevPrice
    const current = close[0]
    if (previous !== undefined && previous < price && current >= price) {
      alert('价格上穿 ' + price)
    }
  },
})
`

const SYMBOL = makeSymbolSpec({
  id: 'BTC',
  symbol: 'BTCUSDT',
  source: 'test',
  period: '1min',
  adjust: 'none',
})
const IDENTITY = resolveBarsSelection(SYMBOL, 'original')

afterEach(() => vi.unstubAllGlobals())

describe('alert pipeline', () => {
  it('delivers an intrabar crossing with no chart instance, only a calculation session', async () => {
    vi.stubGlobal('Worker', undefined)
    const definitions = createDefinitionRegistry()
    const market = createBuiltinMarketDataContext({
      // 警报链路用例只驱动价格帧，不建立真实连接。
      fetchImpl: (input, init) => globalThis.fetch(input, init),
      openEventStream: () => {
        throw new Error('Alert pipeline test does not open event streams')
      },
    })
    const runtime = createMarketRuntime({ clock: systemClock, market, definitions })
    const service = await createScriptService([], {
      definitions,
      persistence: { load: async () => null, save: async () => true },
      builtinSources: [SOURCE],
      createWorkerPool: testScriptPool,
    })
    // 运行时是唯一所有者：警报与图表都只是它的消费者。
    const hub = runtime.calculation
    const alerts = await createAlertService({
      hub,
      definitions,
      document: createMemoryDocumentStore<AlertDocument>(null),
      acquireBars: () => () => {},
      clock: systemClock,
      limits: DEFAULT_ALERT_LIMITS,
      onError: (error) => {
        throw error
      },
    })
    alerts.create({
      name: 'cross 10',
      script: { definitionId: 'PipelineAlert', inputs: { price: 10 } },
      symbol: SYMBOL,
      message: '{{message}}',
      channels: ['in-app'],
    })

    const bars = [
      { timestamp: 1, open: 9, high: 9, low: 9, close: 9, volume: 1 },
      { timestamp: 2, open: 9, high: 9, low: 9, close: 9, volume: 1 },
    ]
    hub.updateFeed({
      identity: IDENTITY,
      dataRevision: 1,
      timestamps: bars.map((bar) => bar.timestamp),
      data: bars,
      change: { kind: 'reset', start: 0, revision: 1 },
      live: true,
    })

    const updated = [bars[0]!, { ...bars[1]!, high: 11, close: 11 }]
    hub.updateFeed({
      identity: IDENTITY,
      dataRevision: 2,
      timestamps: [1, 2],
      data: updated,
      change: { kind: 'update', start: 1, revision: 2 },
      live: true,
    })

    await vi.waitFor(() => expect(alerts.fires.peek()).toHaveLength(1))
    expect(alerts.fires.peek()[0]).toMatchObject({
      message: '价格上穿 10',
      price: 11,
      barTime: 2,
      source: { ticker: 'BTCUSDT', interval: '1min' },
    })
    await alerts.dispose()
    runtime.dispose()
    market.dispose()
    service.dispose()
  })
})

