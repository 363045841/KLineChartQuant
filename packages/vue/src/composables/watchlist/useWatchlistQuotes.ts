/** 自选报价：按品种订阅报价通道，连接由共享实时订阅池按来源聚合。 */

import type {
  LiveFrame,
  RealtimeStatus,
  RealtimeSubscription,
  RealtimeSubscriptionPool,
} from '@363045841yyt/klinechart-core/market-data'
import { useMarketDataContext } from '@vue-src/composables/market/useMarketDataContext.js'
import type { SearchableSymbol } from '@vue-src/composables/symbol/useSymbolSearch.js'
import { symbolIdentityKey } from '@vue-src/composables/symbol/useSymbolSearch.js'
import { type MaybeRefOrGetter, onScopeDispose, shallowRef, toValue, watch } from 'vue'

/** 报价数值；涨跌幅由展示层按昨收派生，不在状态里重复存。 */
export interface WatchlistQuote {
  last: number
  prevClose: number
  timestamp: number
}

/** 订阅键：来源 + 稳定品种 ID，同一 ID 在不同来源互不冲突。 */
function subscriptionKey(item: SearchableSymbol): string {
  return `${item.sourceId}\u0000${item.id}`
}

/**
 * 订阅自选内全部品种的实时报价。
 *
 * 订阅集合跟随自选列表增量变化；任一来源断线时该来源状态变为 disconnected，
 * 展示层据此切换为占位，而不是继续展示旧值。
 *
 * @param items - 自选条目
 * @param pool - 实时订阅池；默认使用宿主共享实例
 */
export function useWatchlistQuotes(
  items: MaybeRefOrGetter<ReadonlyArray<SearchableSymbol>>,
  pool: RealtimeSubscriptionPool = useMarketDataContext().realtime,
) {
  const quotes = shallowRef<ReadonlyMap<string, WatchlistQuote>>(new Map())
  const sourceStatus = shallowRef<ReadonlyMap<string, RealtimeStatus>>(new Map())
  const subscriptions = new Map<string, RealtimeSubscription>()

  // 同一轮内的连续帧合并为一次响应式写入，避免多品种同时跳动时反复渲染。
  const quoteDraft = new Map<string, WatchlistQuote>()
  const statusDraft = new Map<string, RealtimeStatus>(sourceStatus.value)
  let quotesDirty = false
  let statusDirty = false
  let flushScheduled = false

  /** 把草稿提交为新的只读快照；没有变化时不触发渲染。 */
  function flush(): void {
    flushScheduled = false
    if (quotesDirty) {
      quotesDirty = false
      quotes.value = new Map(quoteDraft)
    }
    if (statusDirty) {
      statusDirty = false
      sourceStatus.value = new Map(statusDraft)
    }
  }

  /** 合并到下一微任务，保证一次渲染只读一次快照。 */
  function scheduleFlush(): void {
    if (flushScheduled) return
    flushScheduled = true
    queueMicrotask(flush)
  }

  /** 为单个品种建立报价订阅；帧与状态分别落到两份草稿。 */
  function subscribe(item: SearchableSymbol): RealtimeSubscription {
    const key = symbolIdentityKey(item)
    const subscription = pool.subscribe({
      sourceId: item.sourceId,
      channel: 'quotes',
      instrumentId: item.id,
    })
    subscription.onStatus((status) => {
      statusDraft.set(item.sourceId, status)
      statusDirty = true
      scheduleFlush()
    })
    subscription.onFrame((frame: LiveFrame) => {
      if (frame.channel !== 'quotes') return
      quoteDraft.set(key, frame.quote)
      quotesDirty = true
      scheduleFlush()
    })
    return subscription
  }

  /** 订阅集合跟随自选列表做增量同步，并清理已移除条目的报价。 */
  function sync(): void {
    const current = toValue(items)
    const wanted = new Map<string, SearchableSymbol>()
    for (const item of current) wanted.set(subscriptionKey(item), item)

    for (const [key, subscription] of subscriptions) {
      if (wanted.has(key)) continue
      subscription.close()
      subscriptions.delete(key)
    }
    for (const [key, item] of wanted) {
      if (subscriptions.has(key)) continue
      subscriptions.set(key, subscribe(item))
    }

    const activeKeys = new Set(current.map((item) => symbolIdentityKey(item)))
    for (const key of quoteDraft.keys()) {
      if (activeKeys.has(key)) continue
      quoteDraft.delete(key)
      quotesDirty = true
    }
    if (quotesDirty) scheduleFlush()
  }

  watch(() => toValue(items), sync, { immediate: true })

  onScopeDispose(() => {
    for (const subscription of subscriptions.values()) subscription.close()
    subscriptions.clear()
  })

  return { quotes, sourceStatus }
}
