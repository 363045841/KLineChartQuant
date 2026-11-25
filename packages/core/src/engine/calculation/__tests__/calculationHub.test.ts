/**
 * 计算中枢：去重、latest-wins、修订校验、零任务提交与预览缓存。
 */
import { describe, expect, it, vi } from 'vitest'

import type { KLineData } from '@/foundation/types/price.js'
import {
  type CalculationCommit,
  type CalculationDefinition,
  type CalculationHub,
  type CalculationRequest,
  createCalculationHub,
  createDataIdentity,
  createFeedKey,
  type FeedKey,
  type FeedSnapshot,
} from '../index.js'

const IDENTITY = createDataIdentity({
  source: 'test',
  instrument: 'TEST',
  defaultPeriod: '1',
  defaultAdjustment: 'none',
})
const FEED: FeedKey = createFeedKey(IDENTITY)

const BARS: readonly KLineData[] = [
  { timestamp: 1, open: 1, high: 2, low: 1, close: 2, volume: 10 },
  { timestamp: 2, open: 2, high: 3, low: 2, close: 3, volume: 20 },
]

/** 一份行情快照；只改修订号时数据保持不变。 */
function feed(dataRevision: number): FeedSnapshot {
  return {
    identity: IDENTITY,
    dataRevision,
    marketRevision: 0,
    timestamps: BARS.map((bar) => bar.timestamp),
    data: BARS,
    change: { start: 0, end: BARS.length },
  }
}

/** 单请求计划；请求键固定为 ma。 */
function plan(key = 'ma'): { feed: FeedKey; requests: readonly CalculationRequest[] } {
  return {
    feed: FEED,
    requests: [{ key, definitionId: 'ma', inputs: {}, context: {} }],
  }
}

/** 构造可计算定义；返回值即序列内容。 */
function definition(
  compute: CalculationDefinition['compute'],
  definitionId = 'ma',
): CalculationDefinition {
  return { definitionId, dependency: { kind: 'stateful' }, compute }
}

/** 创建可手动完成的 Promise，用于观察并发与排队。 */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

/** 收集消费者提交，便于断言提交次数与版本。 */
function collect() {
  const commits: CalculationCommit[] = []
  return {
    commits,
    handlers: {
      onCommit(commit: CalculationCommit) {
        commits.push(commit)
      },
    },
  }
}

