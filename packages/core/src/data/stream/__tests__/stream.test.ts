/** 流模块：协议解析、退避策略、连接状态机与注册表聚合。 */

import { describe, expect, it } from 'vitest'
import { createConnection, type StreamScheduler } from '../impl/connection.js'
import { createStreamHub } from '../impl/hub.js'
import { backoffDelay } from '../impl/policy.js'
import { parseStreamFrame } from '../impl/protocol.js'
import type {
  StreamFrame,
  StreamPhase,
  StreamRequest,
  StreamTransport,
  StreamTransportHandlers,
} from '../types.js'

/** 手动推进的时钟：定时器按到期时间排序执行，随机源固定。 */
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

/** 传输替身：记录打开、关闭次数，并保留回调供用例驱动。 */
function createTransportSpy() {
  const opened: number[] = []
  const closed: number[] = []
  let handlers: StreamTransportHandlers | null = null
  return {
    opened,
    closed,
    get handlers() {
      if (handlers === null) throw new Error('Transport is not created yet')
      return handlers
    },
    factory: (request: StreamRequest, created: StreamTransportHandlers): StreamTransport => {
      handlers = created
      return {
        open() {
          opened.push(request.instrumentIds.length)
        },
        close() {
          closed.push(1)
        },
      }
    },
  }
}

/** 构造一条 bars 订阅请求。 */
function barsRequest(instrumentId = 'A', source = 'src') {
  return {
    source,
    channel: 'bars' as const,
    instrumentId,
    period: 'daily' as const,
    adjustment: 'none' as const,
    barAggregation: 'original' as const,
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
  ])('rejects a frame %s', (_name, frame) => {
    expect(() => parseStreamFrame(frame)).toThrow(TypeError)
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
  it('opens on demand, routes frames by instrument and reports the phase', () => {
    const clock = createClock()
    const transport = createTransportSpy()
    const connection = createConnection({
      source: 'src',
      channel: 'bars',
      period: 'daily',
      adjustment: 'none',
      barAggregation: 'original',
      createTransport: transport.factory,
      scheduler: clock.scheduler,
      onEmpty: () => {},
    })
    const frames: StreamFrame[] = []
    const handle = connection.subscribe(barsRequest('A'))
    handle.onFrame((frame) => frames.push(frame))
    expect(transport.opened).toEqual([1])
    expect(connection.phase.peek()).toBe('connecting')

    transport.handlers.onFrame({
      seq: 1,
      ts: 1,
      type: 'bar',
      instrumentId: 'B',
      state: 'forming',
      bar: { timestamp: 1, open: 1, high: 1, low: 1, close: 1 },
    })
    expect(frames).toHaveLength(0)
    transport.handlers.onFrame({
      seq: 2,
      ts: 2,
      type: 'bar',
      instrumentId: 'A',
      state: 'closed',
      bar: { timestamp: 2, open: 1, high: 1, low: 1, close: 1 },
    })
    expect(frames).toHaveLength(1)
    handle.close()
    expect(transport.closed).toHaveLength(1)
    expect(connection.isEmpty()).toBe(true)
  })

  it('backs off after a loss, reconnects and marks the open as reconnected', () => {
    const clock = createClock()
    const transport = createTransportSpy()
    const events: string[] = []
    const connection = createConnection({
      source: 'src',
      channel: 'bars',
      period: 'daily',
      adjustment: 'none',
      barAggregation: 'original',
      createTransport: transport.factory,
      scheduler: clock.scheduler,
      onEmpty: () => {},
    })
    const handle = connection.subscribe(barsRequest())
    handle.onEvent((event) => events.push(event.kind))
    transport.handlers.onOpen()
    transport.handlers.onClose({ retryable: true, message: 'lost' })
    expect(connection.phase.peek()).toBe('backing-off')
    // full jitter：0.75s（base 1s，jitter 落在 [500, 1000]）。
    clock.advance(1_000)
    expect(transport.opened).toHaveLength(2)
    transport.handlers.onOpen()
    expect(events).toEqual(['opened', 'lost', 'opened'])
  })

  it('closes a stalled connection and retries when the watchdog sees no activity', () => {
    const clock = createClock()
    const transport = createTransportSpy()
    const connection = createConnection({
      source: 'src',
      channel: 'bars',
      period: 'daily',
      adjustment: 'none',
      barAggregation: 'original',
      createTransport: transport.factory,
      scheduler: clock.scheduler,
      onEmpty: () => {},
    })
    connection.subscribe(barsRequest())
    transport.handlers.onOpen()
    // 心跳缺失：超过 45s 无帧即判定僵死。
    clock.advance(50_000)
    expect(connection.phase.peek()).toBe('backing-off')
    expect(transport.closed).toHaveLength(1)
  })

  it('resumes immediately instead of waiting for the backoff', () => {
    const clock = createClock()
    const transport = createTransportSpy()
    const connection = createConnection({
      source: 'src',
      channel: 'bars',
      period: 'daily',
      adjustment: 'none',
      barAggregation: 'original',
      createTransport: transport.factory,
      scheduler: clock.scheduler,
      onEmpty: () => {},
    })
    connection.subscribe(barsRequest())
    transport.handlers.onOpen()
    transport.handlers.onClose({ retryable: true, message: 'lost' })
    connection.resume()
    expect(transport.opened).toHaveLength(2)
  })

  it('rebuilds once when a second instrument joins in the same turn', async () => {
    const clock = createClock()
    const transport = createTransportSpy()
    const connection = createConnection({
      source: 'src',
      channel: 'bars',
      period: 'daily',
      adjustment: 'none',
      barAggregation: 'original',
      createTransport: transport.factory,
      scheduler: clock.scheduler,
      onEmpty: () => {},
    })
    connection.subscribe(barsRequest('A'))
    connection.subscribe(barsRequest('B'))
    await Promise.resolve()
    expect(transport.opened).toHaveLength(2)
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
    const transport = createTransportSpy()
    const hub = createStreamHub({
      createTransport: transport.factory,
      scheduler: clock.scheduler,
    })
    const first = hub.subscribe(requests[0]!)
    const second = hub.subscribe(requests[1]!)
    expect(transport.opened).toHaveLength(opened)
    second.close()
    expect(transport.closed).toHaveLength(closesAfterFirst)
    first.close()
    expect(transport.closed).toHaveLength(closesAfterBoth)
    hub.dispose()
  })

  it('rejects subscriptions after dispose', () => {
    const clock = createClock()
    const hub = createStreamHub({
      createTransport: createTransportSpy().factory,
      scheduler: clock.scheduler,
    })
    hub.dispose()
    expect(() => hub.subscribe(barsRequest())).toThrow('disposed')
  })
})
