/**
 * Depth 数据链测试共享夹具：EventSource 替身、SSE 消息构造、DepthSource 与
 * HeatmapController 替身。
 * 仅供 __tests__ 消费；vitest 只收集 *.test.ts，本文件不会被当作测试。
 *
 * 约束：项目自有类型（DepthSource / HeatmapController）用 satisfies 全量约束；
 * EventSource 是 DOM 类型，替身无法结构化满足，唯一一处强转集中在本文件内。
 */
import type { Mock } from 'vitest'
import { vi } from 'vitest'

import type { HeatmapController, HeatmapState } from '@/components/orderBookHeatmap'
import type {
  DepthDelta,
  DepthSnapshot,
  DepthSource,
  DepthSourceStatus,
} from '@/data/depth/depthTypes'
import { createSignal } from '@/foundation/reactivity/signal'

/** 可手动驱动生命周期的 EventSource 替身。 */
export interface FakeEventSource {
  onopen: (() => void) | null
  onerror: ((e: unknown) => void) | null
  onmessage: ((event: { data: string }) => void) | null
  close: ReturnType<typeof vi.fn>
}

/** 构造可手动驱动的 EventSource 替身。 */
export function createFakeEventSource(): FakeEventSource {
  return {
    onopen: null,
    onerror: null,
    onmessage: null,
    close: vi.fn(),
  }
}

/** 把 EventSource 替身交给消费方；DOM 类型强转集中在此。 */
export function asEventSource(fake: FakeEventSource): EventSource {
  return fake as unknown as EventSource
}

/** 构造返回固定替身的 EventSource 工厂。 */
export function createEventSourceFactory(
  fake: FakeEventSource,
): Mock<(url: string) => EventSource> {
  return vi.fn<(url: string) => EventSource>(() => asEventSource(fake))
}

/** 构造 snapshot 消息的 `{ data }` 事件。 */
export function makeSnapshotEvent(
  bids: ReadonlyArray<readonly [number, number]>,
  asks: ReadonlyArray<readonly [number, number]>,
  timestamp: number,
): { data: string } {
  return { data: JSON.stringify({ type: 'snapshot', bids, asks, timestamp }) }
}

/** 构造 delta 消息的 `{ data }` 事件。 */
export function makeDeltaEvent(entries: ReadonlyArray<DepthDelta>): { data: string } {
  return { data: JSON.stringify({ type: 'delta', entries }) }
}

/** 可手动触发回调的 DepthSource 替身。 */
export interface FakeDepthSource extends DepthSource {
  triggerDelta: (deltas: ReadonlyArray<DepthDelta>) => void
  triggerSnapshot: (snapshot: DepthSnapshot) => void
  triggerError: (err: Error) => void
  triggerStatus: (status: DepthSourceStatus) => void
}

/** 构造可手动触发回调的 DepthSource 替身。 */
export function createFakeDepthSource(): FakeDepthSource {
  const deltaCallbacks: Array<(deltas: ReadonlyArray<DepthDelta>) => void> = []
  const snapshotCallbacks: Array<(snapshot: DepthSnapshot) => void> = []
  const errorCallbacks: Array<(err: Error) => void> = []
  const statusCallbacks: Array<(status: DepthSourceStatus) => void> = []

  /** 注册回调并返回移除函数。 */
  function subscribe<T>(callbacks: T[], callback: T): () => void {
    callbacks.push(callback)
    return () => {
      const index = callbacks.indexOf(callback)
      if (index >= 0) callbacks.splice(index, 1)
    }
  }

  return {
    exchange: 'test',
    symbol: 'test-symbol',
    onDelta: (cb) => subscribe(deltaCallbacks, cb),
    onSnapshot: (cb) => subscribe(snapshotCallbacks, cb),
    onError: (cb) => subscribe(errorCallbacks, cb),
    onStatus: (cb) => subscribe(statusCallbacks, cb),
    connect: vi.fn(),
    disconnect: vi.fn(),
    destroy: vi.fn(),
    triggerDelta: (deltas) => {
      for (const cb of deltaCallbacks) cb(deltas)
    },
    triggerSnapshot: (snapshot) => {
      for (const cb of snapshotCallbacks) cb(snapshot)
    },
    triggerError: (err) => {
      for (const cb of errorCallbacks) cb(err)
    },
    triggerStatus: (status) => {
      for (const cb of statusCallbacks) cb(status)
    },
  } satisfies FakeDepthSource
}

/** 记录 ingest/resetBook 调用的 HeatmapController 替身。 */
export interface FakeHeatmapController extends HeatmapController {
  calls: { ingest: DepthDelta[]; resetBook: DepthSnapshot[] }
}

/** 构造记录 ingest/resetBook 调用的 HeatmapController 替身。 */
export function createFakeHeatmapController(): FakeHeatmapController {
  const calls: { ingest: DepthDelta[]; resetBook: DepthSnapshot[] } = {
    ingest: [],
    resetBook: [],
  }
  return {
    state: createSignal<HeatmapState>({ latestSnapshot: null, snapshotCount: 0, deltaCount: 0 }),
    ingest: (delta) => {
      calls.ingest.push(delta)
    },
    ingestDelta: () => {},
    forceSnapshot: () => {},
    replay: () => [],
    resetBook: (snapshot) => {
      calls.resetBook.push(snapshot)
    },
    setConfig: () => {},
    dispose: vi.fn(),
    calls,
  } satisfies FakeHeatmapController
}
