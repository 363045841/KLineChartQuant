/** 内置 MOCK 与用户数据源实现同一注册接口；不再自建 Provider 或实时流适配层。 */
import type { KLineData } from '@/controllers/types.js'
import { GENERIC_ERROR_CODES, KLineChartError } from '@/errors.js'
import { defaultMarketDataContext } from '../../../management/impl/context.js'
import type { DataSourceInstrument, MarketDataSource } from '../../types.js'
import { dataSourceRegistry } from '../sourceRegistry.js'
import { generateMockBars, mockDayStart } from './mockData.js'

const MOCK_INSTRUMENTS = [
  { symbol: 'MOCK-100', count: 100, name: 'Mock ~100 daily bars' },
  { symbol: 'MOCK-10000', count: 10_000, name: 'Mock 10,000 daily bars' },
] as const

/** 创建独立的 mock 行情实例；每个宿主拥有自己的历史与订阅状态。 */
export function createMockDataSource(): MarketDataSource {
  const metadata = dataSourceRegistry.mock
  const instruments: DataSourceInstrument[] = MOCK_INSTRUMENTS.map((item) => ({
    id: `${metadata.id}:${item.symbol}`, symbol: item.symbol, name: item.name,
    assetClass: 'index', exchange: 'MOCK', sessionId: 'CN', timezone: 'Asia/Shanghai', volumeUnit: 'share',
    capabilities: { bars: { periods: ['daily'], adjustments: ['none'] }, liveBars: true },
  }))
  const histories = new Map<string, KLineData[]>()

  /** 精确解析品种身份，未知 ID 不回退到默认 mock。 */
  function resolve(id: string): DataSourceInstrument {
    const instrument = instruments.find((item) => item.id === id)
    if (!instrument) throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_PARAM, `Unknown mock instrument: ${id}`)
    return instrument
  }

  /** 同一实例仅生成一次历史；所有分页和订阅使用同一序列。 */
  function history(id: string): KLineData[] {
    const instrument = resolve(id)
    let data = histories.get(id)
    if (!data) {
      const specification = MOCK_INSTRUMENTS.find((item) => item.symbol === instrument.symbol)!
      data = generateMockBars(specification.count, mockDayStart(Date.now()))
      histories.set(id, data)
    }
    return data
  }

  return {
    id: metadata.id, name: metadata.displayName,
    capabilities: { assetClasses: ['index'], bars: { periods: ['daily'], adjustments: ['none'] }, liveBars: true },
    instruments: {
      async search(query) {
        query.signal?.throwIfAborted()
        if (query.assetClasses && !query.assetClasses.includes('index')) return []
        const keyword = query.keyword.trim().toLowerCase()
        return instruments.filter((item) => item.symbol.toLowerCase().includes(keyword) || item.name.toLowerCase().includes(keyword)).slice(0, query.limit)
      },
      async resolve(id, signal) { signal.throwIfAborted(); return resolve(id) },
    },
    bars: {
      async fetch(request) {
        request.signal.throwIfAborted()
        const data = history(request.instrument.id)
        const before = request.beforeTimestamp
        const available = before === undefined ? data : data.filter((bar) => bar.timestamp < before)
        return {
          bars: available.slice(-request.limit).map((bar) => ({ ...bar })),
          olderData: available.length > request.limit ? 'available' : 'exhausted',
        }
      },
      subscribe(request, observer) {
        request.signal.throwIfAborted()
        const data = history(request.instrument.id)
        let phase = 0
        let stopped = false
        const initialClose = data.at(-1)!.close
        /** 每次只提交一根完整快照；跨日自然追加，不重发历史。 */
        const update = () => {
          const previous = data.at(-1)!
          const timestamp = mockDayStart(Date.now())
          const open = timestamp === previous.timestamp ? previous.open : previous.close
          const close = Math.round((initialClose + Math.sin(phase) * 0.08) * 100) / 100
          phase += Math.PI / 12
          const bar = {
            timestamp, open, close,
            high: Math.max(timestamp === previous.timestamp ? previous.high : open, close + 0.02),
            low: Math.min(timestamp === previous.timestamp ? previous.low : open, close - 0.02),
            volume: timestamp === previous.timestamp ? previous.volume : 0,
            turnover: timestamp === previous.timestamp ? previous.turnover : 0,
          }
          if (timestamp === previous.timestamp) data[data.length - 1] = bar
          else data.push(bar)
          observer.update(bar)
        }
        const timer = setInterval(update, 1_000)
        /** Abort 和显式退订共用同一释放动作，重复调用不会重复发布状态。 */
        const stop = () => {
          if (stopped) return
          stopped = true
          clearInterval(timer)
          request.signal.removeEventListener('abort', stop)
          observer.status('disconnected')
        }
        request.signal.addEventListener('abort', stop, { once: true })
        observer.status('connected')
        return stop
      },
    },
  }
}

defaultMarketDataContext.registerDataSource(createMockDataSource())
