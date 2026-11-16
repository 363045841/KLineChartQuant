// 期权的「波动统计」工具单元测试。
//
// 重点在三条：默认窗口由服务端决定（客户端不复制口径）、缺口要写明原因（不补 0）、
// 拿不到统计时不许用分钟级样本冒充长窗口结论。

import { describe, expect, it } from 'vitest'
import {
  createOptionVolatilityQueryTool,
  OPTION_VOLATILITY_QUERY_TOOL_NAME,
} from '../impl/option-volatility-query.js'
import type { OptionPanelSource } from '../types.js'
import { contentOf, toolContext } from './fixtures.js'

/**
 * 造一份统计响应；只给断言需要的字段。
 *
 * @param overrides 覆盖项
 * @returns 统计响应原文
 */
function statsPayload(overrides: Record<string, unknown> = {}): unknown {
  return {
    currency: 'BTC',
    source: 'daily',
    stale: false,
    latestCapturedAt: 1_764_000_000_000,
    rv20: 43.2,
    vrp: 3.4,
    termStructure: null,
    skew25dVolPoints: null,
    windows: [
      {
        windowDays: 30,
        sampleDays: 6,
        expectedDays: 30,
        ivLatest: 51.6,
        ivHigh: 55.1,
        ivLow: 44,
        ivRank: 68.47,
        ivPercentile: 83.33,
      },
      {
        windowDays: 365,
        sampleDays: 6,
        expectedDays: 365,
        ivLatest: 51.6,
        ivHigh: 61.82,
        ivLow: 30.32,
        ivRank: null,
        ivPercentile: null,
      },
    ],
    ...overrides,
  }
}

/**
 * 造一个只记录统计请求的假数据源。
 *
 * @param payload 统计返回值
 * @returns 数据源与窗口调用记录
 */
function fakeSource(payload: unknown): {
  source: OptionPanelSource
  windows: Array<string | undefined>
} {
  const windows: Array<string | undefined> = []
  return {
    windows,
    source: {
      async fetchSeries(): Promise<unknown> {
        throw new Error('本工具不应该请求序列')
      },
      async fetchStats(currency: string, requested?: readonly number[]): Promise<unknown> {
        windows.push(requested === undefined ? currency : `${currency}:${requested.join(',')}`)
        if (payload instanceof Error) throw payload
        return payload
      },
    },
  }
}

describe('createOptionVolatilityQueryTool', () => {
  it('默认窗口交给服务端，报告写明每个窗口的样本天数', async () => {
    const fake = fakeSource(statsPayload())
    const tool = createOptionVolatilityQueryTool(fake.source, () => 'BTC')

    const text = contentOf(await tool.execute({}, toolContext()))

    expect(fake.windows).toEqual(['BTC'])
    expect(text).toContain('日行样本')
    expect(text).toContain('30 天：IV Rank 68.5 | IV Percentile 83.3')
    expect(text).toContain('样本 6/30 天')
    expect(text).toContain('365 天：分位不可用（样本 6/365 天；至少需要 5 个样本日）')
    expect(text).toContain('RV20：43.2%')
    expect(text).toContain('VRP：+3.4pp')
  })

  it('缺失的指标写明原因，不用估计值顶替', async () => {
    const fake = fakeSource(statsPayload({ rv20: null, vrp: null }))
    const tool = createOptionVolatilityQueryTool(fake.source, () => 'BTC')

    const text = contentOf(await tool.execute({}, toolContext()))

    expect(text).toContain('RV20：不可用（日收盘不足 21 个）')
    expect(text).toContain('VRP：不可用（缺 RV20）')
    expect(text).toContain('期限结构：不可用（最新样本行没有逐到期 IV）')
    expect(text).toContain('25Δ 风险逆转：不可用（没有 7 天以上的到期，或缺 25Δ 两翼）')
  })

  it('期限结构与 25Δ 偏斜按到期日逐项给出', async () => {
    const fake = fakeSource(
      statsPayload({
        termStructure: [
          { expiryIso: '2026-11-20', dteDays: 4, atmIvPercent: 46.2 },
          { expiryIso: '2026-12-25', dteDays: 38.8, atmIvPercent: 38.25 },
        ],
        skew25dVolPoints: -5.07,
        skew25dExpiryIso: '2026-12-25',
      }),
    )
    const tool = createOptionVolatilityQueryTool(fake.source, () => 'BTC')

    const text = contentOf(await tool.execute({}, toolContext()))

    expect(text).toContain('期限结构：2026-11-20 4.0d 46.2% · 2026-12-25 38.8d 38.3%')
    expect(text).toContain('25Δ 风险逆转：-5.1pp（2026-12-25）')
  })

  it('自定义窗口按请求顺序透传', async () => {
    const fake = fakeSource(statsPayload())
    const tool = createOptionVolatilityQueryTool(fake.source, () => 'ETH')

    await tool.execute({ currency: 'ETHUSDT', windows: [180, 7, 180] }, toolContext())

    expect(fake.windows).toEqual(['ETH:180,7'])
  })

  it('窗口参数非法时直接说明，不发请求', async () => {
    const fake = fakeSource(statsPayload())
    const tool = createOptionVolatilityQueryTool(fake.source, () => 'BTC')

    const text = contentOf(await tool.execute({ windows: [0, 4000] }, toolContext()))

    expect(fake.windows).toEqual([])
    expect(text).toContain('windows 需要')
  })

  it('统计结构不符时说明缺口，不编造分位', async () => {
    const fake = fakeSource({ currency: 'BTC' })
    const tool = createOptionVolatilityQueryTool(fake.source, () => 'BTC')

    const text = contentOf(await tool.execute({}, toolContext()))

    expect(text).toContain('没有取到 BTC 的波动统计')
    expect(text).not.toContain('IV Rank')
  })

  it('服务失败时返回 failure 而不是数字', async () => {
    const fake = fakeSource(new Error('connect ECONNREFUSED 127.0.0.1:8093'))
    const tool = createOptionVolatilityQueryTool(fake.source, () => 'BTC')

    const result = await tool.execute({}, toolContext())
    const failure =
      typeof result === 'object' && result !== null ? Reflect.get(result, 'failure') : undefined

    expect(contentOf(result)).toContain('读取期权波动统计失败')
    expect(failure).toMatchObject({ code: 'TOOL_ERROR', retryable: true })
  })

  it('json 格式返回结构化统计', async () => {
    const fake = fakeSource(statsPayload())
    const tool = createOptionVolatilityQueryTool(fake.source, () => 'BTC')

    const text = contentOf(await tool.execute({ format: 'json' }, toolContext()))

    expect(text).toContain('"source":"daily"')
    expect(text).toContain('"sampleDays":6')
  })

  it('工具名与元数据保持一致', () => {
    expect(OPTION_VOLATILITY_QUERY_TOOL_NAME).toBe('option_volatility_query')
    const tool = createOptionVolatilityQueryTool(fakeSource(statsPayload()).source, () => 'BTC')
    expect(tool.name).toBe('option_volatility_query')
    expect(tool.safety).toBe('read-only')
  })
})
