/** 流模块：帧解析、退避策略、连接行为与注册表生命周期。 */

import { describe, expect, it } from 'vitest'
import { createConnection, type StreamScheduler } from '../impl/connection.js'
import { createStreamHub } from '../impl/hub.js'
import { backoffDelay } from '../impl/policy.js'
import { assertSubscription, buildStreamUrl, parseStreamFrame } from '../impl/protocol.js'
import type {
  StreamFrame,
  StreamRequest,
  StreamSubscriptionRequest,
  StreamTransport,
  StreamTransportHandlers,
} from '../types.js'

/** 手动推进的时钟：定时器按到期时间执行，随机源固定为 0.5。 */
function createClock() {
  let now = 0
  let timers: Array<{ at: number; run: () => void }> = []
  const scheduler: StreamScheduler = {
    now: () => now,
    random: () => 0.5,
    schedule(delayMs, run) {
      const timer = { at: now + delayMs, run }
      timers.push(timer)
      return () => {
        timers = timers.filter((item) => item !== timer)
      }
    },
  }
  return {
    scheduler,
    advance(ms: number) {
      now += ms
      for (;;) {
        const due = timers.filter((timer) => timer.at <= now).sort((a, b) => a.at - b.at)
        if (due.length === 0) return
        timers = timers.filter((timer) => timer.at > now)
        for (const timer of due) timer.run()
      }
    },
  }
}

/** 传输替身：记录每次建流与关闭，并暴露最近一条传输的回调。 */
function createTransports() {
  const requests: StreamRequest[] = []
  const created: StreamTransportHandlers[] = []
  const closed: number[] = []
  return {
    requests,
    closed,
    get handlers(): StreamTransportHandlers {
      const latest = created.at(-1)
      if (latest === undefined) throw new Error('Transport is not created yet')
      return latest
    },
    factory: (request: StreamRequest, handlers: StreamTransportHandlers): StreamTransport => {
      requests.push(request)
      created.push(handlers)
      return {
        open() {},
        close() {
          closed.push(1)
        },
      }
    },
  }
}

/** 一条 bars 订阅请求；报价通道只需要来源与品种。 */
function barsRequest(instrumentId = 'A', source = 'src'): StreamSubscriptionRequest {
  return {
    source,
    channel: 'bars',
    instrumentId,
    period: 'daily',
    adjustment: 'none',
    barAggregation: 'original',
  }
}

/** 构造一条与订阅无关的 K 线帧。 */
function barFrame(instrumentId: string, seq: number): StreamFrame {
  return {
    seq,
    ts: seq,
    type: 'bar',
    instrumentId,
    state: 'forming',
    bar: { timestamp: seq, open: 1, high: 2, low: 1, close: 2 },
  }
}

describe('parseStreamFrame', () => {
  it.each([
    ['ping', { type: 'ping', seq: 1, ts: 1 }],
    ['status', { type: 'status', seq: 1, ts: 1, instrumentId: 'A', status: 'market-closed' }],
    [
      'bar',
      {
        type: 'bar',
        seq: 1,
        ts: 1,
        instrumentId: 'A',
        state: 'forming',
        bar: { timestamp: 1, open: 1, high: 2, low: 1, close: 2 },
      },
    ],
  ])('accepts a valid %s frame', (_name, frame) => {
    expect(parseStreamFrame(frame)).toMatchObject({ type: frame.type })
  })

  it.each([
    ['without seq', { type: 'ping', ts: 1 }],
    ['unknown type', { type: 'update', seq: 1, ts: 1 }],
    ['unknown status', { type: 'status', seq: 1, ts: 1, instrumentId: 'A', status: 'weird' }],
    ['bar without state', { type: 'bar', seq: 1, ts: 1, instrumentId: 'A', bar: {} }],
    [
      'unknown error code',
      { type: 'error', seq: 1, ts: 1, code: 'nope', message: 'x', retryable: true },
    ],
  ])('rejects a frame %s', (_name, frame) => {
    expect(() => parseStreamFrame(frame)).toThrow(TypeError)
  })
})

