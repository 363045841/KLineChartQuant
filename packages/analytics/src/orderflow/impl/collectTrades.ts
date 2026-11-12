/**
 * 钟级大单分层的采集编排：续拉成交 → 归入小时桶 → 整点封存落盘。
 *
 * 状态（续拉游标 + 当前桶 + 已见成交 ID）写在 `orderflow/state/` 下的独立小文件，
 * 与按天分片的数据分开：状态是「进程的续跑凭据」，每天一个分片的数据是「事实记录」。
 * 混在一起会让分片回读时必须跳过状态行，得不偿失。
 *
 * 封存时机：本地时钟跨过整点后，第一次采集时把上一小时封存。因此每小时至少会被
 * 采到一次即可，不要求恰好在整点触发——采集间隔抖动不会丢小时。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DayAppendResult, DayShardStore } from '../../storage/types'
import type { LargeOrderRecord, OrderflowVenue } from '../types'
import type { FlowClient } from './flowVenues'
import {
  type AccumulatedTrade,
  addTrades,
  createAccumulator,
  type HourAccumulator,
  hourStartOf,
  sealAccumulator,
  shouldSeal,
  type TradeCoverage,
} from './largeOrderAccumulator'

/** 已见成交 ID 的保留上限：sampled 口径靠它去重，太大吃内存，太小会重复计数。 */
const SEEN_ID_LIMIT = 5000

/** 持久化的小时状态。 */
interface PersistedState {
  /** 状态结构版本 */
  readonly schemaVersion: 1
  /** 续拉游标；sampled 口径为 null */
  readonly cursor: string | null
  /** 当前小时桶 */
  readonly accumulator: HourAccumulator
  /** 已见成交 ID（仅 sampled 口径使用） */
  readonly seenIds: readonly string[]
}

/** 单个交易所 + 交易对的一轮结果。 */
export interface VenueTradeRound {
  /** 交易所 */
  readonly venue: OrderflowVenue
  /** 交易对 */
  readonly symbol: string
  /** 覆盖口径 */
  readonly coverage: TradeCoverage
  /** 本轮新增笔数（去重后） */
  readonly added: number
  /** 封存的整点（毫秒）；本轮没有封存为 null */
  readonly sealedHour: number | null
  /** 封存记录的落盘结果 */
  readonly appends: readonly DayAppendResult[]
}

/** 采集请求。 */
export interface CollectTradesRequest {
  /** 成交客户端 */
  readonly client: FlowClient
  /** 分片存储 */
  readonly store: DayShardStore
  /** 状态目录 */
  readonly stateDir: string
  /** 交易所列表 */
  readonly venues: readonly OrderflowVenue[]
  /** 交易对列表 */
  readonly symbols: readonly string[]
  /** 当前时刻（毫秒），测试可注入 */
  readonly now: () => number
}

/**
 * 生成状态文件路径。
 *
 * @param stateDir 状态目录
 * @param venue 交易所
 * @param symbol 交易对
 * @returns 文件路径
 */
function stateFileOf(stateDir: string, venue: OrderflowVenue, symbol: string): string {
  return join(stateDir, `trades-${venue}-${symbol}.json`)
}

/**
 * 读取已保存的状态。
 *
 * @param path 文件路径
 * @param venue 交易所
 * @param symbol 交易对
 * @param now 当前时刻
 * @returns 状态；不存在时新建
 */
function loadState(
  path: string,
  venue: OrderflowVenue,
  symbol: string,
  now: number,
): PersistedState {
  if (!existsSync(path)) {
    return {
      schemaVersion: 1,
      cursor: null,
      accumulator: createAccumulator(venue, symbol, hourStartOf(now), 'exact'),
      seenIds: [],
    }
  }
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('accumulator' in parsed) ||
    !('cursor' in parsed)
  ) {
    throw new Error(`状态文件结构不符：${path}`)
  }
  const candidate = parsed as { cursor: unknown; accumulator: unknown; seenIds?: unknown }
  if (typeof candidate.accumulator !== 'object' || candidate.accumulator === null) {
    throw new Error(`状态文件缺少小时桶：${path}`)
  }
  const accumulator = candidate.accumulator as HourAccumulator
  return {
    schemaVersion: 1,
    cursor: typeof candidate.cursor === 'string' ? candidate.cursor : null,
    accumulator,
    seenIds: Array.isArray(candidate.seenIds)
      ? candidate.seenIds.filter((item): item is string => typeof item === 'string')
      : [],
  }
}

