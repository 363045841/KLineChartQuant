/** 回归：每个阶段的背景铺满时间跨度，直方图按「位置」参数贴边（默认左）。 */

import { readFileSync } from 'node:fs'
import { getRegisteredIndicatorDefinition } from '@363045841yyt/klinechart-core'
import { describe, expect, it, vi } from 'vitest'
import { NodeScriptWorker } from '../../../../script/src/worker/__tests__/nodeWorker.js'
import { createScriptService } from '../impl/createScriptService.js'

const MINUTE = 60_000
const DAY = 86_400_000

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

/**
 * 一个矩形在时间轴上的跨度。
 *
 * @param item 绘图对象
 * @returns 左端与右端时间
 */
function rangeOf(item: unknown) {
  const anchors = Reflect.get(item as object, 'anchors') as readonly { time: number }[]
  const times = anchors.map((anchor) => anchor.time)
  return { min: Math.min(...times), max: Math.max(...times) }
}

/**
 * 读取矩形的填充色，用于区分背景与直方图。
 *
 * @param item 绘图对象
 * @returns 填充色
 */
function fillOf(item: unknown) {
  const style = Reflect.get(item as object, 'style') as { fill?: string } | undefined
  return String(style?.fill ?? '')
}

describe('SVP 阶段背景与位置', () => {
  it('背景铺满整期，直方图按位置贴左', async () => {
    vi.stubGlobal('Worker', NodeScriptWorker)
    const source = readFileSync(new URL('../../../../script/scripts/svp.ts', import.meta.url), 'utf8')
    const service = await createScriptService([], {
      persistence: { load: async () => null, save: async () => true },
      builtinSources: [source],
    })
    const runtime = getRegisteredIndicatorDefinition('SVP')?.runtime
    if (!runtime) throw new Error('SVP 未注册')

    // 两天整的明细，最后一天是活动期。
    const start = Date.UTC(2026, 10, 13)
    const details = Array.from({ length: 2 * 1440 }, (_value, index) => {
      const close = 100 + Math.floor(index / 1440) * 10 + (index % 60) * 0.1
      return {
        time: start + index * MINUTE,
        open: close,
        high: close + 0.5,
        low: close - 0.5,
        close,
        volume: 10,
      }
    })
    const chartBars = Array.from({ length: 2 * 96 }, (_value, index) =>
      bar(start + index * 15 * MINUTE, 100 + Math.floor(index / 96) * 10),
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
        (item) => typeof item === 'object' && item !== null && Reflect.get(item, 'kind') === 'rectangle',
      )
      const backgroundFill = '@token:volumeProfile.boxBackground'
      const backgrounds = boxes.filter((item) => fillOf(item) === backgroundFill).map(rangeOf)
      const histogram = boxes.filter((item) => fillOf(item) !== backgroundFill).map(rangeOf)

      // 每一期恰好一块背景，且铺满该期的时间跨度。
      expect(backgrounds).toHaveLength(2)
      expect(backgrounds[0]).toEqual({ min: start, max: start + DAY })
      expect(backgrounds[1]!.min).toBe(start + DAY)

      // 直方图按「位置=左」贴住阶段起点，完成期与活动期同一规则。
      const firstDay = histogram.filter((range) => range.min < start + DAY)
      const secondDay = histogram.filter((range) => range.min >= start + DAY)
      expect(firstDay.length).toBeGreaterThan(0)
      expect(secondDay.length).toBeGreaterThan(0)
      expect(Math.min(...firstDay.map((range) => range.min))).toBe(start)
      expect(Math.min(...secondDay.map((range) => range.min))).toBe(start + DAY)
    } finally {
      service.dispose()
      vi.unstubAllGlobals()
    }
  }, 30_000)
})
