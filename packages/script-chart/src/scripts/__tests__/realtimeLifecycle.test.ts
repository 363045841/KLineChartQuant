/** 跨层验收：真实Worker、真实脚本和调度器在持续输入/慢速取数下保持独立生命周期。 */

import { getRegisteredIndicatorDefinition } from '@363045841yyt/klinechart-core'
import type { Bar } from '@363045841yyt/klinechart-plot-contracts'
import { describe, expect, it, vi } from 'vitest'
import {
  createTestData,
  createTestInstance,
  FakeCalculationSource,
} from '../../../../core/src/engine/indicators/__tests__/helpers/instanceTestKit.js'
import { createInlineIndicatorCalculationExecutor } from '../../../../core/src/engine/indicators/instances/execution/instanceCalculationExecutors.js'
import { createInstanceCalculationScheduler } from '../../../../core/src/engine/indicators/instances/execution/instanceCalculationScheduler.js'
import type { InstanceCalculationCommit } from '../../../../core/src/engine/indicators/instances/execution/types.js'
import { NodeScriptWorker } from '../../../../script/src/worker/__tests__/nodeWorker.js'
import { createScriptService } from '../impl/createScriptService.js'

describe('realtime script lifecycle', () => {
  it('keeps the same workers during continuous updates and renders fast output while history waits', async () => {
    let created = 0
    let terminated = 0
    class ObservedWorker extends NodeScriptWorker {
      constructor(url?: URL) {
        super(url)
        created++
      }
      override terminate(): void {
        terminated++
        super.terminate()
      }
    }
    vi.stubGlobal('Worker', ObservedWorker)
    const service = await createScriptService([], {
      persistence: { load: async () => null, save: async () => true },
      builtinSources: [
        `defineIndicator({name:'LifetimeSlow',position:Position.Main,onBar(){
        const values=request.security_lower_tf(syminfo.tickerid,Timeframe.Minute1,()=>volume);
        plot.Line(values.reduce((sum,value)=>sum+value,0),'volume');
      }})`,
        `defineIndicator({name:'LifetimeFast',position:Position.Sub,onBar(){plot.Line(close,'close')}})`,
      ],
    })
    const slow = getRegisteredIndicatorDefinition('LifetimeSlow')?.runtime
    const fast = getRegisteredIndicatorDefinition('LifetimeFast')?.runtime
    if (!slow || !fast) throw new Error('Missing registered runtimes')
    let finishHistory!: (bars: readonly Bar[]) => void
    const history = new Promise<readonly Bar[]>((resolve) => {
      finishHistory = resolve
    })
    const loadBars = vi.fn(() => history)
    const executor = createInlineIndicatorCalculationExecutor(
      [
        {
          definitionId: 'slow',
          compute: (data, _params, market) => slow.compute(data, {}, market),
        },
        {
          definitionId: 'fast',
          compute: (data, _params, market) => fast.compute(data, {}, market),
        },
      ],
      () => ({
        revision: 0,
        retain() {},
        context: () => ({
          symbol: 'TEST',
          time: { period: '5', session: { timeZone: 'UTC', sessions: [{ open: 0, close: 1440 }] } },
          loadBars,
        }),
      }),
    )
    const source = new FakeCalculationSource([
      createTestInstance({ instanceId: 'slow', definitionId: 'slow' }),
      createTestInstance({ instanceId: 'fast', definitionId: 'fast' }),
    ])
    const commits: InstanceCalculationCommit[] = []
    const loading = new Set<string>()
    const scheduler = createInstanceCalculationScheduler({
      pipeline: source,
      executor,
      onCommit: (commit) => commits.push(commit),
      onPending(ids, pending) {
        for (const id of ids) {
          if (pending) loading.add(id)
          else loading.delete(id)
        }
      },
    })
    const data = createTestData(5)
    const update = (revision: number) =>
      scheduler.compute({
        dataRevision: revision,
        data,
        timestamps: data.map((bar) => bar.timestamp),
      })
    try {
      const first = update(1)
      await vi.waitFor(() => expect(loadBars).toHaveBeenCalledOnce())
      await vi.waitFor(() => expect(commits.at(-1)!.pool.results.has('fast')).toBe(true))
      const workerCount = created
      expect(loading.has('slow')).toBe(true)
      const updates = Array.from({ length: 20 }, (_, index) => update(index + 2))
      expect(loadBars).toHaveBeenCalledOnce()
      expect(terminated).toBe(0)
      finishHistory(
        data.map(({ timestamp, ...bar }) => ({ time: timestamp, ...bar, volume: bar.volume ?? 0 })),
      )
      await Promise.all([first, ...updates])
      await vi.waitFor(() => expect(loading.size).toBe(0))
      for (let revision = 22; revision < 27; revision++) await update(revision)
      expect(terminated).toBe(0)
      expect(created).toBe(workerCount)
      expect(commits.at(-1)!.pool.results.get('slow')!.dataRevision).toBe(26)
    } finally {
      scheduler.dispose()
      executor.dispose()
      service.dispose()
      vi.unstubAllGlobals()
    }
  }, 15_000)
})
