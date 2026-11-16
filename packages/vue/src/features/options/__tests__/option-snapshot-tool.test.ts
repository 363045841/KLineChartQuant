// 期权工具的单元测试。
//
// 重点在三处容易静默出错的契约：标的解析（BTCUSDT 与 BTC 都要能进）、
// 省略参数时回落到图表品种、服务不可用时必须明确失败而不是编造关键位。

import { describe, expect, it } from 'vitest'
import {
  createOptionSnapshotTool,
  OPTION_SNAPSHOT_TOOL_NAME,
} from '../impl/option-snapshot-tool.js'
import type { OptionPanelSource } from '../types.js'
import { contentOf, toolContext } from './fixtures.js'

/** 更早一行采样的摘要字段。 */
interface OlderRow {
  readonly capturedAt: number
  readonly atmIv: number
  readonly putCall: number
}

/**
 * 造一份服务端原始响应。
 *
 * @param older 追加一条更早的采样，用于验证波动上下文
 * @returns 序列响应
 */
function seriesPayload(older?: OlderRow): unknown {
  const base = {
    currency: 'BTC',
    days: ['2026-11-14'],
    rows: [
      {
        currency: 'BTC',
        capturedAt: 1_764_000_000_000,
        spotIndex: 67_204.2,
        nearTerm: {
          gammaFlipUsd: 68_241.66,
          callWall: { strike: 69_000, openInterest: 299.7 },
          putWall: { strike: 67_000, openInterest: 328.3 },
          callGammaWall: { strike: 68_500, gammaWeight: 1.1e-5 },
          putGammaWall: { strike: 67_500, gammaWeight: 1.3e-5 },
          maxPainUsd: 68_500,
          netGexUsdPerPercent: -6_150_000,
          putCallOiRatio: 0.7,
          totalOpenInterest: 4837,
          contractCount: 30,
          expiryIso: '2026-11-15',
          dteDays: 0.83,
          atmIvPercent: 35.5,
          sigmaLowerUsd: 66_067.93,
          sigmaUpperUsd: 68_340.47,
          sigma2LowerUsd: 64_931.66,
          sigma2UpperUsd: 69_476.74,
        },
        allChain: {
          gammaFlipUsd: 71_805.09,
          callWall: { strike: 80_000, openInterest: 11_293 },
          putWall: { strike: 60_000, openInterest: 9_874 },
          callGammaWall: { strike: 73_000, gammaWeight: 2.1e-4 },
          putGammaWall: { strike: 68_000, gammaWeight: 1.9e-4 },
          maxPainUsd: 75_000,
          netGexUsdPerPercent: -106_150_000,
          putCallOiRatio: 0.74,
          totalOpenInterest: 280_648,
          contractCount: 87,
        },
        gammaFlip: { gammaFlipUsd: 68_241.66, source: 'near-term' },
      },
    ],
  }
  if (older === undefined) return base
  const olderRow = {
    currency: 'BTC',
    capturedAt: older.capturedAt,
    nearTerm: { atmIvPercent: older.atmIv, putCallOiRatio: older.putCall },
  }
  return { ...base, rows: [olderRow, ...base.rows] }
}

/**
 * 造一个记录调用的假数据源。
 *
 * @param payload 序列返回值；省略时返回正常序列
 * @param statsPayload 统计返回值；省略时返回正常统计
 * @returns 数据源与调用记录
 */
function fakeSource(
  payload?: unknown,
  statsPayload?: unknown,
): {
  source: OptionPanelSource
  calls: string[]
  limits: Array<number | undefined>
  statsCalls: Array<string | undefined>
} {
  const calls: string[] = []
  const limits: Array<number | undefined> = []
  const statsCalls: Array<string | undefined> = []
  return {
    calls,
    limits,
    statsCalls,
    source: {
      async fetchSeries(currency: string, _signal?: AbortSignal, limit?: number): Promise<unknown> {
        calls.push(currency)
        limits.push(limit)
        if (payload instanceof Error) throw payload
        return payload ?? seriesPayload()
      },
      async fetchStats(currency: string, windows?: readonly number[]): Promise<unknown> {
        statsCalls.push(windows === undefined ? currency : `${currency}:${windows.join(',')}`)
        if (statsPayload instanceof Error) throw statsPayload
        return statsPayload ?? statsPayloadOf()
      },
    },
  }
}

/**
 * 造一份统计响应。
 *
 * @returns 统计响应原文
 */
function statsPayloadOf(): unknown {
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
    ],
  }
}

