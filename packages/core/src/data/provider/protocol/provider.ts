/**
 * 协议通用 Provider 装配器：把任意 Transport 组装为标准 MarketDataProvider
 * 后端只要实现该契约即可接入数据，接入方仅需提供 source 元信息与可选的本地规则
 */
import type { KLineData, TimeShareData } from '../../../controllers/types'
import { createMissingSessionError, KLineChartError } from '../../../errors'
import { MarketSessionRegistry } from '../../../engine/market/marketSessionRegistry'

import type {
  BarQuery,
  BarSeries,
  DataSourceDescriptor,
  InstrumentDescriptor,
  InstrumentSearchQuery,
  MarketDataProvider,
  TimeShareQuery,
  TimeShareSeries,
  VolumeUnit,
} from '../types'
import type {
  MarketDataTransport,
  ProtocolInstrumentDescriptor,
  ProtocolKLineItem,
  ProtocolTimeShareItem,
} from './types'

export interface MarketDataProviderOptions {
  // 数据源元信息；marketSessions 中声明的会话会注册进本地会话表
  source: DataSourceDescriptor
  // 传输实现，负责 wire 语义
  transport: MarketDataTransport
  // 成交量单位兜底推断；后端未返回 volumeUnit 时使用
  resolveVolumeUnit?: (instrument: InstrumentDescriptor) => VolumeUnit | undefined
}

// 默认成交量单位兜底：CN 市场非指数品种按手计，其余保持未知
function defaultResolveVolumeUnit(instrument: InstrumentDescriptor): VolumeUnit | undefined {
  return instrument.sessionId === 'CN' && instrument.assetClass !== 'index' ? 'lot' : undefined
}

// 将品种响应转换为前端领域模型
function mapInstrument(item: ProtocolInstrumentDescriptor): InstrumentDescriptor {
  return {
    id: item.id,
    sourceId: item.sourceId,
    symbol: item.symbol,
    name: item.name,
    assetClass: item.assetClass,
    exchange: item.exchange,
    sessionId: item.sessionId,
    currency: item.currency,
    providerRef: item.providerRef,
    capabilities: item.capabilities,
  }
}

// 将 K 线条目映射为核心 KLineData
function mapBar(item: ProtocolKLineItem, symbol: string): KLineData {
  return {
    timestamp: item.timestamp,
    date: item.date,
    open: item.open,
    high: item.high,
    low: item.low,
    close: item.close,
    volume: item.volume,
    turnover: item.turnover,
    amplitude: item.amplitude,
    changePercent: item.changePercent,
    changeAmount: item.changeAmount,
    turnoverRate: item.turnoverRate,
    symbol,
  }
}

// 将分时条目映射为核心 TimeShareData
function mapTimeShare(item: ProtocolTimeShareItem): TimeShareData {
  return {
    timestamp: item.timestamp,
    price: item.price,
    average: item.average,
    volume: item.volume,
    amount: item.amount,
  }
}

// 创建基于该协议的标准 MarketDataProvider
export function createMarketDataProvider(
  options: MarketDataProviderOptions,
): MarketDataProvider {
  const { source, transport } = options
  const runtimeSource = { ...source }
  const sessions = new MarketSessionRegistry(source.marketSessions)
  const resolveVolumeUnit = options.resolveVolumeUnit ?? defaultResolveVolumeUnit

  // 读取品种会话时区，缺失或未注册时拒绝请求
  function getInstrumentTimeZone(instrument: InstrumentDescriptor): string {
    if (!instrument.sessionId) {
      throw createMissingSessionError(source.id, instrument.id)
    }
    return sessions.getRequired(instrument.sessionId).timeZone
  }

  // 校验请求品种属于本源且声明了对应能力
  function assertCapability(
    instrument: InstrumentDescriptor,
    capability: 'bars' | 'timeShare',
  ): void {
    const supported =
      instrument.sourceId === source.id &&
      (capability === 'bars'
        ? instrument.capabilities.bars !== undefined
        : instrument.capabilities.timeShare === true)
    if (!supported) {
      throw new KLineChartError(
        'UNSUPPORTED_CAPABILITY',
        `[${source.id}] instrument ${instrument.id} does not support ${capability}`,
      )
    }
  }

  return {
    source: runtimeSource,

    // 通过 probe endpoint 探测数据源可用性，失败时返回 offline 而非抛错
    async probe(signal) {
      const startedAt = Date.now()
      try {
        const result = await transport.probe(source.id, signal)
        runtimeSource.capabilities = result.capabilities
        return {
          status: result.status,
          checkedAt: result.checkedAt,
          latencyMs: Date.now() - startedAt,
          capabilities: result.capabilities,
        }
      } catch (error) {
        return {
          status: 'offline',
          checkedAt: Date.now(),
          latencyMs: Date.now() - startedAt,
          message: error instanceof Error ? error.message : String(error),
        }
      }
    },

    catalog: {
      // 通过 instruments/search 搜索并归一化品种目录
      async search(query: InstrumentSearchQuery) {
        const result = await transport.searchInstruments(
          {
            sourceId: source.id,
            keyword: query.keyword,
            limit: query.limit,
            assetClasses: query.assetClasses,
          },
          query.signal,
        )
        const instruments = result.items.map(mapInstrument)
        if (!query.assetClasses?.length) return instruments
        const allowed = new Set(query.assetClasses)
        return instruments.filter((instrument) => allowed.has(instrument.assetClass))
      },
    },

    bars: {
      // 通过 bars endpoint 拉取标准 K 线
      async fetch(query: BarQuery) {
        assertCapability(query.instrument, 'bars')
        const timeZone = getInstrumentTimeZone(query.instrument)
        const result = await transport.fetchBars(
          {
            sourceId: source.id,
            instrument: {
              id: query.instrument.id,
              symbol: query.instrument.symbol,
              exchange: query.instrument.exchange,
              providerRef: query.instrument.providerRef,
            },
            period: query.period,
            adjustment: query.adjustment,
            limit: query.limit,
            ...(query.before === undefined ? {} : { before: query.before }),
          },
          query.signal,
        )
        return {
          instrumentId: query.instrument.id,
          period: query.period,
          adjustment: query.adjustment,
          timezone: result.timezone || timeZone,
          volumeUnit: result.volumeUnit ?? resolveVolumeUnit(query.instrument),
          data: result.items.map((item) => mapBar(item, query.instrument.symbol)),
          olderData: result.olderData,
        }
      },
    },

    timeShare: {
      // 通过 timeshare endpoint 拉取标准分时
      async fetch(query: TimeShareQuery) {
        assertCapability(query.instrument, 'timeShare')
        const timezone = getInstrumentTimeZone(query.instrument)
        const result = await transport.fetchTimeShare(
          {
            sourceId: source.id,
            instrument: {
              id: query.instrument.id,
              symbol: query.instrument.symbol,
              exchange: query.instrument.exchange,
              providerRef: query.instrument.providerRef,
            },
            tradingDate: query.tradingDate,
          },
          query.signal,
        )
        return {
          instrumentId: query.instrument.id,
          tradingDate: query.tradingDate,
          timezone: result.timezone || timezone,
          preClose: result.preClose,
          volumeUnit: result.volumeUnit ?? resolveVolumeUnit(query.instrument),
          data: result.items.map(mapTimeShare),
        }
      },
    },
  }
}