describe('calculation hub', () => {
  it('shares one calculation between consumers with the same identity', async () => {
    let calls = 0
    const hub: CalculationHub = createCalculationHub({
      resolveDefinition: () =>
        definition(async () => {
          calls++
          return { series: calls }
        }),
    })
    const first = collect()
    const second = collect()
    const a = hub.createClient('a', first.handlers)
    const b = hub.createClient('b', second.handlers)
    hub.updateFeed(feed(1))
    a.setPlan([plan()])
    b.setPlan([plan()])

    await vi.waitFor(() => {
      expect(first.commits).toHaveLength(1)
      expect(second.commits).toHaveLength(1)
    })
    expect(calls).toBe(1)
    expect(first.commits[0]!.results.get('ma')?.series).toBe(1)
    expect(second.commits[0]!.results.get('ma')?.series).toBe(1)
    hub.dispose()
  })

  it('commits every feed revision even when the plan has no requests', async () => {
    const hub = createCalculationHub({ resolveDefinition: () => undefined })
    const sink = collect()
    const client = hub.createClient('sink', sink.handlers)
    client.setPlan([{ feed: FEED, requests: [] }])

    hub.updateFeed(feed(1))
    await vi.waitFor(() => expect(sink.commits).toHaveLength(1))
    hub.updateFeed(feed(2))
    await vi.waitFor(() => expect(sink.commits).toHaveLength(2))

    expect(sink.commits.map((commit) => commit.dataRevision)).toEqual([1, 2])
    expect(sink.commits[1]!.results.size).toBe(0)
    hub.dispose()
  })

  it('keeps only the newest revision waiting and commits the newest result', async () => {
    const gate = deferred<{ series: number }>()
    let startRevision = 0
    const hub = createCalculationHub({
      resolveDefinition: () =>
        definition(async (_data, _inputs, _market, _range) => {
          startRevision = 1
          return gate.promise
        }),
    })
    const sink = collect()
    const client = hub.createClient('a', sink.handlers)
    hub.updateFeed(feed(1))
    client.setPlan([plan()])
    await vi.waitFor(() => expect(startRevision).toBe(1))

    hub.updateFeed(feed(2))
    gate.resolve({ series: 1 })

    await vi.waitFor(() => expect(hub.get(FEED, 'ma')?.dataRevision).toBe(2))
    expect(sink.commits.at(-1)?.dataRevision).toBe(2)
    expect(sink.commits.every((commit) => commit.dataRevision === 2)).toBe(true)
    hub.dispose()
  })

  it('does not recompute an unchanged revision and recomputes after definition invalidation', async () => {
    let calls = 0
    const hub = createCalculationHub({
      resolveDefinition: () =>
        definition(async () => {
          calls++
          return { series: calls }
        }),
    })
    const sink = collect()
    const client = hub.createClient('a', sink.handlers)
    hub.updateFeed(feed(1))
    client.setPlan([plan()])
    await vi.waitFor(() => expect(sink.commits).toHaveLength(1))

    hub.updateFeed(feed(1))
    await vi.waitFor(() => expect(sink.commits.length).toBeGreaterThanOrEqual(1))
    expect(calls).toBe(1)

    hub.invalidateDefinitions(['ma'])
    await vi.waitFor(() => expect(sink.commits.at(-1)?.results.get('ma')?.series).toBe(2))
    expect(calls).toBe(2)
    hub.dispose()
  })

  it('carries script events in the result and reports pending owners', async () => {
    const pending: Array<readonly [readonly string[], boolean]> = []
    const hub = createCalculationHub({
      resolveDefinition: () =>
        definition(async () => ({
          series: 0,
          events: [{ kind: 'alert', message: 'cross', time: 1, barIndex: 0, price: 2, live: true }],
        })),
    })
    const sink = collect()
    const client = hub.createClient('a', {
      ...sink.handlers,
      onPending(owners, value) {
        pending.push([owners, value])
      },
    })
    hub.updateFeed(feed(1))
    client.setPlan([
      {
        feed: FEED,
        requests: [
          { key: 'ma', definitionId: 'ma', inputs: {}, context: {}, owners: ['i1'] },
        ],
      },
    ])

    await vi.waitFor(() => expect(sink.commits).toHaveLength(1))
    const result = sink.commits[0]!.results.get('ma')!
    expect(result.events).toHaveLength(1)
    expect(pending).toEqual([
      [['i1'], true],
      [['i1'], false],
    ])
    hub.dispose()
  })

  it('drops results and recomputes after the feed is removed', async () => {
    let calls = 0
    const hub = createCalculationHub({
      resolveDefinition: () =>
        definition(async () => {
          calls++
          return { series: calls }
        }),
    })
    const sink = collect()
    const client = hub.createClient('a', sink.handlers)
    hub.updateFeed(feed(1))
    client.setPlan([plan()])
    await vi.waitFor(() => expect(sink.commits).toHaveLength(1))

    hub.removeFeed(FEED)
    expect(hub.get(FEED, 'ma')).toBeUndefined()
    hub.updateFeed(feed(2))
    client.setPlan([plan()])
    await vi.waitFor(() => expect(sink.commits.at(-1)?.dataRevision).toBe(2))
    expect(calls).toBe(2)
    hub.dispose()
  })

  it('returns cached preview results without joining a consumer plan', async () => {
    let calls = 0
    const hub = createCalculationHub({
      resolveDefinition: () =>
        definition(async () => {
          calls++
          return { series: calls }
        }),
    })
    hub.updateFeed(feed(1))
    const request: CalculationRequest = {
      key: 'ma',
      definitionId: 'ma',
      inputs: {},
      context: {},
    }
    const signal = new AbortController().signal
    const first = await hub.submit(FEED, request, signal)
    const second = await hub.submit(FEED, request, signal)
    expect(first.series).toBe(1)
    expect(second.series).toBe(1)
    expect(calls).toBe(1)
    hub.dispose()
  })
})