/**
 * 写入状态。
 *
 * @param path 文件路径
 * @param state 状态
 */
function saveState(path: string, state: PersistedState): void {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, JSON.stringify(state), 'utf8')
}

/**
 * 把小时桶封存并落盘。
 *
 * @param store 分片存储
 * @param venue 交易所
 * @param symbol 交易对
 * @param accumulator 小时桶
 * @returns 落盘结果
 */
function sealInto(
  store: DayShardStore,
  venue: OrderflowVenue,
  symbol: string,
  accumulator: HourAccumulator,
): readonly DayAppendResult[] {
  const { buckets, takerBuyRatio } = sealAccumulator(accumulator)
  const record: LargeOrderRecord = {
    schemaVersion: 1,
    hourStart: accumulator.hourStart,
    venue,
    symbol,
    timestamp: accumulator.hourStart + 3_600_000 - 1,
    trades: accumulator.trades,
    // 钟级记录的时间跨度固定为一小时；实际覆盖笔数见 `trades`
    spanMs: 3_600_000,
    buckets,
    takerBuyRatio,
  }
  return store.append({
    stream: `orderflow/large-orders/${venue}/${symbol}`,
    rows: [record],
    dayOf: (row) => row.hourStart,
    dedupeKey: (row) => String(row.hourStart),
  })
}

/**
 * 采集一轮逐笔成交并按小时累加。
 *
 * @param request 客户端、存储、状态目录、交易所与交易对
 * @returns 每个交易所 + 交易对的结果
 */
export async function collectTradeBuckets(
  request: CollectTradesRequest,
): Promise<readonly VenueTradeRound[]> {
  const rounds: VenueTradeRound[] = []
  mkdirSync(request.stateDir, { recursive: true })

  for (const venue of request.venues) {
    for (const symbol of request.symbols) {
      const path = stateFileOf(request.stateDir, venue, symbol)
      const nowMs = request.now()
      const state = loadState(path, venue, symbol, nowMs)

      let batch
      try {
        batch = await request.client.fetchTrades(venue, symbol, state.cursor)
      } catch {
        // 该所不支持逐笔（OKX）或临时失败：跳过，不写状态，等下一轮重试
        rounds.push({
          venue,
          symbol,
          coverage: state.accumulator.coverage,
          added: 0,
          sealedHour: null,
          appends: [],
        })
        continue
      }

      const seen = new Set(state.seenIds)
      const fresh: AccumulatedTrade[] = []
      for (const trade of batch.trades) {
        if (seen.has(trade.id)) continue
        seen.add(trade.id)
        fresh.push({ notional: trade.notional, takerBuy: trade.takerBuy, time: trade.time })
      }

      // 保留最近 SEEN_ID_LIMIT 个，防止状态文件无限增长
      const seenIds = [...seen].slice(-SEEN_ID_LIMIT)

      // 按小时分组：旧小时的成交先封存，再进新桶
      let accumulator = state.accumulator
      let sealedHour: number | null = null
      const appends: DayAppendResult[] = []

      const byHour = new Map<number, AccumulatedTrade[]>()
      for (const trade of fresh) {
        const hour = hourStartOf(trade.time)
        const list = byHour.get(hour)
        if (list === undefined) byHour.set(hour, [trade])
        else list.push(trade)
      }

      for (const [hour, trades] of [...byHour.entries()].sort(
        (left, right) => left[0] - right[0],
      )) {
        if (hour !== accumulator.hourStart) {
          // 跨小时：有内容的旧桶先封存
          if (accumulator.trades > 0) {
            appends.push(...sealInto(request.store, venue, symbol, accumulator))
            sealedHour = accumulator.hourStart
          }
          accumulator = createAccumulator(venue, symbol, hour, batch.coverage)
        }
        accumulator = addTrades(accumulator, trades)
      }

      if (shouldSeal(accumulator, nowMs) && accumulator.trades > 0) {
        appends.push(...sealInto(request.store, venue, symbol, accumulator))
        sealedHour = accumulator.hourStart
        accumulator = createAccumulator(venue, symbol, hourStartOf(nowMs), batch.coverage)
      }

      saveState(path, {
        schemaVersion: 1,
        cursor: batch.nextCursor,
        accumulator,
        seenIds,
      })

      rounds.push({
        venue,
        symbol,
        coverage: batch.coverage,
        added: fresh.length,
        sealedHour,
        appends,
      })
    }
  }

  return rounds
}
