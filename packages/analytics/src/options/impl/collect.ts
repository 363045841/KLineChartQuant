/**
 * 期权数据采集编排：拉链 → 聚合 → 落盘 → 读回校验。
 *
 * 写入两条流：
 * - `options/aggregate/{BTC|ETH}`：聚合位，保留期见 `types.ts`，每轮都写
 * - `options/chain/{BTC|ETH}`：原始链，按天分片滚动保留 90 天，只在采样分钟写
 *
 * 落盘后立刻按 capturedAt 读回并逐字段比对，确保「写成功」不是假象。
 */
import { ANALYTICS_ERROR_CODES, AnalyticsError } from '../../errors'
import type { DayAppendResult, DayShardStore } from '../../storage/types'
import { type OptionVenue, optionMarketOf } from '../markets'
import type {
  OptionAggregateSnapshot,
  OptionChainRecord,
  OptionContract,
  OptionCurrency,
  OptionVenueSource,
} from '../types'
import { aggregateOptionChain } from './aggregate'
import { isChainCaptureMinute } from './chainCadence'
import { optionChainStream, optionLayerStream } from './streams'

/** 采集请求。 */
export interface CollectOptionsRequest {
  /** 各场所的数据源；按注册表里的 venue 取用 */
  readonly sources: Readonly<Record<OptionVenue, OptionVenueSource>>
  /** 分片存储 */
  readonly store: DayShardStore
  /** 要采集的标的 */
  readonly currencies: readonly OptionCurrency[]
  /**
   * 原始链采样间隔（分钟）；null 表示不落链。
   * 只有采集时刻落在采样分钟的轮次才写 `options/chain/`，其余轮次只写聚合位。
   */
  readonly chainEveryMinutes: number | null
  /** 采集时钟（毫秒），测试可注入固定值 */
  readonly now: () => number
}

/** 单个标的的采集结果。 */
export interface CollectedOptionCurrency {
  /** 聚合位快照 */
  readonly snapshot: OptionAggregateSnapshot
  /** 聚合位写入结果 */
  readonly aggregateAppend: DayAppendResult
  /** 原始链写入结果；未开启落链时为 null */
  readonly chainAppend: DayAppendResult | null
  /** 拉链耗时（毫秒） */
  readonly chainElapsedMs: number
  /** 拉指数耗时（毫秒） */
  readonly indexElapsedMs: number
  /** 读回校验是否通过 */
  readonly readBackVerified: boolean
}

/**
 * 把合约转换成原始链行。
 *
 * @param contract 合约
 * @param capturedAt 快照采集时刻
 * @returns 原始链行
 */
function toChainRecord(contract: OptionContract, capturedAt: number): OptionChainRecord {
  return {
    schemaVersion: 1,
    currency: contract.currency,
    capturedAt,
    instrumentName: contract.instrumentName,
    expiryIso: contract.expiryIso,
    strike: contract.strike,
    optionType: contract.optionType,
    openInterest: contract.openInterest,
    markIvPercent: contract.markIvPercent,
    markPrice: contract.markPrice,
    underlyingPrice: contract.underlyingPrice,
  }
}

/**
 * 采集指定标的的期权数据。
 *
 * @param request 客户端、存储、标的与时钟
 * @returns 每个标的的采集结果
 * @throws AnalyticsError 网络失败、聚合失败、写入失败或读回不一致
 */
export async function collectOptionCurrencies(
  request: CollectOptionsRequest,
): Promise<readonly CollectedOptionCurrency[]> {
  const collected: CollectedOptionCurrency[] = []

  for (const currency of request.currencies) {
    const market = optionMarketOf(currency)
    if (market === null) {
      throw new AnalyticsError(
        ANALYTICS_ERROR_CODES.ARGUMENT_INVALID,
        `没有登记的期权标的：${currency}`,
        { currency },
      )
    }
    const source = request.sources[market.venue]
    const chain = await source.getOptionChain(currency)
    const index = await source.getIndexPrice(currency)
    const capturedAt = request.now()
    const snapshot = aggregateOptionChain({
      currency,
      venue: market.venue,
      contracts: chain.contracts,
      spotIndex: index.indexPrice,
      capturedAt,
    })

    const stream = optionLayerStream(currency, 'minute')
    const aggregateResults = request.store.append({
      stream,
      rows: [snapshot],
      dayOf: () => capturedAt,
      dedupeKey: (row) => String(row.capturedAt),
    })
    const aggregateAppend = aggregateResults[0]
    if (aggregateAppend === undefined) {
      throw new AnalyticsError(
        ANALYTICS_ERROR_CODES.STORAGE_WRITE_FAILED,
        `聚合位写入没有返回分片结果：${stream}`,
      )
    }

    // 采样门按本次快照的采集时刻判定：节奏与聚合位对齐，不引入额外状态。
    const chainDue =
      request.chainEveryMinutes !== null &&
      isChainCaptureMinute(capturedAt, request.chainEveryMinutes)
    let chainAppend: DayAppendResult | null = null
    if (chainDue) {
      const chainResults = request.store.append({
        stream: optionChainStream(currency),
        rows: chain.contracts.map((contract) => toChainRecord(contract, capturedAt)),
        dayOf: (row) => row.capturedAt,
        dedupeKey: (row) => `${row.capturedAt}|${row.instrumentName}`,
      })
      chainAppend = chainResults[0] ?? null
    }

    const stored = request.store.read<OptionAggregateSnapshot>({
      stream,
      day: aggregateAppend.day,
    })
    const persisted = stored.find((row) => row.capturedAt === snapshot.capturedAt)
    const expectedText = JSON.stringify(snapshot)
    const actualText = persisted === undefined ? null : JSON.stringify(persisted)
    const readBackVerified = actualText === expectedText
    if (!readBackVerified) {
      throw new AnalyticsError(
        ANALYTICS_ERROR_CODES.STORAGE_WRITE_FAILED,
        `聚合位读回校验失败：${stream}/${aggregateAppend.day}`,
        {
          stream,
          day: aggregateAppend.day,
          capturedAt,
          expected: expectedText,
          actual: actualText,
        },
      )
    }

    collected.push({
      snapshot,
      aggregateAppend,
      chainAppend,
      chainElapsedMs: chain.elapsedMs,
      indexElapsedMs: index.elapsedMs,
      readBackVerified,
    })
  }

  return collected
}
