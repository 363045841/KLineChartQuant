/**
 * 期权采集编排单元测试：用替身 Deribit 客户端验证落盘、采样门、读回校验与幂等。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { collectOptionCurrencies } from '../options/impl/collect'
import type { OptionChainRecord, OptionVenueSource } from '../options/types'
import { createDayShardStore } from '../storage/impl/dayShardStore'
import { createTempDir, makeContract, removeTempDir } from './testUtils'

/** 采集时刻：2026-11-10T00:00:00Z，落在间隔 5 分钟的采样分钟上。 */
const CAPTURED_AT = Date.UTC(2026, 10, 10, 0, 0, 0)

/** 采样分钟之外的时刻：2026-11-10T00:01:00Z。 */
const OFF_MINUTE_AT = CAPTURED_AT + 60_000

/** 到期时刻：2026-11-11T08:00:00Z。 */
const EXPIRY = Date.UTC(2026, 10, 11, 8, 0, 0)

/** 固定返回的小规模链。 */
const CONTRACTS = [
  makeContract({ strike: 90, optionType: 'put', openInterest: 10, expiryMs: EXPIRY }),
  makeContract({ strike: 110, optionType: 'call', openInterest: 10, expiryMs: EXPIRY }),
]

/** 替身数据源：不触网，返回固定链与固定指数价。 */
const FAKE_SOURCE: OptionVenueSource = {
  getOptionChain: async () => ({ contracts: CONTRACTS, elapsedMs: 3 }),
  getIndexPrice: async () => ({ indexPrice: 100, elapsedMs: 2 }),
}

/** 两个场所都指到同一份替身，路由差异不是本文件的测试目标。 */
const FAKE_SOURCES = { deribit: FAKE_SOURCE, binance: FAKE_SOURCE }

/**
 * 逐次前进的时钟替身：第 n 次调用返回 `start + n * stepMs`。
 *
 * 一轮里 `now()` 先被采样门取一次，再被每个标的取一次，用它模拟「轮次跨分钟」。
 *
 * @param start 首次取值
 * @param stepMs 每次调用前进的毫秒数
 * @returns 时钟
 */
function steppingClock(start: number, stepMs: number): () => number {
  let calls = 0
  return () => {
    const value = start + calls * stepMs
    calls += 1
    return value
  }
}

describe('collectOptionCurrencies', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      removeTempDir(dir)
    }
  })

  it('采样分钟落盘聚合位与原始链，并通过读回校验', async () => {
    const dir = createTempDir()
    dirs.push(dir)
    const store = createDayShardStore(dir)

    const results = await collectOptionCurrencies({
      sources: FAKE_SOURCES,
      store,
      currencies: ['BTC'],
      chainEveryMinutes: 5,
      now: () => CAPTURED_AT,
    })

    expect(results).toHaveLength(1)
    const result = results[0]
    expect(result.readBackVerified).toBe(true)
    expect(result.aggregateAppend.appended).toBe(1)
    expect(result.chainAppend?.appended).toBe(2)
    expect(result.snapshot.chainContractCount).toBe(2)
    expect(result.snapshot.filteredContractCount).toBe(2)

    expect(store.listDays('options/aggregate/BTC')).toEqual(['2026-11-10'])
    const chainRows = store.read<OptionChainRecord>({
      stream: 'options/chain/BTC',
      day: '2026-11-10',
    })
    expect(chainRows).toHaveLength(2)
    expect(chainRows[0].currency).toBe('BTC')
    expect(chainRows[0].capturedAt).toBe(CAPTURED_AT)
  })

  it('不在采样分钟的轮次只写聚合位', async () => {
    const dir = createTempDir()
    dirs.push(dir)
    const store = createDayShardStore(dir)

    const results = await collectOptionCurrencies({
      sources: FAKE_SOURCES,
      store,
      currencies: ['BTC'],
      chainEveryMinutes: 5,
      now: () => OFF_MINUTE_AT,
    })

    expect(results[0].aggregateAppend.appended).toBe(1)
    expect(results[0].chainAppend).toBeNull()
    expect(store.listDays('options/chain/BTC')).toEqual([])
    expect(store.listDays('options/aggregate/BTC')).toEqual(['2026-11-10'])
  })

  it('未开启落链时不写原始链', async () => {
    const dir = createTempDir()
    dirs.push(dir)
    const store = createDayShardStore(dir)

    const results = await collectOptionCurrencies({
      sources: FAKE_SOURCES,
      store,
      currencies: ['BTC'],
      chainEveryMinutes: null,
      now: () => CAPTURED_AT,
    })

    expect(results[0].aggregateAppend.appended).toBe(1)
    expect(results[0].chainAppend).toBeNull()
    expect(store.listDays('options/chain/BTC')).toEqual([])
  })

  it('轮次起点不在采样分钟：即使后续标的跨进采样分钟，整轮都不落链', async () => {
    const dir = createTempDir()
    dirs.push(dir)
    const store = createDayShardStore(dir)

    // 轮次起点 00:04:59，BTC 到 00:05:04、ETH 到 00:05:09，都已在采样分钟内。
    const results = await collectOptionCurrencies({
      sources: FAKE_SOURCES,
      store,
      currencies: ['BTC', 'ETH'],
      chainEveryMinutes: 5,
      now: steppingClock(CAPTURED_AT + 4 * 60_000 + 59_000, 5_000),
    })

    expect(results.map((result) => result.chainAppend)).toEqual([null, null])
    expect(store.listDays('options/chain/BTC')).toEqual([])
    expect(store.listDays('options/chain/ETH')).toEqual([])
  })

  it('轮次起点在采样分钟：后续标的跨出采样分钟也照整轮落链', async () => {
    const dir = createTempDir()
    dirs.push(dir)
    const store = createDayShardStore(dir)

    // 轮次起点 00:05:00，BTC 到 00:06:10、ETH 到 00:07:20，都已离开采样分钟。
    const results = await collectOptionCurrencies({
      sources: FAKE_SOURCES,
      store,
      currencies: ['BTC', 'ETH'],
      chainEveryMinutes: 5,
      now: steppingClock(CAPTURED_AT + 5 * 60_000, 70_000),
    })

    expect(results.map((result) => result.chainAppend?.appended)).toEqual([2, 2])
    expect(store.listDays('options/chain/BTC')).toEqual(['2026-11-10'])
    expect(store.listDays('options/chain/ETH')).toEqual(['2026-11-10'])
  })

  it('同一时刻重复采集不产生重复行', async () => {
    const dir = createTempDir()
    dirs.push(dir)
    const store = createDayShardStore(dir)
    const request = {
      sources: FAKE_SOURCES,
      store,
      currencies: ['BTC'] as const,
      chainEveryMinutes: 5,
      now: () => CAPTURED_AT,
    }

    await collectOptionCurrencies(request)
    const second = await collectOptionCurrencies(request)

    expect(second[0].aggregateAppend.appended).toBe(0)
    expect(second[0].aggregateAppend.skipped).toBe(1)
    expect(store.listDays('options/chain/BTC')).toEqual(['2026-11-10'])
  })
})
