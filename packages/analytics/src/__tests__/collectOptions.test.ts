/**
 * 期权采集编排单元测试：用替身 Deribit 客户端验证落盘、读回校验与幂等。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { collectOptionCurrencies } from '../options/impl/collect'
import type { DeribitClient, OptionChainRecord } from '../options/types'
import { createDayShardStore } from '../storage/impl/dayShardStore'
import { createTempDir, makeContract, removeTempDir } from './testUtils'

/** 采集时刻：2026-11-10T00:00:00Z。 */
const CAPTURED_AT = Date.UTC(2026, 10, 10, 0, 0, 0)

/** 到期时刻：2026-11-11T08:00:00Z。 */
const EXPIRY = Date.UTC(2026, 10, 11, 8, 0, 0)

/** 固定返回的小规模链。 */
const CONTRACTS = [
  makeContract({ strike: 90, optionType: 'put', openInterest: 10, expiryMs: EXPIRY }),
  makeContract({ strike: 110, optionType: 'call', openInterest: 10, expiryMs: EXPIRY }),
]

/** 替身客户端：不触网，返回固定链与固定指数价。 */
const FAKE_CLIENT: DeribitClient = {
  getOptionChain: async () => ({ contracts: CONTRACTS, elapsedMs: 3 }),
  getIndexPrice: async () => ({
    indexPrice: 100,
    estimatedDeliveryPrice: 100,
    elapsedMs: 2,
  }),
}

describe('collectOptionCurrencies', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      removeTempDir(dir)
    }
  })

  it('落盘聚合位与原始链，并通过读回校验', async () => {
    const dir = createTempDir()
    dirs.push(dir)
    const store = createDayShardStore(dir)

    const results = await collectOptionCurrencies({
      client: FAKE_CLIENT,
      store,
      currencies: ['BTC'],
      persistChain: true,
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

  it('同一时刻重复采集不产生重复行', async () => {
    const dir = createTempDir()
    dirs.push(dir)
    const store = createDayShardStore(dir)
    const request = {
      client: FAKE_CLIENT,
      store,
      currencies: ['BTC'] as const,
      persistChain: true,
      now: () => CAPTURED_AT,
    }

    await collectOptionCurrencies(request)
    const second = await collectOptionCurrencies(request)

    expect(second[0].aggregateAppend.appended).toBe(0)
    expect(second[0].aggregateAppend.skipped).toBe(1)
    expect(store.listDays('options/chain/BTC')).toEqual(['2026-11-10'])
  })
})