describe('buildStreamUrl', () => {
  it('carries the instrument set and serial parameters for the bars channel', () => {
    expect(buildStreamUrl({ ...barsRequest('A'), instrumentIds: ['B', 'A'] }, 'http://x')).toBe(
      'http://x/api/v1/market-data/sources/src/stream?instruments=B%2CA&period=daily&adjustment=none&barAggregation=original',
    )
  })

  it('omits serial parameters for the quotes channel', () => {
    const request: StreamRequest = {
      source: 'src',
      channel: 'quotes',
      instrumentIds: ['A'],
    }
    expect(buildStreamUrl(request, 'http://x')).toBe(
      'http://x/api/v1/market-data/sources/src/quotes?instruments=A',
    )
  })

  it('rejects a bars request without serial parameters', () => {
    const request: StreamRequest = { source: 'src', channel: 'bars', instrumentIds: ['A'] }
    expect(() => buildStreamUrl(request, 'http://x')).toThrow('period and adjustment')
  })
})

describe('assertSubscription', () => {
  it.each([
    ['bars without serial parameters', { source: 'src', channel: 'bars', instrumentId: 'A' }],
    ['missing instrument', { source: 'src', channel: 'quotes', instrumentId: '' }],
  ])('rejects %s', (_name, request) => {
    expect(() => assertSubscription(request as StreamSubscriptionRequest)).toThrow()
  })

  it('accepts a complete bars subscription', () => {
    expect(() => assertSubscription(barsRequest())).not.toThrow()
  })
})

describe('backoffDelay', () => {
  it('grows exponentially, stays jittered and caps at the policy maximum', () => {
    const policy = { baseMs: 1_000, capMs: 30_000, stableMs: 30_000 }
    expect(backoffDelay(0, () => 0, policy)).toBe(500)
    expect(backoffDelay(0, () => 0.999, policy)).toBeLessThanOrEqual(1_000)
    expect(backoffDelay(3, () => 0, policy)).toBe(4_000)
    expect(backoffDelay(9, () => 0, policy)).toBe(15_000)
    expect(backoffDelay(9, () => 0.999, policy)).toBeLessThanOrEqual(30_000)
  })
})

