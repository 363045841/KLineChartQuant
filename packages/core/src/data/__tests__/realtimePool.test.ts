/** 实时订阅池：连接聚合、品种扇出、状态回放与错误隔离，全部用替身事件源验证。 */
import { describe, expect, it, vi } from 'vitest'
import { createSignal } from '@/foundation/reactivity/signal.js'
import { createRealtimeSubscriptionPool } from '../live/impl/realtimePool.js'
import type { LiveEventSource } from '../live/impl/sseConnection.js'
import { createSseConnection } from '../live/impl/sseConnection.js'
import type { LiveBar, LiveFrame, RealtimeSubscriptionRequest } from '../live/types.js'
import type { MarketProviderHealth } from '../management/types.js'
import { createMockMarketDataProvider } from '../provider/__tests__/helpers/providerTestKit.js'
import { MarketDataProviderRegistry } from '../provider/impl/registry.js'

/** K 线帧载荷；默认平盘，确有差异时覆盖。 */
function bar(timestamp: number, close: number): LiveBar {
  return { timestamp, open: close, high: close, low: close, close }
}

/** 可手动触发的 EventSource 替身。 */
class FakeEventSource implements LiveEventSource {
  onopen: ((event: Event) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  closed = false

  constructor(readonly url: string) {}

  close(): void {
    this.closed = true
  }

  open(): void {
    this.onopen?.(new Event('open'))
  }

  send(frame: unknown): void {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(frame) }))
  }

  fail(): void {
    this.onerror?.(new Event('error'))
  }
}

/** 池 + 手动刷新的合并队列；合并窗口与真实微任务等价但可断言。 */
function setup() {
  const created: FakeEventSource[] = []
  const pending: Array<() => void> = []
  const registry = new MarketDataProviderRegistry()
  registry.register(createMockMarketDataProvider({ sourceId: 'mt5' }), {
    baseUrl: 'http://127.0.0.1:8090',
  })
  const health = createSignal<Readonly<Record<string, MarketProviderHealth>>>({})
  /** 发布真实健康快照形状，每次确认构成新的恢复机会。 */
  const setHealth = (status: MarketProviderHealth['status']) =>
    health.set({
      mt5: {
        status,
        checkedAt: Date.now(),
        connectionVersion: registry.getConnection('mt5').version,
      },
    })
  setHealth('online')
  const pool = createRealtimeSubscriptionPool({
    registry,
    health,
    createConnection: (request) =>
      createSseConnection(request, registry.getConfig(request.sourceId).baseUrl!, (url) => {
        const source = new FakeEventSource(url)
        created.push(source)
        return source
      }),
    defer: (run) => pending.push(run),
  })
  const flush = () => {
    while (pending.length > 0) pending.shift()!()
  }
  return { pool, created, flush, registry, health, setHealth }
}

/** K 线订阅请求；同一序列共享一条连接。 */
function bars(instrumentId: string): RealtimeSubscriptionRequest {
  return {
    sourceId: 'mt5',
    channel: 'bars',
    instrumentId,
    period: '1min',
    barAggregation: 'original',
    adjustment: 'none',
  }
}

/** 报价订阅请求；按来源聚合。 */
function quotes(instrumentId: string): RealtimeSubscriptionRequest {
  return { sourceId: 'mt5', channel: 'quotes', instrumentId }
}

/** 裁剪 URL 便于断言批量品种参数。 */
function instrumentsOf(url: string): string {
  return new URL(url).searchParams.get('instruments') ?? ''
}

