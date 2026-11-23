/**
 * 内置 MOCK 数据源：实现与宿主数据源相同的公开注册接口，历史按 UTC 日索引即时生成，
 * 因而不存在「生成一次就耗尽」的边界；实时订阅只覆盖当日那一根。
 */
import type { KLineData } from '@/controllers/types.js'
import { GENERIC_ERROR_CODES, KLineChartError } from '@/errors.js'
import {
  type DataSourceInstrument,
  InstrumentType,
  KLineAdjustment,
  KLinePeriod,
  type MarketDataSource,
  OLDER_DATA_STATUS,
} from '../../types.js'
import { dataSourceRegistry } from '../sourceRegistry.js'
import { generateMockBars, MOCK_DAY_MS, mockDayIndex, mockSeedFor } from './mockData.js'

/** 唯一内置 mock 品种；无限历史，用于本地渲染与分页回归。 */
const MOCK_SYMBOL = 'MOCK'

/** 创建独立的 mock 行情实例；每个宿主拥有自己的实时覆盖层。 */
export function createMockDataSource(): MarketDataSource {
  const metadata = dataSourceRegistry.mock
  const instrument: DataSourceInstrument = {
    id: `${metadata.id}:${MOCK_SYMBOL}`,
    symbol: MOCK_SYMBOL,
    name: 'Mock infinite daily bars',
    instrumentType: InstrumentType.Index,
    exchange: 'MOCK',
    sessionId: 'CN',
    timezone: 'Asia/Shanghai',
    volumeUnit: 'share',
    capabilities: {
      bars: { periods: [KLinePeriod.Daily], adjustments: [KLineAdjustment.None] },
      liveBars: true,
    },
  }
  /** 当日收盘的实时覆盖层；历史仍是生成器的纯函数，只有被推送过的日子会被改写。 */
  const liveBars = new Map<number, KLineData>()

  /** 精确解析品种身份，未知 ID 不回退到默认 mock。 */
  function resolve(id: string): DataSourceInstrument {
    if (id !== instrument.id)
      throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_PARAM, `Unknown mock instrument: ${id}`)
    return instrument
  }

  return {
    id: metadata.id,
    name: metadata.displayName,
    capabilities: {
      instrumentTypes: [InstrumentType.Index],
      bars: { periods: [KLinePeriod.Daily], adjustments: [KLineAdjustment.None] },
      liveBars: true,
    },
    instruments: {
      async search(query) {
        query.signal?.throwIfAborted()
        if (query.instrumentTypes && !query.instrumentTypes.includes(InstrumentType.Index))
          return []
        const keyword = query.keyword.trim().toLowerCase()
        const matches =
          instrument.symbol.toLowerCase().includes(keyword) ||
          instrument.name.toLowerCase().includes(keyword)
        return matches ? [instrument].slice(0, query.limit) : []
      },
      async resolve(id, signal) {
        signal.throwIfAborted()
        return resolve(id)
      },
    },
    bars: {
      async fetch(request) {
        request.signal.throwIfAborted()
        const seed = mockSeedFor(instrument.symbol)
        // beforeTimestamp 是排他上界；缺省时以今天为最后一根，且不生成未来 K 线。
        const today = mockDayIndex(Date.now())
        const cursor =
          request.beforeTimestamp === undefined
            ? today
            : Math.min(Math.ceil(request.beforeTimestamp / MOCK_DAY_MS) - 1, today)
        return {
          bars: generateMockBars(seed, cursor, request.limit).map(
            (bar) => liveBars.get(mockDayIndex(bar.timestamp)) ?? bar,
          ),
          // 历史是即算即得的纯函数，永远还有更早的一页。
          olderData: OLDER_DATA_STATUS.AVAILABLE,
        }
      },
    },
    /** 内置流：打开即回快照，之后每秒推一根当日 forming 帧。 */
    stream(request, handlers) {
      let timer: ReturnType<typeof setInterval> | null = null
      let seq = 0
      let phase = Math.PI / 12
      const envelope = () => ({ seq: seq++, ts: Date.now() })
      const emit = (frame: import('../../../stream/types.js').StreamFrame): void => {
        handlers.onFrame(frame)
      }
      /** 跨零点时以昨日实时收盘作为今日开盘，保持首尾相连。 */
      const pushBar = (): void => {
        const day = mockDayIndex(Date.now())
        const seed = mockSeedFor(instrument.symbol)
        const base = liveBars.get(day) ?? generateMockBars(seed, day, 1)[0]!
        const open = liveBars.get(day)?.open ?? liveBars.get(day - 1)?.close ?? base.open
        const close = Math.round(open * (1 + Math.sin(phase) * 0.004) * 100) / 100
        phase += Math.PI / 12
        const bar: KLineData = {
          ...base,
          open,
          close,
          high: Math.max(base.high, open, close),
          low: Math.min(base.low, open, close),
        }
        liveBars.set(day, bar)
        if (!request.instrumentIds.includes(instrument.id)) return
        emit({
          ...envelope(),
          type: 'bar',
          instrumentId: instrument.id,
          state: 'forming',
          bar,
        })
      }
      return {
        open() {
          if (timer !== null) return
          handlers.onOpen()
          emit({ ...envelope(), type: 'hello', instruments: request.instrumentIds, snapshotSize: 2 })
          if (request.instrumentIds.includes(instrument.id)) {
            const day = mockDayIndex(Date.now())
            const bars = generateMockBars(mockSeedFor(instrument.symbol), day, 2).map(
              (bar) => liveBars.get(mockDayIndex(bar.timestamp)) ?? bar,
            )
            emit({ ...envelope(), type: 'snapshot', instrumentId: instrument.id, bars })
          }
          timer = setInterval(pushBar, 1_000)
        },
        close() {
          if (timer === null) return
          clearInterval(timer)
          timer = null
        },
      }
    },
  }
}
