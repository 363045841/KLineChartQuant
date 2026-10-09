/**
 * Depth 数据链测试共享夹具：DepthSource 与 HeatmapController 替身。
 * 仅供 __tests__ 消费；vitest 只收集 *.test.ts，本文件不会被当作测试。
 */
import { vi } from 'vitest'

import type { HeatmapController, HeatmapState } from '@/components/orderBookHeatmap'
import type { DepthDelta, DepthSnapshot, DepthSource } from '@/data/depth/types'
import { createSignal } from '@/foundation/reactivity/signal'

/** 可手动触发回调的 DepthSource 替身。 */
export interface FakeDepthSource extends DepthSource {
  triggerDelta: (deltas: ReadonlyArray<DepthDelta>) => void
  triggerSnapshot: (snapshot: DepthSnapshot) => void
  triggerError: (err: Error) => void
}

/** 构造可手动触发回调的 DepthSource 替身。 */
export function createFakeDepthSource(): FakeDepthSource {
  const deltaCallbacks: Array<(deltas: ReadonlyArray<DepthDelta>) => void> = []
  const snapshotCallbacks: Array<(snapshot: DepthSnapshot) => void> = []
  const errorCallbacks: Array<(err: Error) => void> = []

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
    onStatus: () => () => {},
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