describe('realtime subscription pool', () => {
  it('suspends offline subscriptions and resumes only after a successful health confirmation', () => {
    const { pool, created, flush, setHealth, health } = setup()
    setHealth('offline')
    const handle = pool.subscribe(quotes('mt5:A'))
    const frames = vi.fn()
    handle.onFrame(frames)
    flush()
    expect(created).toHaveLength(0)
    setHealth('online')
    flush()
    expect(created).toHaveLength(1)
    setHealth('online')
    flush()
    expect(created).toHaveLength(1)
    const confirmed = health.peek()
    created[0]!.fail()
    expect(created[0]!.closed).toBe(true)
    expect(health.peek()).toBe(confirmed)
    pool.subscribe(quotes('mt5:B'))
    flush()
    expect(created).toHaveLength(1)
    setHealth('online')
    flush()
    expect(created).toHaveLength(2)
    expect(instrumentsOf(created[1]!.url)).toBe('mt5:A,mt5:B')
    created[0]!.send({
      type: 'quote',
      instrumentId: 'mt5:A',
      last: 99,
      prevClose: 10,
      timestamp: 1,
    })
    expect(frames).not.toHaveBeenCalled()
    setHealth('offline')
    flush()
    expect(created[1]!.closed).toBe(true)
    pool.dispose()
  })

  it('reconciles disable, address change, unregister and disposal through the same pool', () => {
    const { pool, created, flush, registry, setHealth } = setup()
    pool.subscribe(quotes('mt5:A'))
    flush()
    registry.setConfig('mt5', { enabled: false })
    flush()
    expect(created[0]!.closed).toBe(true)
    registry.setConfig('mt5', { enabled: true })
    flush()
    expect(created).toHaveLength(2)
    registry.setConnection('mt5', 'http://localhost:9000')
    flush()
    expect(created[1]!.closed).toBe(true)
    expect(created).toHaveLength(2)
    setHealth('online')
    flush()
    expect(new URL(created[2]!.url).origin).toBe('http://localhost:9000')
    registry.unregister('mt5')
    flush()
    expect(created[2]!.closed).toBe(true)
    registry.register(createMockMarketDataProvider({ sourceId: 'mt5' }), {
      baseUrl: 'http://localhost:9000',
    })
    setHealth('online')
    flush()
    expect(created).toHaveLength(3)
    pool.subscribe(quotes('mt5:B'))
    flush()
    pool.dispose()
    expect(created[3]!.closed).toBe(true)
    setHealth('online')
    flush()
    expect(created).toHaveLength(4)
    expect(() => pool.subscribe(quotes('mt5:C'))).toThrow('disposed')
  })

  it('coalesces same-series subscriptions into one multiplexed connection', () => {
    const { pool, created, flush } = setup()
    pool.subscribe(bars('mt5:A'))
    pool.subscribe(bars('mt5:B'))
    flush()

    expect(created).toHaveLength(1)
    expect(instrumentsOf(created[0]!.url)).toBe('mt5:A,mt5:B')
    expect(new URL(created[0]!.url).searchParams.get('period')).toBe('1min')
  })

  it('fans frames out by instrument identity only', () => {
    const { pool, created, flush } = setup()
    const a = vi.fn<(frame: LiveFrame) => void>()
    const b = vi.fn<(frame: LiveFrame) => void>()
    pool.subscribe(bars('mt5:A')).onFrame(a)
    pool.subscribe(bars('mt5:B')).onFrame(b)
    flush()

    created[0]!.send({ type: 'update', instrumentId: 'mt5:A', bar: bar(1, 10) })

    expect(a).toHaveBeenCalledTimes(1)
    expect(b).not.toHaveBeenCalled()

    // 连接级状态帧按品种透传，消费端自行决定是否展示。
    created[0]!.send({ type: 'status', instrumentId: 'mt5:B', status: 'market-closed' })
    expect(b).toHaveBeenCalledWith({
      channel: 'bars',
      type: 'status',
      instrumentId: 'mt5:B',
      status: 'market-closed',
    })
  })

  it('rebuilds for remaining instruments and closes after the last subscriber leaves', () => {
    const { pool, created, flush } = setup()
    const a = pool.subscribe(bars('mt5:A'))
    const b = pool.subscribe(bars('mt5:B'))
    flush()

    b.close()
    flush()

    expect(created).toHaveLength(2)
    expect(created[0]!.closed).toBe(true)
    expect(instrumentsOf(created[1]!.url)).toBe('mt5:A')
    a.close()
    expect(created[1]!.closed).toBe(true)
  })

  it('keeps quotes and bars on independent connections', () => {
    const { pool, created, flush } = setup()
    pool.subscribe(bars('mt5:A'))
    pool.subscribe(quotes('mt5:A'))
    flush()

    expect(created).toHaveLength(2)
    expect(created.map((source) => new URL(source.url).pathname).sort()).toEqual([
      '/api/v1/market-data/sources/mt5/quotes',
      '/api/v1/market-data/sources/mt5/stream',
    ])
  })

  it('replays the current status to a second subscriber without rebuilding', () => {
    const { pool, created, flush } = setup()
    pool.subscribe(bars('mt5:A'))
    flush()
    created[0]!.open()

    const statuses: string[] = []
    pool.subscribe(bars('mt5:A')).onStatus((status) => statuses.push(status))
    flush()

    expect(statuses).toEqual(['connected'])
    expect(created).toHaveLength(1)
  })

  it('reports malformed frames as errors without closing the connection', () => {
    const { pool, created, flush } = setup()
    const handle = pool.subscribe(quotes('mt5:A'))
    const errors = vi.fn<(error: Error) => void>()
    const frames = vi.fn<(frame: LiveFrame) => void>()
    handle.onError(errors)
    handle.onFrame(frames)
    flush()

    created[0]!.send({ type: 'quote', instrumentId: 'mt5:A', last: 'oops' })
    created[0]!.send({
      type: 'quote',
      instrumentId: 'mt5:A',
      last: 12,
      prevClose: 10,
      timestamp: 5,
    })

    expect(errors).toHaveBeenCalledTimes(1)
    expect(frames).toHaveBeenCalledWith({
      channel: 'quotes',
      type: 'quote',
      instrumentId: 'mt5:A',
      quote: { last: 12, prevClose: 10, timestamp: 5 },
    })
  })

  it('rejects bars subscriptions without series parameters', () => {
    const { pool } = setup()
    expect(() =>
      pool.subscribe({ sourceId: 'mt5', channel: 'bars', instrumentId: 'mt5:A' }),
    ).toThrow('period, barAggregation and adjustment')
  })
})
