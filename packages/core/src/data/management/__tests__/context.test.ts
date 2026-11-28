// @vitest-environment jsdom
/** 行情宿主的注册、健康检查、异步失效策略与流所有权边界。 */
import { describe, expect, it, vi } from 'vitest'
import { searchInstruments } from '../../provider/instrumentSearch.js'
import { createBuiltinMarketDataContext } from '../../provider/impl/sources/createBuiltinContext.js'
import type { MarketDataProvider, SourceProbeResult } from '../../provider/types.js'
import { unavailableEventStream } from '../../stream/__tests__/helpers/eventStreamKit.js'
import type { StreamFrame, StreamTransportHandlers } from '../../stream/types.js'
import { MarketDataContext } from '../context.js'

/** 最小协议 Provider；只模拟场景涉及的字段边界。 */
function provider(
  id: string,
  probe: MarketDataProvider['probe'] = async () => ({ status: 'online', checkedAt: 1 }),
): MarketDataProvider {
  return {
    source: {
      id,
      displayName: id,
      connectionId: 'shared',
      defaultBaseUrl: 'http://localhost:8000',
    },
    probe,
    catalog: { search: vi.fn().mockResolvedValue([]) },
  }
}

/** 注册一个可观察的实时数据源，用于断言连接建立与关闭。 */
function registerStreamSource(context: MarketDataContext) {
  const transports: Array<StreamTransportHandlers & { closed: number }> = []
  context.registry.register({
    source: { id: 'one', displayName: 'one', defaultBaseUrl: 'http://localhost:8000' },
    probe: async () => ({ status: 'online', checkedAt: 1 }),
    stream: (_request, created) => {
      const transport = Object.assign(created, { closed: 0 })
      transports.push(transport)
      return {
        open() {},
        close() {
          transport.closed += 1
        },
      }
    },
  })
  return transports
}

/** 用统一替身装配内置源宿主；本文件不建立真实连接。 */
function createHost() {
  return createBuiltinMarketDataContext({
    fetchImpl: (input, init) => globalThis.fetch(input, init),
    openEventStream: unavailableEventStream,
  })
}

describe('MarketDataContext stream lifecycle', () => {
  it('routes transport frames to the subscription and closes on the last leave', () => {
    const context = new MarketDataContext()
    try {
      const transports = registerStreamSource(context)
      const frames: StreamFrame[] = []
      const handle = context.stream.subscribe({
        source: 'one',
        channel: 'quotes',
        instrumentId: 'A',
      })
      handle.onFrame((frame) => frames.push(frame))
      expect(transports).toHaveLength(1)
      transports[0]!.onFrame({
        seq: 0,
        ts: 0,
        type: 'quote',
        instrumentId: 'A',
        quote: { last: 1, prevClose: 1, timestamp: 0 },
      })
      expect(frames).toHaveLength(1)
      handle.close()
      expect(transports[0]!.closed).toBe(1)
    } finally {
      context.dispose()
    }
    expect(() =>
      context.stream.subscribe({ source: 'one', instrumentId: 'A', channel: 'quotes' }),
    ).toThrow('disposed')
  })

  it('resumes backing-off connections only when the host asks', () => {
    const context = new MarketDataContext()
    try {
      const transports = registerStreamSource(context)
      const handle = context.stream.subscribe({
        source: 'one',
        channel: 'quotes',
        instrumentId: 'A',
      })
      transports[0]!.onOpen()
      transports[0]!.onClose({ retryable: true, message: 'lost' })
      context.stream.resume()
      expect(transports).toHaveLength(2)
      handle.close()
    } finally {
      context.dispose()
    }
  })

  it('does not touch page lifecycle globals', () => {
    const documentAdd = vi.spyOn(document, 'addEventListener')
    const windowAdd = vi.spyOn(window, 'addEventListener')
    try {
      new MarketDataContext().dispose()
      expect(documentAdd).not.toHaveBeenCalled()
      expect(windowAdd).not.toHaveBeenCalled()
    } finally {
      documentAdd.mockRestore()
      windowAdd.mockRestore()
    }
  })
})

describe('MarketDataContext', () => {
  it('times out providers that ignore cancellation', async () => {
    vi.useFakeTimers()
    const context = new MarketDataContext()
    try {
      context.registry.register(provider('one', () => new Promise(() => {})))
      const pending = context.health.refresh()
      await vi.advanceTimersByTimeAsync(5000)
      await pending
      expect(context.health.state.peek().one?.status).toBe('offline')
    } finally {
      context.dispose()
      vi.useRealTimers()
    }
  })

  it('shares connection configuration within an instance and isolates hosts', () => {
    const first = createHost()
    const second = createHost()
    first.applyConnection('baostock-tradingview', 'http://localhost:9000')
    expect(first.registry.getConfig('baostock').baseUrl).toBe('http://localhost:9000')
    expect(first.registry.getConfig('tradingview').baseUrl).toBe('http://localhost:9000')
    expect(second.registry.getConfig('baostock').baseUrl).toBeUndefined()
    first.dispose()
    second.dispose()
  })

  it('applies search and route policy independently', async () => {
    const context = new MarketDataContext()
    const item = provider('one')
    context.registry.register(item)
    context.registry.setConfig('one', { enabled: false })
    await searchInstruments(context.registry, { keyword: 'test', limit: 10 })
    expect(item.catalog?.search).toHaveBeenCalledOnce()
    context.registry.setConfig('one', { enabled: true, searchEnabled: false })
    await searchInstruments(context.registry, { keyword: 'test', limit: 10 })
    expect(item.catalog?.search).toHaveBeenCalledOnce()
    expect(context.registry.getEnabled()).toEqual([item])
    context.dispose()
  })

  it('rejects incomplete URLs before changing configuration', () => {
    const context = new MarketDataContext()
    context.registry.register(provider('one'))
    expect(() => context.applyConnection('shared', 'http://')).toThrow()
    expect(context.registry.getConnection('one').version).toBe(0)
    context.dispose()
  })

  it('deduplicates simultaneous probes and ignores results from old connections', async () => {
    const context = new MarketDataContext()
    let resolveOld: ((result: SourceProbeResult) => void) | undefined
    const probe = vi
      .fn<MarketDataProvider['probe']>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve
          }),
      )
      .mockResolvedValue({ status: 'online', checkedAt: 2 })
    context.registry.register(provider('one', probe))
    const old = context.health.refresh()
    const duplicate = context.health.refresh()
    await Promise.resolve()
    expect(probe).toHaveBeenCalledOnce()
    context.applyConnection('shared', 'http://localhost:9000')
    await context.health.refresh()
    resolveOld?.({ status: 'offline', checkedAt: 1 })
    await Promise.all([old, duplicate])
    expect(context.health.state.peek().one?.status).toBe('online')
    expect(context.health.state.peek().one?.connectionVersion).toBe(1)
    context.dispose()
  })
})
