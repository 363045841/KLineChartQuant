/**
 * MarketDataProvider 测试共享夹具：按需覆盖 capabilities / probe / catalog / bars。
 * 仅供 __tests__ 消费；vitest 只收集 *.test.ts，本文件不会被当作测试。
 *
 * 约束：项目自有类型 MarketDataProvider 用 satisfies 全量约束，缺成员在编译期暴露。
 */

import type { KLineData } from '@/foundation/types/bar.js'
import type { StreamTransportHandlers } from '../../../stream/types.js'
import type {
  BarDataSource,
  DataSourceInstrument,
  HistoryRequest,
  InstrumentCatalog,
  MarketDataProvider,
  MarketDataSource,
  SourceCapabilities,
} from '../../types'

/** 公开数据源测试共用夹具，调用者提供行情事实，不复制注册或连接替身。 */
export function createDataSourceFixture(bars: readonly KLineData[], realtime = true) {
  const streams = new Set<StreamTransportHandlers>()
  const requests: HistoryRequest[] = []
  const instruments: DataSourceInstrument[] = ['A', 'B'].map((symbol) => ({
    id: symbol,
    symbol,
    name: symbol,
    exchange: 'TEST',
    instrumentType: 'stock',
    sessionId: 'CN',
    timezone: 'Asia/Shanghai',
    capabilities: {
      bars: { periods: ['daily', '1min'], adjustments: ['none'] },
      liveBars: realtime,
    },
  }))
  const source: MarketDataSource = {
    id: 'test',
    name: 'Test data source',
    capabilities: {
      instrumentTypes: ['stock'],
      bars: { periods: ['daily', '1min'], adjustments: ['none'] },
      liveBars: realtime,
    },
    instruments: {
      async search(query) {
        return instruments
          .filter((item) => item.symbol.includes(query.keyword))
          .slice(0, query.limit)
      },
      async resolve(id, signal) {
        signal.throwIfAborted()
        const instrument = instruments.find((item) => item.id === id)
        if (!instrument) throw new Error(`Unknown instrument: ${id}`)
        return instrument
      },
    },
    bars: {
      async fetch(request) {
        requests.push(request)
        const available = bars.filter(
          (bar) => request.beforeTimestamp === undefined || bar.timestamp < request.beforeTimestamp,
        )
        return {
          bars: available.slice(-request.limit),
          olderData: available.length > request.limit ? 'available' : 'exhausted',
        }
      },
    },
    ...(realtime
      ? {
          stream(_request: import('../../../stream/types.js').StreamRequest, handlers: StreamTransportHandlers) {
            return {
              open() {
                streams.add(handlers)
                handlers.onOpen()
              },
              close() {
                streams.delete(handlers)
              },
            }
          },
        }
      : {}),
  }
  return { source, instruments, streams, requests }
}

/** 测试默认源级能力：stock / daily / none。 */
const DEFAULT_SOURCE_CAPABILITIES: SourceCapabilities = {
  instrumentTypes: ['stock'],
  bars: { periods: ['daily'], adjustments: ['none'] },
}

/** MarketDataProvider 替身入参。 */
export interface MockMarketDataProviderOptions {
  source: string
  displayName?: string
  /** 源级能力，默认 DEFAULT_SOURCE_CAPABILITIES。 */
  capabilities?: SourceCapabilities
  probe?: MarketDataProvider['probe']
  search?: InstrumentCatalog['search']
  fetchBars?: BarDataSource['fetch']
}

/** 构造 MarketDataProvider 替身，只装配调用方声明的能力模块。 */
export function createMockMarketDataProvider(
  options: MockMarketDataProviderOptions,
): MarketDataProvider {
  const {
    source,
    displayName = source,
    capabilities = DEFAULT_SOURCE_CAPABILITIES,
    probe,
    search,
    fetchBars,
  } = options
  return {
    source: { id: source, displayName, capabilities },
    probe: probe ?? (async () => ({ status: 'online', checkedAt: 1, capabilities })),
    ...(search ? { catalog: { search } } : {}),
    ...(fetchBars ? { bars: { fetch: fetchBars } } : {}),
  } satisfies MarketDataProvider
}
