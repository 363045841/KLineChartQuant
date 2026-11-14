/** 回归：活动期的直方图右端跟随最新明细，而不是停在阶段开盘后的宽度处。 */

import { readFileSync } from 'node:fs'
import { getRegisteredIndicatorDefinition } from '@363045841yyt/klinechart-core'
import { describe, expect, it, vi } from 'vitest'
import { NodeScriptWorker } from '../../../../script/src/worker/__tests__/nodeWorker.js'
import { createScriptService } from '../impl/createScriptService.js'

const MINUTE = 60_000

/**
 * 造一根 K 线。
 *
 * @param timestamp 起始毫秒
 * @param close 收盘价
 * @returns K 线
 */
function bar(timestamp: number, close: number) {
  return { timestamp, open: close, high: close + 1, low: close - 1, close, volume: 10 }
}

describe('SVP 活动期锚点', () => {
  it('直方图右端贴着最新明细，不再缩在阶段开盘处', async () => {
    vi.stubGlobal('Worker', NodeScriptWorker)
    const source = readFileSync(new URL('../../../../script/scripts/svp.ts', import.meta.url), 'utf8')
    const service = await createScriptService([], {
      persistence: { load: async () => null, save: async () => true },
      builtinSources: [source],
    })
    const runtime = getRegisteredIndicatorDefinition('SVP')?.runtime
    if (!runtime) throw new Error('SVP 未注册')

    // 一天里跑 12 小时，明细到最后一分钟。
    const start = Date.UTC(2026, 10, 13)
    const hours = 12
    const details = Array.from({ length: hours * 60 }, (_value, index) => {
      const close = 100 + (index % 120) * 0.1
      return {
        time: start + index * MINUTE,
        open: close,
        high: close + 0.5,
        low: close - 0.5,
        close,
        volume: 10,
      }
    })
    const chartBars = Array.from({ length: hours * 4 }, (_value, index) =>
      bar(start + index * 15 * MINUTE, 100),
    )
    const market = {
      symbol: 'TEST',
      optionUnderlying: null,
      time: { period: '15', session: { timeZone: 'UTC', sessions: [{ open: 0, close: 1440 }] } },
      loadBars: async () => details,
      loadOptionLevels: async () => [],
    }

    try {
      const result = await runtime.compute(chartBars, {}, market)
      const drawings = ((result as { drawings?: readonly unknown[] }).drawings ?? []) as readonly unknown[]
      const boxes = drawings.filter(
        (item) =>
          typeof item === 'object' &&
          item !== null &&
          Reflect.get(item, 'kind') === 'rectangle',
      )
      const ranges = boxes.map((item) => {
        const anchors = Reflect.get(item as object, 'anchors') as readonly { time: number }[]
        const times = anchors.map((anchor) => anchor.time)
        return { min: Math.min(...times), max: Math.max(...times) }
      })
      const latest = Math.max(...ranges.map((range) => range.max))
      const lastDetailEnd = details[details.length - 1]!.time + MINUTE
      // 右端贴住最新明细（容差一分钟）。
      expect(Math.abs(latest - lastDetailEnd)).toBeLessThanOrEqual(MINUTE)
      // 活动期的块不再从阶段开盘起：至少有一个块左端明显晚于开盘。
      expect(ranges.some((range) => range.min > start + 60 * MINUTE)).toBe(true)
    } finally {
      service.dispose()
      vi.unstubAllGlobals()
    }
  }, 30_000)
})
