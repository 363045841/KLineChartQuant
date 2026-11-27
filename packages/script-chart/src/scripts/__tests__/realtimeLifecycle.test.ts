/**
 * 跨层验收：真实 Worker、真实脚本与计算中枢在持续输入/慢速取数下保持独立生命周期。
 */

import {
  type CalculationDefinition,
  type CalculationHub,
  createCalculationHub,
  createDataIdentity,
  createFeedKey,
  type FeedKey,
  type FeedSnapshot,
} from '../../../../core/src/engine/calculation/index.js'
import type { Bar } from '@363045841yyt/klinechart-plot-contracts'
import { describe, expect, it, vi } from 'vitest'
import { createTestData } from '../../../../core/src/engine/indicators/__tests__/helpers/instanceTestKit.js'
import { createDefinitionRegistry } from '@363045841yyt/klinechart-core'
import { createScriptWorkerPool, fromEventTarget } from '@363045841yyt/klinechart-script/worker'
import type { ScriptWorkerPoolFactory } from '@363045841yyt/klinechart-script/worker'
import { NodeScriptWorker } from '../../../../script/src/worker/__tests__/nodeWorker.js'
import { createScriptService } from '../impl/createScriptService.js'

const IDENTITY = createDataIdentity({
  source: 'test',
  instrument: 'TEST',
  defaultPeriod: '5',
  defaultAdjustment: 'none',
})

/** 断言脚本运行端口存在；缺失直接失败，不提供替身。 */
function requireRuntime(definitions: ReturnType<typeof createDefinitionRegistry>, id: string) {
  const runtime = definitions.getDefinition(id)?.runtime
  if (!runtime) throw new Error(`Missing registered runtime: ${id}`)
  return runtime
}

/** 把脚本运行端口包装成计算输出。 */
function definitionOf(id: string, runtime: ReturnType<typeof requireRuntime>): CalculationDefinition {
  const compute = runtime.compute
  return {
    definitionId: id,
    identity: runtime,
    dependency: { kind: 'stateful' },
    compute,
    ...(runtime.createCompute
      ? {
          createCompute: () => {
            const inner = runtime.createCompute!()
            return Object.assign(
              async (...args: Parameters<typeof inner>) => ({ series: await inner(...args) }),
              { dispose: () => inner.dispose?.() },
            )
          },
        }
      : {}),
  }
}

describe('realtime script lifecycle', () => {
  it('keeps the same workers during continuous updates and renders fast output while history waits', async () => {
    let created = 0
    let terminated = 0
    class ObservedWorker extends NodeScriptWorker {
      private readonly calculationWorker: boolean
      constructor(url?: URL) {
        super(url)
        this.calculationWorker = !url?.pathname.includes('compiler.worker')
        if (this.calculationWorker) created++
      }
      override terminate(): void {
        if (this.calculationWorker) terminated++
        super.terminate()
      }
    }
    // 执行线程与编译线程都跑真实产物，只统计执行线程的创建与终止。
    const pool: ScriptWorkerPoolFactory = (runtime) =>
      createScriptWorkerPool({
        ...runtime,
        size: 2,
        createThread: () => fromEventTarget(new ObservedWorker()),
        createCompilerThread: () =>
          fromEventTarget(new ObservedWorker(new URL('compiler.worker.js', import.meta.url))),
      })
    const registry = createDefinitionRegistry()
    const service = await createScriptService([], {
      definitions: registry,
      persistence: { load: async () => null, save: async () => true },
      createWorkerPool: pool,
      bindRendering: null,
      builtinSources: [
        `defineIndicator({ version: 2,name:'LifetimeSlow',position:Position.main,onBar(){
        const values=request.securityLowerTf(syminfo.tickerId,Timeframe.minute1,()=>volume);
        plot.Line(values.reduce((sum,value)=>sum+value,0),'volume');
      }})`,
        `defineIndicator({ version: 2,name:'LifetimeFast',position:Position.sub,onBar(){plot.Line(close,'close')}})`,
      ],
    })
    let finishHistory!: (bars: readonly Bar[]) => void
    const history = new Promise<readonly Bar[]>((resolve) => {
      finishHistory = resolve
    })
    const loadBars = vi.fn(() => history)
    const definitions = new Map<string, CalculationDefinition>([
      ['slow', definitionOf('slow', requireRuntime(registry, 'LifetimeSlow'))],
      ['fast', definitionOf('fast', requireRuntime(registry, 'LifetimeFast'))],
    ])
    const hub: CalculationHub = createCalculationHub({
      resolveDefinition: (id) => definitions.get(id),
      marketData: () => ({
        revision: 0,
        retain() {},
        context: () => ({
          symbol: 'TEST',
          time: { period: '5', session: { timeZone: 'UTC', sessions: [{ open: 0, close: 1440 }] } },
          loadBars,
        }),
      }),
    })
    const feedKey: FeedKey = createFeedKey(IDENTITY)
    const loading = new Set<string>()
    const commits: { revision: number; keys: string[] }[] = []
    const client = hub.createClient('test', {
      onCommit: (commit) => {
        commits.push({ revision: commit.dataRevision, keys: [...commit.results.keys()] })
      },
      onPending(owners, pending) {
        for (const id of owners) {
          if (pending) loading.add(id)
          else loading.delete(id)
        }
      },
    })
    const data = createTestData(5)
    const timestamps = data.map((bar) => bar.timestamp)
    const snapshot = (dataRevision: number): FeedSnapshot => ({
      identity: IDENTITY,
      dataRevision,
      marketRevision: 0,
      data,
      timestamps,
      change: { start: 0, end: data.length },
      live: true,
    })
    client.setPlan([
      {
        feed: feedKey,
        requests: [
          { key: 'slow', definitionId: 'slow', inputs: {}, context: {}, owners: ['slow'] },
          { key: 'fast', definitionId: 'fast', inputs: {}, context: {}, owners: ['fast'] },
        ],
      },
    ])
    const update = (revision: number) => hub.updateFeed(snapshot(revision))
    try {
      update(1)
      await vi.waitFor(() => expect(loadBars).toHaveBeenCalledOnce())
      await vi.waitFor(() => expect(hub.peek(feedKey, 'fast')).toBeDefined())
      const workerCount = created
      expect(loading.has('slow')).toBe(true)
      for (let revision = 2; revision <= 21; revision++) update(revision)
      expect(loadBars).toHaveBeenCalledOnce()
      expect(terminated).toBe(0)
      finishHistory(
        data.map(({ timestamp, ...bar }) => ({ time: timestamp, ...bar, volume: bar.volume ?? 0 })),
      )
      await vi.waitFor(() => expect(loading.size).toBe(0))
      for (let revision = 22; revision < 27; revision++) update(revision)
      await vi.waitFor(() => expect(commits.at(-1)?.revision).toBe(26))
      expect(terminated).toBe(0)
      expect(created).toBe(workerCount)
    } finally {
      client.dispose()
      hub.dispose()
      service.dispose()
      vi.unstubAllGlobals()
    }
  })
})

