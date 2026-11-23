/** 自选报价订阅：增量订阅、连接事件驱动状态与释放。 */

import type {
  StreamEvent,
  StreamFrame,
  StreamHub,
  StreamSubscription,
  StreamSubscriptionRequest,
} from '@363045841yyt/klinechart-core/market-data'
import { TEST_SYMBOLS } from '@vue-src/composables/__tests__/testSymbols.js'
import { symbolIdentityKey } from '@vue-src/composables/symbol/useSymbolSearch.js'
import { describe, expect, it } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { useWatchlistQuotes } from '../useWatchlistQuotes.js'

/** 可手动投递帧与连接事件的订阅替身。 */
class FakeSubscription implements StreamSubscription {
  private readonly frameCbs = new Set<(frame: StreamFrame) => void>()
  private readonly eventCbs = new Set<(event: StreamEvent) => void>()
  closed = false

  constructor(readonly request: StreamSubscriptionRequest) {}

  onFrame(callback: (frame: StreamFrame) => void): () => void {
    this.frameCbs.add(callback)
    return () => this.frameCbs.delete(callback)
  }

  onEvent(callback: (event: StreamEvent) => void): () => void {
    this.eventCbs.add(callback)
    return () => this.eventCbs.delete(callback)
  }

  close(): void {
    this.closed = true
  }

  emit(event: StreamEvent): void {
    for (const callback of this.eventCbs) callback(event)
  }

  emitQuote(instrumentId: string, last: number, prevClose: number): void {
    const frame: StreamFrame = {
      seq: 0,
      ts: 1,
      type: 'quote',
      instrumentId,
      quote: { last, prevClose, timestamp: 1 },
    }
    for (const callback of this.frameCbs) callback(frame)
  }
}

/** 记录订阅请求的注册表替身。 */
class FakeHub implements StreamHub {
  readonly requests: StreamSubscriptionRequest[] = []
  readonly subscriptions = new Map<string, FakeSubscription>()

  subscribe(request: StreamSubscriptionRequest): StreamSubscription {
    const subscription = new FakeSubscription(request)
    this.requests.push(request)
    this.subscriptions.set(`${request.source}:${request.instrumentId}`, subscription)
    return subscription
  }

  resume(): void {}

  dispose(): void {}
}

describe('useWatchlistQuotes', () => {
  it('subscribes each symbol once and merges quote frames', async () => {
    const hub = new FakeHub()
    const scope = effectScope()
    const state = scope.run(() => useWatchlistQuotes(ref([...TEST_SYMBOLS]), hub))!
    await nextTick()

    expect(hub.requests.map((request) => request.instrumentId)).toEqual(
      TEST_SYMBOLS.map((item) => item.id),
    )
    expect(hub.requests.every((request) => request.channel === 'quotes')).toBe(true)

    const symbol = TEST_SYMBOLS[0]!
    const subscription = hub.subscriptions.get(`gotdx:${symbol.id}`)!
    subscription.emit({ kind: 'opened', reconnected: false })
    subscription.emitQuote(symbol.id, 12.5, 11)
    await Promise.resolve()

    expect(state.sourceStatus.value.get('gotdx')).toBe('online')
    expect(state.quotes.value.get(symbolIdentityKey(symbol))).toEqual({
      last: 12.5,
      prevClose: 11,
      timestamp: 1,
      direction: 'up',
    })
    scope.stop()
  })

  it('colors by the move against the previously displayed price', async () => {
    const hub = new FakeHub()
    const scope = effectScope()
    const state = scope.run(() => useWatchlistQuotes(ref([TEST_SYMBOLS[0]!]), hub))!
    await nextTick()

    const symbol = TEST_SYMBOLS[0]!
    const subscription = hub.subscriptions.get(`gotdx:${symbol.id}`)!
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

  it('reports connection failures per source and clears them after reconnect', async () => {
    const hub = new FakeHub()
    const scope = effectScope()
    const state = scope.run(() => useWatchlistQuotes(ref([...TEST_SYMBOLS]), hub))!
    await nextTick()

    const first = TEST_SYMBOLS[0]!
    const second = TEST_SYMBOLS[1]!
    const firstSubscription = hub.subscriptions.get(`gotdx:${first.id}`)!

    firstSubscription.emit({ kind: 'lost', reason: '报价通道不可用' })
    await Promise.resolve()
    expect(state.sourceErrors.value.get('gotdx')).toBe('报价通道不可用')
    expect(state.sourceStatus.value.get('gotdx')).toBe('backing-off')
    expect(state.sourceErrors.value.has('tradingview')).toBe(false)

    firstSubscription.emit({ kind: 'opened', reconnected: true })
    await Promise.resolve()
    expect(state.sourceErrors.value.has('gotdx')).toBe(false)
    expect(state.sourceStatus.value.get('gotdx')).toBe('online')

    expect(hub.subscriptions.get(`tradingview:${second.id}`)).toBeDefined()
    scope.stop()
  })

  it('closes subscriptions for removed symbols and on scope dispose', async () => {
    const hub = new FakeHub()
    const items = ref([...TEST_SYMBOLS])
    const scope = effectScope()
    scope.run(() => useWatchlistQuotes(items, hub))
    await nextTick()

    items.value = [TEST_SYMBOLS[1]!]
    await nextTick()
    expect(hub.subscriptions.get(`gotdx:${TEST_SYMBOLS[0]!.id}`)?.closed).toBe(true)
    expect(hub.subscriptions.get(`tradingview:${TEST_SYMBOLS[1]!.id}`)?.closed).toBe(false)

    scope.stop()
    expect([...hub.subscriptions.values()].every((subscription) => subscription.closed)).toBe(true)
  })
})
