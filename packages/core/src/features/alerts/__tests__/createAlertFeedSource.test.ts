import { expect, it, vi } from 'vitest'
import { createMarketDataHost } from '../../../data/management/impl/context.js'
import { createMockDataSource } from '../../../data/provider/impl/sources/mock.js'
import { OLDER_DATA_STATUS } from '../../../data/provider/types.js'
import type { StreamFrame, StreamHub } from '../../../data/stream/types.js'
import { createCalculationHub, createFeedKey } from '../../../engine/calculation/index.js'
import { alertFeedIdentity } from '../impl/alertSymbol.js'
import { createAlertFeedSource } from '../impl/createAlertFeedSource.js'

const bar = (timestamp: number, close: number) => ({ timestamp, close, open: close, low: close, high: close, volume: 1 })

it('keeps the streamed tail during history loading and publishes explicit closes in order', async () => {
  const host = createMarketDataHost()
  const mock = createMockDataSource()
  type History = { bars: ReturnType<typeof bar>[]; olderData: typeof OLDER_DATA_STATUS.EXHAUSTED }
  let resolveHistory: (value: History) => void = () => {}
  const history = new Promise<History>((resolve) => { resolveHistory = resolve })
  host.registerDataSource({ ...mock, bars: { fetch: () => history } })
  const instrument = await host.resolveInstrument('mock', 'mock:MOCK')
  if (!instrument) throw new Error('Missing mock instrument')
  const symbol = { instrument }
  let listener: ((frame: StreamFrame) => void) | undefined
  const stream: StreamHub = {
    subscribe: (request) => ({
      request,
      onFrame: (callback) => { listener = callback; return () => { listener = undefined } },
      onEvent: () => () => {},
      close: () => {},
    }),
    resume: () => {},
    dispose: () => {},
  }
  const seen = vi.fn()
  const context = vi.fn((_owner, _bars, session) => ({ symbol: session?.instrument.symbol ?? 'Chart', loadBars: async () => [] }))
  const hub = createCalculationHub({
    marketData: () => ({ context, revision: 0, retain: () => {} }),
    resolveDefinition: (definitionId) => ({
      definitionId, dependency: { kind: 'stateful' },
      compute: (data, _inputs, market) => ({ series: { bars: data.map(({ close }) => close), symbol: market?.symbol } }),
    }),
  })
  const feeds = createAlertFeedSource({ hub, registry: host.registry, stream, onError: vi.fn() })
  const key = createFeedKey(alertFeedIdentity(symbol))
  const client = hub.createClient('test', { onResult: (_feed, result) => seen(result.series, result.closedBarTime) })
  client.setPlan([{ feed: key, requests: [{ key: 'script', definitionId: 'script', inputs: {}, context: {} }] }])
  try {
    feeds.retain([symbol])
    listener?.({ type: 'bar', instrumentId: instrument.id, seq: 1, ts: 2, state: 'forming', bar: bar(2, 99) })
    listener?.({ type: 'bar', instrumentId: instrument.id, seq: 2, ts: 2, state: 'closed', bar: bar(2, 101) })
    resolveHistory({ bars: [bar(1, 90), bar(2, 98)], olderData: OLDER_DATA_STATUS.EXHAUSTED })
    await vi.waitFor(() => expect(seen.mock.calls).toEqual([
      [{ bars: [99], symbol: 'MOCK' }, undefined],
      [{ bars: [101], symbol: 'MOCK' }, 2],
      [{ bars: [90, 101], symbol: 'MOCK' }, undefined],
    ]))
  } finally {
    client.dispose()
    feeds.dispose()
    hub.dispose()
    host.dispose()
  }
})
