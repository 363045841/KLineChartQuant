/** 回归：PVP 通过脚本服务的公开计算入口，在前置插入历史后仍能正常输出。 */

import { readFileSync } from 'node:fs'
import { getRegisteredIndicatorDefinition } from '@363045841yyt/klinechart-core'
import { describe, expect, it, vi } from 'vitest'
import { NodeScriptWorker } from '../../../../script/src/worker/__tests__/nodeWorker.js'
import { createScriptService } from '../impl/createScriptService.js'

describe('PVP service prepend', () => {
  it('computes PVP before and after a history prepend', async () => {
    vi.stubGlobal('Worker', NodeScriptWorker)
    const source = readFileSync(
      new URL('../../../../script/scripts/pvp.ts', import.meta.url),
      'utf8',
    )
    const service = await createScriptService([], {
      persistence: { load: async () => null, save: async () => true },
      builtinSources: [source],
    })
    const runtime = getRegisteredIndicatorDefinition('PVP')?.runtime
    if (!runtime) throw new Error('PVP not registered')
    const day = Date.UTC(2026, 0, 5)
    const bar = (time: number, close = 10) => ({
      timestamp: time,
      open: close,
      high: close + 1,
      low: close - 1,
      close,
      volume: 10,
    })
    const lower = [
      { time: day, open: 10, high: 11, low: 9, close: 10, volume: 10 },
      { time: day + 60_000, open: 10, high: 21, low: 19, close: 20, volume: 10 },
      { time: day + 86_400_000, open: 10, high: 41, low: 39, close: 40, volume: 10 },
      { time: day + 172_800_000, open: 10, high: 61, low: 59, close: 60, volume: 10 },
    ]
    const market = {
      symbol: 'TEST',
      time: {
        period: 'daily',
        session: {
          timeZone: 'UTC',
          sessions: [{ open: 0, close: 1440 }],
          tradingDays: [0, 1, 2, 3, 4, 5, 6],
        },
      },
      loadBars: async () => lower,
    }
    const config = { rowSize: 4, periodUnit: 'day' }
    try {
      const first = await runtime.compute(
        [bar(day + 86_400_000, 40), bar(day + 172_800_000, 60)],
        config,
        market,
      )
      expect(first).toMatchObject({
        plots: [],
        drawings: expect.arrayContaining([
          expect.objectContaining({ kind: 'rectangle' }),
          expect.objectContaining({
            kind: 'trend-line',
            anchors: expect.arrayContaining([expect.objectContaining({ time: day + 86_400_000 })]),
          }),
        ]),
      })
      const second = await runtime.compute(
        [bar(day, 30), bar(day + 86_400_000, 40), bar(day + 172_800_000, 60)],
        config,
        market,
      )
      expect(second).toMatchObject({
        plots: [],
        drawings: expect.arrayContaining([
          expect.objectContaining({
            kind: 'trend-line',
            anchors: expect.arrayContaining([expect.objectContaining({ time: day })]),
          }),
        ]),
      })
      const beforeTick = structuredClone(second)
      // 同一根 bar 实时更新
      const tick = await runtime.compute(
        [bar(day, 30), bar(day + 86_400_000, 40), bar(day + 172_800_000, 99)],
        config,
        market,
      )
      // 只有主图价格变化、低周期明细未变时，分布绘图应保持一致。
      expect(tick).toEqual(beforeTick)
      const beforePrepend = structuredClone(tick)
      // 低周期明细前置插入
      const older = { time: day - 86_400_000, open: 10, high: 11, low: 9, close: 10, volume: 10 }
      const prepended = await runtime.compute(
        [bar(day, 30), bar(day + 86_400_000, 40), bar(day + 172_800_000, 99)],
        config,
        { ...market, loadBars: async () => [older, ...lower] },
      )
      // 主图起点之前的明细不能混入已显示的分布。
      expect(prepended).toEqual(beforePrepend)
    } finally {
      service.dispose()
      vi.unstubAllGlobals()
    }
  }, 15_000)
})