describe('createOptionSnapshotTool', () => {
  it('文本报告带上关键位、波动与持仓分项', async () => {
    const { source, calls } = fakeSource()
    const tool = createOptionSnapshotTool(source, () => 'BTC')

    const result = await tool.execute({}, toolContext())
    const text = contentOf(result)

    expect(calls).toEqual(['BTC'])
    expect(text).toContain('Gamma 翻转 68,241.66')
    expect(text).toContain('近月：翻转 68,241.66')
    expect(text).toContain('Call 墙 68,500（Γ 加权）/ 69,000（OI 299.7）')
    expect(text).toContain('Put 墙 67,500（Γ 加权）/ 67,000（OI 328.3）')
    expect(text).toContain('全链：翻转 71,805.09')
    expect(text).toContain('ATM IV 35.5%')
    expect(text).toContain('DTE 0.83 天')
    expect(text).toContain('±1σ 66,067.93–68,340.47')
    expect(text).toContain('全链 P/C 0.74')
  })

  it('文本报告带上整段序列的波动上下文', async () => {
    const payload = seriesPayload({ capturedAt: 1_763_913_600_000, atmIv: 30, putCall: 1.2 })
    const fake = fakeSource(payload)
    const tool = createOptionSnapshotTool(fake.source, () => 'BTC')

    const result = await tool.execute({}, toolContext())
    const text = result.content

    // 面板只取一行；工具要取整段，服务端上限 5000。
    expect(fake.limits).toEqual([5000])

    expect(text).toContain('波动上下文：近 1.0 天 2 个采样')
    expect(text).toContain('ATM IV 30.0%–35.5%（现 35.5%，分位 100%）')
    expect(text).toContain('P/C 0.70–1.20（现 0.70）')
    expect(text).toContain('IV 24h +5.50pp | P/C 24h -0.500')
  })

  it('文本报告带上长窗口分位与样本天数', async () => {
    const fake = fakeSource()
    const tool = createOptionSnapshotTool(fake.source, () => 'BTC')

    const text = contentOf(await tool.execute({}, toolContext()))

    // 不传窗口：默认窗口由服务端定义，客户端不复制这份口径。
    expect(fake.statsCalls).toEqual(['BTC'])
    expect(text).toContain('历史分位：30 天 IVR 68 / IVP 83（样本 6/30 天）')
    expect(text).toContain('RV20 43.2%')
    expect(text).toContain('VRP +3.4pp')
  })

  it('统计服务失败时只缺分位一行，关键位照常返回', async () => {
    const fake = fakeSource(undefined, new Error('connect ECONNREFUSED 127.0.0.1:8093'))
    const tool = createOptionSnapshotTool(fake.source, () => 'BTC')

    const text = contentOf(await tool.execute({}, toolContext()))

    expect(text).toContain('Gamma 翻转 68,241.66')
    expect(text).toContain('历史分位：统计不可用。')
  })

  it('json 格式返回结构化快照', async () => {
    const { source } = fakeSource()
    const tool = createOptionSnapshotTool(source, () => 'BTC')

    const text = contentOf(await tool.execute({ format: 'json' }, toolContext()))
    const parsed: unknown = JSON.parse(text)

    expect(typeof parsed).toBe('object')
    expect(text).toContain('"gammaFlipUsd":68241.66')
    expect(text).toContain('"putCallOiRatio":0.7')
    expect(text).toContain('"volatility":{"source":"daily"')
  })

  it('显式传品种代码时走映射表，直接传标的时按大写使用', async () => {
    const first = fakeSource()
    const toolA = createOptionSnapshotTool(first.source, () => null)
    await toolA.execute({ currency: 'ETHUSDT.P' }, toolContext())
    expect(first.calls).toEqual(['ETH'])

    const second = fakeSource()
    const toolB = createOptionSnapshotTool(second.source, () => null)
    await toolB.execute({ currency: 'eth' }, toolContext())
    expect(second.calls).toEqual(['ETH'])
  })

  it('省略 currency 时回落到图表的期权标的', async () => {
    const { source, calls } = fakeSource()
    const tool = createOptionSnapshotTool(source, () => 'ETH')

    await tool.execute({}, toolContext())

    expect(calls).toEqual(['ETH'])
  })

  it('拿不到标的时给出去哪找数据源的提示', async () => {
    const { source, calls } = fakeSource()
    const tool = createOptionSnapshotTool(source, () => null)

    const text = contentOf(await tool.execute({}, toolContext()))

    expect(calls).toEqual([])
    expect(text).toContain('没有可用的期权标的')
  })

  it('服务有响应但没有数据行时明确说明，不给数字', async () => {
    const { source } = fakeSource({ rows: [] })
    const tool = createOptionSnapshotTool(source, () => 'BTC')

    const text = contentOf(await tool.execute({}, toolContext()))

    expect(text).toContain('没有取到 BTC 的期权快照')
    expect(text).not.toContain('Gamma 翻转')
  })

  it('请求失败时返回 failure，不编造关键位', async () => {
    const { source } = fakeSource(new Error('connect ECONNREFUSED 127.0.0.1:8093'))
    const tool = createOptionSnapshotTool(source, () => 'BTC')

    const result = await tool.execute({}, toolContext())
    const text = contentOf(result)
    const failure =
      typeof result === 'object' && result !== null ? Reflect.get(result, 'failure') : undefined

    expect(text).toContain('读取期权关键位失败')
    expect(text).toContain('ECONNREFUSED')
    expect(failure).toMatchObject({ code: 'TOOL_ERROR', retryable: true })
  })

  it('工具名与元数据保持一致', () => {
    expect(OPTION_SNAPSHOT_TOOL_NAME).toBe('option_snapshot')
    const tool = createOptionSnapshotTool(fakeSource().source, () => 'BTC')
    expect(tool.name).toBe('option_snapshot')
    expect(tool.safety).toBe('read-only')
  })
})
