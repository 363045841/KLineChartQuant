/** 端到端：脚本 alert → Worker → CalculationHub → AlertService → 通知。 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createCalculationHub,
  createDataIdentity,
  createFeedKey,
} from '../../../../core/src/engine/calculation/index.js'
import {
  type AlertFiresDocument,
  type AlertRulesDocument,
  createAlertService,
  getRegisteredIndicatorDefinition,
} from '@363045841yyt/klinechart-core'
import { createMemoryDocumentStore } from '@363045841yyt/klinechart-core/persistence'
import { NodeScriptWorker } from '../../../../script/src/worker/__tests__/nodeWorker.js'
import { createScriptService } from '../impl/createScriptService.js'
import { makeSymbolSpec } from '../../../../core/src/engine/data/__tests__/helpers/symbolSpecFixture.js'

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
  period: '1',
  adjust: 'none',
})
const CHART_IDENTITY = createDataIdentity({
  source: 'test',
  instrument: 'BTC',
  period: '1',
  adjustment: 'none',
  defaultPeriod: '1d',
  defaultAdjustment: 'none',
})
const IDENTITY = { ...CHART_IDENTITY, scope: 'alerts' }

afterEach(() => vi.unstubAllGlobals())

describe('alert pipeline', () => {
  it('delivers an intrabar crossing even when a later price and a chart update are already queued', async () => {
    vi.stubGlobal('Worker', NodeScriptWorker)
    const service = await createScriptService([], {
      persistence: { load: async () => null, save: async () => true },
      builtinSources: [SOURCE],
    })
    const metadata = getRegisteredIndicatorDefinition('PipelineAlert')
    if (!metadata?.runtime) throw new Error('Missing PipelineAlert definition')
    const runtime = metadata.runtime
    const calculator = {
      definitionId: metadata.name,
      dependency: runtime.dependency ?? { kind: 'stateful' as const },
      compute: runtime.compute,
      ...(runtime.createCompute ? { createCompute: runtime.createCompute } : {}),
    }

    const hub = createCalculationHub({
      resolveDefinition: (id) => (id === 'PipelineAlert' ? calculator : undefined),
    })
    const alerts = await createAlertService({
      hub,
      rules: createMemoryDocumentStore<AlertRulesDocument>(null),
      fires: createMemoryDocumentStore<AlertFiresDocument>(null),
      feeds: { retain: () => {} },
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
      marketRevision: 0,
      timestamps: bars.map((bar) => bar.timestamp),
      data: bars,
      change: { start: 0, end: bars.length },
      live: true,
      ordered: true,
    })

    const updated = [bars[0]!, { ...bars[1]!, high: 11, close: 11 }]
    for (const identity of [CHART_IDENTITY, IDENTITY]) {
      hub.updateFeed({
        identity,
        dataRevision: 2,
        marketRevision: 0,
        timestamps: [1, 2],
        data: updated,
        change: { start: 1, end: 2 },
        live: true,
        ordered: true,
      })
    }
    hub.removeFeed(createFeedKey(CHART_IDENTITY))
    hub.updateFeed({
      identity: IDENTITY,
      dataRevision: 3,
      marketRevision: 0,
      timestamps: [1, 2],
      data: bars,
      change: { start: 1, end: 2 },
      live: true,
      ordered: true,
    })

    await vi.waitFor(() => expect(alerts.fires.peek()).toHaveLength(1))
    expect(alerts.fires.peek()[0]).toMatchObject({
      message: '价格上穿 10',
      price: 11,
      barTime: 2,
      source: { ticker: 'BTCUSDT', interval: '1' },
    })
    await alerts.dispose()
    hub.dispose()
    service.dispose()
  })
})