describe('createConnection', () => {
  /** 建一条连接与一份传输替身，供各用例复用。 */
  function setup() {
    const clock = createClock()
    const transports = createTransports()
    const connection = createConnection({
      source: 'src',
      channel: 'bars',
      period: 'daily',
      adjustment: 'none',
      barAggregation: 'original',
      createTransport: transports.factory,
      scheduler: clock.scheduler,
      onEmpty: () => {},
    })
    return { clock, transports, connection }
  }

  it('opens one transport on the first subscription and routes frames by instrument', () => {
    const { transports, connection } = setup()
    const frames: StreamFrame[] = []
    const handle = connection.subscribe(barsRequest('A'))
    handle.onFrame((frame) => frames.push(frame))
    expect(transports.requests).toHaveLength(1)
    expect(transports.requests[0]?.instrumentIds).toEqual(['A'])

    transports.handlers.onFrame(barFrame('B', 1))
    transports.handlers.onFrame(barFrame('A', 2))
    expect(frames.map((frame) => frame.seq)).toEqual([2])
  })

  it('ignores connection-level frames without touching the transport', () => {
    const { transports, connection } = setup()
    const frames: StreamFrame[] = []
    connection.subscribe(barsRequest()).onFrame((frame) => frames.push(frame))
    transports.handlers.onOpen()
    transports.handlers.onFrame({
      seq: 1,
      ts: 1,
      type: 'hello',
      instruments: ['A'],
      snapshotSize: 0,
    })
    transports.handlers.onFrame({ seq: 2, ts: 2, type: 'ping' })
    expect(frames).toHaveLength(0)
    expect(transports.closed).toHaveLength(0)
  })

  it('retries after the jittered backoff window and marks the reopen as reconnected', () => {
    const { clock, transports, connection } = setup()
    const events: string[] = []
    const handle = connection.subscribe(barsRequest())
    handle.onEvent((event) => events.push(event.kind))
    transports.handlers.onOpen()
    transports.handlers.onClose({ retryable: true, message: 'lost' })

    // full jitter：base 1s、random 0.5 → 750ms。
    clock.advance(749)
    expect(transports.requests).toHaveLength(1)
    clock.advance(1)
    expect(transports.requests).toHaveLength(2)
    transports.handlers.onOpen()
    expect(events).toEqual(['opened', 'lost', 'opened'])
  })

  it('stops without retrying when the transport reports a permanent close', () => {
    const { clock, transports, connection } = setup()
    const events: string[] = []
    connection.subscribe(barsRequest()).onEvent((event) => events.push(event.kind))
    transports.handlers.onOpen()
    transports.handlers.onClose({ retryable: false, message: 'unauthorized' })
    clock.advance(60_000)
    expect(transports.requests).toHaveLength(1)
    expect(transports.closed).toHaveLength(1)
    expect(events).toEqual(['opened', 'stopped'])
  })

  it('closes a stalled connection when the watchdog sees no activity within the stale window', () => {
    const { clock, transports, connection } = setup()
    connection.subscribe(barsRequest())
    transports.handlers.onOpen()
    clock.advance(50_000)
    expect(transports.closed).toHaveLength(1)
    // 僵死判定走一条普通重试：退避到期后重开。
    clock.advance(750)
    expect(transports.requests).toHaveLength(2)
  })

  it('reconnects immediately on resume while backing off', () => {
    const { transports, connection } = setup()
    connection.subscribe(barsRequest())
    transports.handlers.onOpen()
    transports.handlers.onClose({ retryable: true, message: 'lost' })
    connection.resume()
    expect(transports.requests).toHaveLength(2)
  })

  it('leaves a live connection untouched on resume', () => {
    const { transports, connection } = setup()
    connection.subscribe(barsRequest())
    transports.handlers.onOpen()
    connection.resume()
    expect(transports.requests).toHaveLength(1)
    expect(transports.closed).toHaveLength(0)
  })

  it('rebuilds once when a second instrument joins in the same turn', async () => {
    const { transports, connection } = setup()
    connection.subscribe(barsRequest('A'))
    connection.subscribe(barsRequest('B'))
    await Promise.resolve()
    expect(transports.requests).toHaveLength(2)
    expect(transports.requests[1]?.instrumentIds).toEqual(['A', 'B'])
  })

  it('closes the transport and notifies the owner when the last subscription leaves', () => {
    const clock = createClock()
    const transports = createTransports()
    let emptied = 0
    const connection = createConnection({
      source: 'src',
      channel: 'quotes',
      createTransport: transports.factory,
      scheduler: clock.scheduler,
      onEmpty: () => {
        emptied += 1
      },
    })
    const handle = connection.subscribe({ source: 'src', channel: 'quotes', instrumentId: 'A' })
    handle.close()
    expect(transports.closed).toHaveLength(1)
    expect(emptied).toBe(1)
  })
})

describe('createStreamHub', () => {
  it.each([
    {
      name: 'reuses one connection for the same key and disposes it with the last subscription',
      requests: [barsRequest('A'), barsRequest('A')],
      opened: 1,
      closesAfterFirst: 0,
      closesAfterBoth: 1,
    },
    {
      name: 'keeps quotes and bars on separate connections',
      requests: [
        { source: 'src', channel: 'quotes' as const, instrumentId: 'A' },
        barsRequest('A'),
      ],
      opened: 2,
      closesAfterFirst: 1,
      closesAfterBoth: 2,
    },
  ])('$name', ({ requests, opened, closesAfterFirst, closesAfterBoth }) => {
    const clock = createClock()
    const transports = createTransports()
    const hub = createStreamHub({
      createTransport: transports.factory,
      scheduler: clock.scheduler,
    })
    const first = hub.subscribe(requests[0]!)
    const second = hub.subscribe(requests[1]!)
    expect(transports.requests).toHaveLength(opened)
    second.close()
    expect(transports.closed).toHaveLength(closesAfterFirst)
    first.close()
    expect(transports.closed).toHaveLength(closesAfterBoth)
    hub.dispose()
  })

  it('rejects subscriptions after dispose and closes live transports', () => {
    const clock = createClock()
    const transports = createTransports()
    const hub = createStreamHub({
      createTransport: transports.factory,
      scheduler: clock.scheduler,
    })
    hub.subscribe(barsRequest())
    hub.dispose()
    expect(transports.closed).toHaveLength(1)
    expect(() => hub.subscribe(barsRequest())).toThrow('disposed')
  })
})
