/** 公开注册入口贯通真实缓存与行情运行时：分页、流帧、连接事件与取消边界。 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MockDataDependenciesOptions } from '../../../engine/data/__tests__/helpers/chartDataManagerTestKit.js'
import {
  createTestChartDataManager,
  createTestDocument,
  makeKLine,
} from '../../../engine/data/__tests__/helpers/chartDataManagerTestKit.js'
import type { StreamFrame, StreamTransportHandlers } from '../../stream/types.js'
import { MarketDataContext } from '../../management/context.js'
import { createDataSourceFixture } from './helpers/providerTestKit.js'

/** 当前打开的流；用例直接驱动传输的打开、帧与关闭。 */
type OpenStream = StreamTransportHandlers

/** 各场景共用来源、真实管理器与唯一资源释放操作。 */
function setup(realtime = true, options: MockDataDependenciesOptions = {}) {
  const bars = [100, 200, 300].map((timestamp) => makeKLine(timestamp))
  const fixture = createDataSourceFixture(bars, realtime)
  const host = new MarketDataContext()
  const unregister = host.registerDataSource(fixture.source)
  const { manager, scrollTo } = createTestChartDataManager(createTestDocument(), {
    marketDataProviderRegistry: host.registry,
    streamHub: host.stream,
    viewport: { scrollLeft: 800 },
    ...options,
  })
  /** 选择稳定品种，经解析后的标准身份进入既有取数链路。 */
  async function select(id: string) {
    const instrument = await host.resolveInstrument('test', id)
    manager.setPrimaryMarket({ instrument, period: 'daily' })
    await vi.waitFor(() => {
      expect(manager.getData()).toHaveLength(3)
      expect(manager.dataBuffer.loading.peek()).toBe(false)
    })
    return instrument
  }
  /** 最新打开的流；没有打开时抛错，避免用例静默等待。 */
  function stream(): OpenStream {
    const current = [...fixture.streams].at(-1)
    if (current === undefined) throw new Error('No stream is open')
    return current
  }
  let seq = 0
  /** 构造一根帧；序号与时间由用例侧递增，保持协议合法。 */
  function frame(bar: import('@/controllers/types.js').KLineData): StreamFrame {
    return {
      seq: seq++,
      ts: bar.timestamp,
      type: 'bar',
      instrumentId: 'A',
      state: 'forming',
      bar,
    }
  }
  return {
    fixture,
    bars,
    host,
    unregister,
    manager,
    select,
    scrollTo,
    stream,
    frame,
    dispose() {
      manager.destroy()
      host.dispose()
    },
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('registered data source', () => {
  it('pages history through the provider and validates ordering', async () => {
    const harness = setup(false)
    try {
      const instrument = await harness.select('A')
      expect(harness.fixture.requests).toHaveLength(1)
      const request = {
        instrument,
        period: 'daily' as const,
        adjustment: 'none' as const,
        barAggregation: 'original' as const,
        limit: 3,
      }
      await expect(
        harness.host.registry.getRequired('test').bars!.fetch(request),
      ).resolves.toMatchObject({
        instrumentId: instrument.id,
        data: [{ timestamp: 100 }, { timestamp: 200 }, { timestamp: 300 }],
      })
      harness.fixture.source.bars.fetch = async () => ({
        bars: [makeKLine(200), makeKLine(100)],
        olderData: 'exhausted',
      })
      await expect(
        harness.host.registry.getRequired('test').bars!.fetch(request),
      ).rejects.toThrow('ordered, unique')
    } finally {
      harness.dispose()
    }
  })

  it('writes stream frames to the buffer and caches them', async () => {
    const harness = setup()
    const { fixture, bars, manager } = harness
    try {
      await harness.select('A')
      const stream = harness.stream()
      const fetches = fixture.requests.length
      const updated = { ...bars[2]!, close: bars[2]!.close + 1, high: bars[2]!.high + 1 }
      stream.onFrame(harness.frame(updated))
      expect(manager.getData()).toHaveLength(3)
      expect(manager.getData()[2]?.close).toBe(updated.close)

      stream.onFrame(harness.frame({ ...updated, timestamp: 400 }))
      expect(manager.getData()).toHaveLength(4)
      expect(fixture.requests).toHaveLength(fetches)
      expect(manager.dataBuffer.lastError.peek()).toBeNull()
    } finally {
      harness.dispose()
    }
  })

  it('surfaces lost streams and resyncs after a reconnect', async () => {
    const harness = setup()
    const { fixture, manager } = harness
    try {
      await harness.select('A')
      const first = harness.stream()
      const fetches = fixture.requests.length
      first.onClose({ retryable: true, message: 'network down' })
      expect(manager.dataError.peek()).toContain('network down')

      // 退避结束后打开新连接；重连事件触发一次历史补拉。
      await vi.waitFor(() => expect(fixture.streams.size).toBe(1), { timeout: 5_000 })
      const resumed = harness.stream()
      resumed.onOpen()
      resumed.onFrame(harness.frame({ ...harness.bars[2]!, close: 321 }))
      expect(manager.dataError.peek()).toBeNull()
      await vi.waitFor(() => expect(fixture.requests.length).toBeGreaterThan(fetches))
      await vi.waitFor(() => expect(manager.getData().at(-1)?.close).toBe(321))

      resumed.onClose({ retryable: false, message: 'permanent failure' })
      expect(manager.dataError.peek()).toContain('permanent failure')
    } finally {
      harness.dispose()
    }
  })

  it('closes the old stream when the instrument changes and on unregister', async () => {
    const harness = setup()
    const { manager } = harness
    try {
      await harness.select('A')
      const first = harness.stream()
      await harness.select('B')
      // 旧流的迟到帧不能写入新序列。
      const before = manager.getData()
      first.onFrame(harness.frame({ ...harness.bars[0]!, close: 999 }))
      expect(manager.getData()).toEqual(before)

      harness.unregister()
      await vi.waitFor(() => expect(harness.host.registry.get('test')).toBeUndefined())
    } finally {
      harness.dispose()
    }
  })

  it('accepts historical-only sources without opening a stream', async () => {
    const harness = setup(false)
    try {
      await harness.select('A')
      expect(harness.fixture.streams.size).toBe(0)
      expect(harness.host.registry.get('test')?.stream).toBeUndefined()
    } finally {
      harness.dispose()
    }
  })

  it('keeps the old window when a resync fails and clears the error on the next resync', async () => {
    const harness = setup()
    const { fixture, manager, bars } = harness
    try {
      await harness.select('A')
      const stream = harness.stream()
      fixture.source.bars.fetch = async () => {
        throw new Error('Resync unavailable')
      }
      stream.onClose({ retryable: true, message: 'lost' })
      await vi.waitFor(() => expect(manager.dataError.peek()).toContain('Resync unavailable'), {
        timeout: 5_000,
      })
      expect(manager.dataBuffer.loading.peek()).toBe(false)
      // 补拉失败时保留旧窗口，不能把增量接到旧尾部留下空洞。
      expect(manager.getData().map((bar) => bar.timestamp)).toEqual(
        bars.map((bar) => bar.timestamp),
      )
    } finally {
      harness.dispose()
    }
  })
})
