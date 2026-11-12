/** 自选报价订阅：增量订阅、按来源聚合状态与释放。 */

import type {
  LiveFrame,
  RealtimeStatus,
  RealtimeSubscription,
  RealtimeSubscriptionPool,
  RealtimeSubscriptionRequest,
} from '@363045841yyt/klinechart-core/market-data'
import { TEST_SYMBOLS } from '@vue-src/composables/__tests__/testSymbols.js'
import { symbolIdentityKey } from '@vue-src/composables/symbol/useSymbolSearch.js'
import { describe, expect, it } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { useWatchlistQuotes } from '../useWatchlistQuotes.js'

/** 可手动投递帧与状态的订阅替身。 */
class FakeSubscription implements RealtimeSubscription {
  private readonly frameCbs = new Set<(frame: LiveFrame) => void>()
  private readonly statusCbs = new Set<(status: RealtimeStatus) => void>()
  private readonly errorCbs = new Set<(error: Error) => void>()
  closed = false

  constructor(readonly request: RealtimeSubscriptionRequest) {}

  onFrame(callback: (frame: LiveFrame) => void): () => void {
    this.frameCbs.add(callback)
    return () => this.frameCbs.delete(callback)
  }

  onStatus(callback: (status: RealtimeStatus) => void): () => void {
    this.statusCbs.add(callback)
    return () => this.statusCbs.delete(callback)
  }

  onError(callback: (error: Error) => void): () => void {
    this.errorCbs.add(callback)
    return () => this.errorCbs.delete(callback)
  }

  close(): void {
    this.closed = true
  }

  emitStatus(status: RealtimeStatus): void {
    for (const callback of this.statusCbs) callback(status)
  }

  emitError(message: string): void {
    for (const callback of this.errorCbs) callback(new Error(message))
  }

  emitQuote(instrumentId: string, last: number, prevClose: number): void {
    const frame: LiveFrame = {
      channel: 'quotes',
      type: 'quote',
      instrumentId,
      quote: { last, prevClose, timestamp: 1 },
    }
    for (const callback of this.frameCbs) callback(frame)
  }
}

/** 记录订阅请求的池替身。 */
class FakePool implements RealtimeSubscriptionPool {
  readonly requests: RealtimeSubscriptionRequest[] = []
  readonly subscriptions = new Map<string, FakeSubscription>()

  subscribe(request: RealtimeSubscriptionRequest): RealtimeSubscription {
    const subscription = new FakeSubscription(request)
    this.requests.push(request)
    this.subscriptions.set(`${request.sourceId}:${request.instrumentId}`, subscription)
    return subscription
  }

  dispose(): void {}
}

describe('useWatchlistQuotes', () => {
  it('subscribes each symbol once and merges quote frames', async () => {
    const pool = new FakePool()
    const scope = effectScope()
    const state = scope.run(() => useWatchlistQuotes(ref([...TEST_SYMBOLS]), pool))!
    await nextTick()

    expect(pool.requests.map((request) => request.instrumentId)).toEqual(
      TEST_SYMBOLS.map((item) => item.id),
    )
    expect(pool.requests.every((request) => request.channel === 'quotes')).toBe(true)

    const symbol = TEST_SYMBOLS[0]!
    const subscription = pool.subscriptions.get(`gotdx:${symbol.id}`)!
    subscription.emitStatus('connected')
    subscription.emitQuote(symbol.id, 12.5, 11)
    await Promise.resolve()

    expect(state.sourceStatus.value.get('gotdx')).toBe('connected')
    expect(state.quotes.value.get(symbolIdentityKey(symbol))).toEqual({
      last: 12.5,
      prevClose: 11,
      timestamp: 1,
      direction: 'up',
    })
    scope.stop()
  })

  it('colors by the move against the previously displayed price', async () => {
    const pool = new FakePool()
    const scope = effectScope()
    const state = scope.run(() => useWatchlistQuotes(ref([TEST_SYMBOLS[0]!]), pool))!
    await nextTick()

    const symbol = TEST_SYMBOLS[0]!
    const subscription = pool.subscriptions.get(`gotdx:${symbol.id}`)!
    const direction = () => state.quotes.value.get(symbolIdentityKey(symbol))?.direction

    // 首帧没有上一次展示值，以昨收为基准。
    subscription.emitQuote(symbol.id, 12.5, 11)
    await Promise.resolve()
    expect(direction()).toBe('up')

    // 价格低于上一次展示值即转跌，即使仍高于昨收。
    subscription.emitQuote(symbol.id, 12.4, 11)
    await Promise.resolve()
    expect(direction()).toBe('down')

    // 价格未变的重复帧沿用上一次方向。
    subscription.emitQuote(symbol.id, 12.4, 11)
    await Promise.resolve()
    expect(direction()).toBe('down')

    subscription.emitQuote(symbol.id, 12.6, 11)
    await Promise.resolve()
    expect(direction()).toBe('up')
    scope.stop()
  })

  it('reports subscription errors per source and clears them after reconnect', async () => {
    const pool = new FakePool()
    const scope = effectScope()
    const state = scope.run(() => useWatchlistQuotes(ref([...TEST_SYMBOLS]), pool))!
    await nextTick()

    const first = TEST_SYMBOLS[0]!
    const second = TEST_SYMBOLS[1]!
    const firstSubscription = pool.subscriptions.get(`gotdx:${first.id}`)!

    firstSubscription.emitError('报价通道不可用')
    await Promise.resolve()
    expect(state.sourceErrors.value.get('gotdx')).toBe('报价通道不可用')
    expect(state.sourceErrors.value.has('tradingview')).toBe(false)

    firstSubscription.emitStatus('connected')
    await Promise.resolve()
    expect(state.sourceErrors.value.has('gotdx')).toBe(false)

    expect(pool.subscriptions.get(`tradingview:${second.id}`)).toBeDefined()
    scope.stop()
  })

  it('closes subscriptions for removed symbols and on scope dispose', async () => {    const pool = new FakePool()
    const items = ref([...TEST_SYMBOLS])
    const scope = effectScope()
    scope.run(() => useWatchlistQuotes(items, pool))
    await nextTick()

    items.value = [TEST_SYMBOLS[1]!]
    await nextTick()
    expect(pool.subscriptions.get(`gotdx:${TEST_SYMBOLS[0]!.id}`)?.closed).toBe(true)
    expect(pool.subscriptions.get(`tradingview:${TEST_SYMBOLS[1]!.id}`)?.closed).toBe(false)

    scope.stop()
    expect([...pool.subscriptions.values()].every((subscription) => subscription.closed)).toBe(true)
  })
})
