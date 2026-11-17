/** 回归：SVP 的分组日界既接受脚本输入，也接受会话配置。 */

import { readFileSync } from 'node:fs'
import { getRegisteredIndicatorDefinition } from '@363045841yyt/klinechart-core'
import { describe, expect, it, vi } from 'vitest'
import { NodeScriptWorker } from '../../../../script/src/worker/__tests__/nodeWorker.js'
import { createScriptService } from '../impl/createScriptService.js'

const MINUTE = 60_000
const DAY = 86_400_000

/** 交易所配置的示例：UTC 全天，全周交易（加密永续就是这样）。 */
const EXCHANGE_SESSION = {
  timeZone: 'UTC',
  sessions: [{ open: 0, close: 1440 }],
  tradingDays: [0, 1, 2, 3, 4, 5, 6],
}

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
 * 列出每个分组的最早左边界（毫秒，升序去重）。
 *
 * @param drawings 脚本输出
 * @returns 分组起点
 */
function groupStarts(drawings: readonly unknown[]): number[] {
  const starts = new Set<number>()
  for (const item of drawings) {
    if (typeof item !== 'object' || item === null) continue
    if (Reflect.get(item, 'kind') !== 'rectangle') continue
    const anchors = Reflect.get(item, 'anchors') as readonly { time: number }[]
    starts.add(Math.min(...anchors.map((anchor) => anchor.time)))
  }
  return [...starts].sort((left, right) => left - right)
}

// 会话 dayBoundary 走 core 的 marketClock 测试：脚本执行器只消费 market.time，不读会话注册表。
describe('SVP 日界', () => {
  it('填入日界时区后按本地自然日分组', async () => {
    vi.stubGlobal('Worker', NodeScriptWorker)
    const source = readFileSync(new URL('../../../../script/scripts/svp.ts', import.meta.url), 'utf8')
    const service = await createScriptService([], {
      persistence: { load: async () => null, save: async () => true },
      builtinSources: [source],
    })
    const runtime = getRegisteredIndicatorDefinition('SVP')?.runtime
    if (!runtime) throw new Error('SVP 未注册')


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
    // 会话必须满足 ScriptMarketSession 契约：早期的 Record<string, unknown> 联合类型会让上下文失去类型约束。
    const market = (session: typeof EXCHANGE_SESSION) => ({
      symbol: 'TEST',
      optionUnderlying: null,
      time: { period: '15', session },
      loadBars: async () => details,
      loadOptionLevels: async () => [],
    })

    try {
      // 1. 默认：交易所日界（UTC 午夜）。
      const byExchange = await runtime.compute(chartBars, {}, market(EXCHANGE_SESSION))
      const exchangeStarts = groupStarts(
        (byExchange as { drawings?: readonly unknown[] }).drawings ?? [],
      )
      expect(exchangeStarts).toContain(start + DAY)

      // 2. 脚本输入：填时区后按该时区自然日。
      const byInput = await runtime.compute(chartBars, { dayZone: 'Asia/Shanghai' }, market(EXCHANGE_SESSION))
      const inputStarts = groupStarts((byInput as { drawings?: readonly unknown[] }).drawings ?? [])
      console.log("exchange", JSON.stringify(exchangeStarts.map((value) => new Date(value).toISOString())))
      console.log("input", JSON.stringify(inputStarts.map((value) => new Date(value).toISOString())))
      expect(inputStarts).toContain(start + 16 * 60 * MINUTE)
      expect(inputStarts).not.toContain(start + DAY)


    } finally {
      service.dispose()
      vi.unstubAllGlobals()
    }
  }, 30_000)
})
