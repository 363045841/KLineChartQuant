/** 成交事实存储：身份去重、连续性证明与覆盖原子提交，不管理需求、查询状态或网络。 */

import { GENERIC_ERROR_CODES, KLineChartError } from '@/errors.js'
import { createSignal } from '@/foundation/reactivity/signal.js'
import type { InstrumentDescriptor } from '../../provider/types.js'
import {
  EMPTY_TRADE_SNAPSHOT,
  type MarketTrade,
  TRADE_STREAM_CODES,
  type TradeBuffer,
  type TradeFacts,
  type TradeRange,
  type TradeUpdate,
} from '../types.js'
import { mergeTradeRanges } from './tradeRanges.js'

/** 状态包含唯一数据事实及其身份索引、实时连续段证明。 */
interface StoredTrades {
  facts: TradeFacts
  ids: Set<string>
  additions: readonly string[]
  previous: MarketTrade | null
  boundary: number | null
}

/** 将成交追加到候选状态；去重只看 ID，批次压缩保留未验证成交。 */
function append(state: StoredTrades, items: readonly MarketTrade[]): StoredTrades {
  const additions = new Set<string>()
  const accepted: MarketTrade[] = []
  let latestTimestamp = state.facts.latestTimestamp
  for (const trade of items) {
    if (state.ids.has(trade.tradeId) || additions.has(trade.tradeId)) continue
    additions.add(trade.tradeId)
    accepted.push(trade)
    latestTimestamp = Math.max(latestTimestamp, trade.timestamp + 1)
  }
  let batches = accepted.length
    ? [...state.facts.batches, { items: accepted }]
    : state.facts.batches
  if (batches.length >= 128) batches = [{ items: batches.flatMap((batch) => batch.items) }]
  return {
    ...state,
    additions: [...additions],
    facts: { ...state.facts, batches, latestTimestamp },
  }
}

/**
 * 推进实时连续段证明：记录最后一个成交、待历史验证的起点，以及本次可确认的范围。
 * 成交在准入前不修改存储状态，因此该函数保持纯函数。
 */
function advanceContinuity(
  state: Pick<StoredTrades, 'previous' | 'boundary'>,
  trades: readonly MarketTrade[],
): Pick<StoredTrades, 'previous' | 'boundary'> & { readonly confirmed: readonly TradeRange[] } {
  let { previous, boundary } = state
  const confirmed: TradeRange[] = []
  for (const trade of trades) {
    const id = BigInt(trade.tradeId)
    if (previous && id <= BigInt(previous.tradeId)) continue
    if (!previous || id !== BigInt(previous.tradeId) + 1n || trade.timestamp < previous.timestamp) {
      // 首毫秒由历史重叠验证，跳号不能把旧段与新段之间的缺口填平。
      boundary = trade.timestamp + 1
    } else if (boundary !== null && trade.timestamp > boundary) {
      // 末毫秒仍可到达后续成交，更晚成交才能确认此前范围。
      confirmed.push({ from: boundary, to: trade.timestamp })
    }
    previous = trade
  }
  return { previous, boundary, confirmed }
}

/** 创建按实际品种与来源寻址的事实存储；公共缓存负责候选更新的预算准入。 */
export function createTradeBuffer(instrument: InstrumentDescriptor): TradeBuffer {
  const initial: TradeFacts = {
    revision: 0,
    tickSize: String(instrument.tickSize ?? 0),
    batches: [],
    coverage: [],
    latestTimestamp: EMPTY_TRADE_SNAPSHOT.latestTimestamp,
  }
  const snapshot = createSignal(initial)
  let state: StoredTrades = {
    facts: initial,
    ids: new Set(),
    additions: [],
    previous: null,
    boundary: null,
  }
  let disposed = false

  /** 候选结果不修改存储；只允许提交基于当前版本准备的更新。 */
  function prepare(next: StoredTrades): TradeUpdate {
    const base = state
    const facts = { ...next.facts, revision: base.facts.revision + 1 }
    return {
      facts,
      commit() {
        if (disposed) return
        if (state !== base)
          throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_STATE, '成交更新已过期')
        // 只在准入后的提交中扩展索引，实时更新不复制全部历史 ID。
        for (const id of next.additions) next.ids.add(id)
        state = { ...next, facts, additions: [] }
        snapshot.set(facts)
      },
    }
  }

  return {
    snapshot,
    get disposed() {
      return disposed
    },
    get historyBoundary() {
      return state.boundary
    },
    prepareHistory(batch) {
      const next = append(state, batch.items)
      return prepare({
        ...next,
        facts: {
          ...next.facts,
          coverage: mergeTradeRanges([...next.facts.coverage, batch.range]),
          latestTimestamp: Math.max(next.facts.latestTimestamp, batch.range.to),
        },
      })
    },
    prepareFrame(frame) {
      if (frame.type === 'status') {
        const reset =
          frame.code === TRADE_STREAM_CODES.connected ||
          frame.code === TRADE_STREAM_CODES.disconnected ||
          frame.complete === false
        return prepare(reset ? { ...state, previous: null, boundary: null } : state)
      }
      const next = append(state, frame.trades)
      const { previous, boundary, confirmed } = advanceContinuity(state, frame.trades)
      return prepare({
        ...next,
        previous,
        boundary,
        facts: {
          ...next.facts,
          coverage: mergeTradeRanges([...next.facts.coverage, ...confirmed]),
        },
      })
    },
    retain(range) {
      if (disposed) return false
      const items = state.facts.batches
        .flatMap((batch) => batch.items)
        .filter((trade) => trade.timestamp >= range.from && trade.timestamp < range.to)
      const coverage = mergeTradeRanges(
        state.facts.coverage.map((item) => ({
          from: Math.max(item.from, range.from),
          to: Math.min(item.to, range.to),
        })),
      )
      if (
        items.length === state.ids.size &&
        JSON.stringify(coverage) === JSON.stringify(state.facts.coverage)
      )
        return false
      prepare({
        facts: { ...state.facts, batches: items.length ? [{ items }] : [], coverage },
        ids: new Set(items.map((trade) => trade.tradeId)),
        additions: [],
        previous: state.previous,
        boundary: state.previous ? state.previous.timestamp + 1 : null,
      }).commit()
      return true
    },
    clear() {
      if (disposed) return
      prepare({
        facts: initial,
        ids: new Set(),
        additions: [],
        previous: null,
        boundary: null,
      }).commit()
    },
    dispose() {
      if (disposed) return
      prepare({
        facts: initial,
        ids: new Set(),
        additions: [],
        previous: null,
        boundary: null,
      }).commit()
      disposed = true
      snapshot.set({ ...state.facts, revision: state.facts.revision + 1 })
    },
  }
}
