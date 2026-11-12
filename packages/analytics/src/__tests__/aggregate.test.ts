/**
 * 期权链聚合单元测试。
 *
 * 用固定的小规模链验证口径：过滤规则、墙位、最大痛点、净 GEX 符号、翻转位与 ±1σ。
 * 数值全部可按手算复核，不依赖外部数据。
 */
import { describe, expect, it } from 'vitest'
import { ANALYTICS_ERROR_CODES } from '../errors'
import { aggregateOptionChain } from '../options/impl/aggregate'
import { expectAnalyticsError, makeContract } from './testUtils'

/** 采集时刻：2026-11-10T00:00:00Z。 */
const CAPTURED_AT = Date.UTC(2026, 10, 10, 0, 0, 0)

/** 近月到期（DTE ≈ 1.33 天）。 */
const NEAR_EXPIRY = Date.UTC(2026, 10, 11, 8, 0, 0)

/** 次月到期（DTE ≈ 30.33 天）。 */
const MID_EXPIRY = Date.UTC(2026, 11, 10, 8, 0, 0)

/** 远期到期（DTE > 90 天，应被过滤）。 */
const FAR_EXPIRY = Date.UTC(2027, 1, 20, 8, 0, 0)

/**
 * 构造一个到期日的四张合约：put 90（OI 200）、call 100（OI 50）、put 100（OI 50）、call 110（OI 100）。
 *
 * @param expiryMs 到期时刻
 * @returns 合约列表
 */
function chainPerExpiry(expiryMs: number) {
  return [
    makeContract({ strike: 90, optionType: 'put', openInterest: 200, expiryMs }),
    makeContract({ strike: 100, optionType: 'call', openInterest: 50, expiryMs }),
    makeContract({ strike: 100, optionType: 'put', openInterest: 50, expiryMs }),
    makeContract({ strike: 110, optionType: 'call', openInterest: 100, expiryMs }),
  ]
}

describe('aggregateOptionChain', () => {
  const contracts = [
    ...chainPerExpiry(NEAR_EXPIRY),
    ...chainPerExpiry(MID_EXPIRY),
    makeContract({ strike: 100, optionType: 'call', openInterest: 9999, expiryMs: FAR_EXPIRY }),
  ]
  const snapshot = aggregateOptionChain({
    currency: 'BTC',
    contracts,
    spotIndex: 100,
    capturedAt: CAPTURED_AT,
  })

  it('只统计 0 < DTE <= 90 的合约', () => {
    expect(snapshot.chainContractCount).toBe(9)
    expect(snapshot.filteredContractCount).toBe(8)
  })

  it('Call 墙与 Put 墙取该方向未平仓量最大的行权价', () => {
    expect(snapshot.callWall).toEqual({ strike: 110, openInterest: 200 })
    expect(snapshot.putWall).toEqual({ strike: 90, openInterest: 400 })
  })

  it('最大痛点取到期赔付总额最小的行权价', () => {
    expect(snapshot.maxPainUsd).toBe(100)
  })

  it('净 GEX 为负：put 未平仓量占优', () => {
    expect(snapshot.netGexUsdPerPercent).toBeLessThan(0)
  })

  it('近月平值 IV 与剩余天数', () => {
    expect(snapshot.nearTermExpiryIso).toBe('2026-11-11')
    expect(snapshot.nearTermDteDays).toBeCloseTo(32 / 24, 10)
    expect(snapshot.nearTermAtmIvPercent).toBeCloseTo(50, 10)
  })

  it('±1σ 由近月 ATM IV 与剩余天数推出', () => {
    const expectedMove =
      snapshot.spotIndex *
      (snapshot.nearTermAtmIvPercent / 100) *
      Math.sqrt(snapshot.nearTermDteDays / 365)
    expect(snapshot.expectedMoveOneSigmaUsd).toBeCloseTo(expectedMove, 10)
    expect(snapshot.sigmaLowerUsd).toBeCloseTo(snapshot.spotIndex - expectedMove, 10)
    expect(snapshot.sigmaUpperUsd).toBeCloseTo(snapshot.spotIndex + expectedMove, 10)
  })

  it('来源时刻取全部合约 creation_timestamp 的最大值', () => {
    expect(snapshot.sourceTimestamp).toBe(Date.UTC(2026, 10, 10, 0, 0, 0))
  })

  it('累计净 GEX 未穿越零轴时翻转位为 null', () => {
    expect(snapshot.gammaFlipUsd).toBeNull()
  })
})

describe('aggregateOptionChain 边界', () => {
  it('DTE 恰好为 0 的合约被过滤', () => {
    const snapshot = aggregateOptionChain({
      currency: 'BTC',
      contracts: [
        makeContract({
          strike: 100,
          optionType: 'call',
          openInterest: 9999,
          expiryMs: CAPTURED_AT,
        }),
        makeContract({ strike: 100, optionType: 'call', openInterest: 10, expiryMs: NEAR_EXPIRY }),
        makeContract({ strike: 100, optionType: 'put', openInterest: 10, expiryMs: NEAR_EXPIRY }),
      ],
      spotIndex: 100,
      capturedAt: CAPTURED_AT,
    })
    expect(snapshot.chainContractCount).toBe(3)
    expect(snapshot.filteredContractCount).toBe(2)
    expect(snapshot.callWall).toEqual({ strike: 100, openInterest: 10 })
  })

  it('累计净 GEX 由负转正时给出翻转位', () => {
    const snapshot = aggregateOptionChain({
      currency: 'BTC',
      contracts: [
        makeContract({ strike: 90, optionType: 'put', openInterest: 1, expiryMs: NEAR_EXPIRY }),
        makeContract({
          strike: 110,
          optionType: 'call',
          openInterest: 1000,
          expiryMs: NEAR_EXPIRY,
        }),
      ],
      spotIndex: 100,
      capturedAt: CAPTURED_AT,
    })
    expect(snapshot.gammaFlipUsd).not.toBeNull()
    expect(snapshot.gammaFlipUsd ?? 0).toBeGreaterThan(90)
    expect(snapshot.gammaFlipUsd ?? 0).toBeLessThan(110)
  })

  it('零持仓合约不参与统计', () => {
    const snapshot = aggregateOptionChain({
      currency: 'BTC',
      contracts: [
        makeContract({ strike: 100, optionType: 'call', openInterest: 10, expiryMs: NEAR_EXPIRY }),
        makeContract({ strike: 100, optionType: 'put', openInterest: 10, expiryMs: NEAR_EXPIRY }),
        makeContract({ strike: 100, optionType: 'call', openInterest: 0, expiryMs: NEAR_EXPIRY }),
      ],
      spotIndex: 100,
      capturedAt: CAPTURED_AT,
    })
    expect(snapshot.chainContractCount).toBe(3)
    expect(snapshot.filteredContractCount).toBe(2)
  })

  it('过滤后没有合约时抛错', () => {
    expectAnalyticsError(
      () =>
        aggregateOptionChain({
          currency: 'BTC',
          contracts: [
            makeContract({
              strike: 100,
              optionType: 'call',
              openInterest: 10,
              expiryMs: FAR_EXPIRY,
            }),
          ],
          spotIndex: 100,
          capturedAt: CAPTURED_AT,
        }),
      ANALYTICS_ERROR_CODES.AGGREGATE_EMPTY,
    )
  })

  it('现货指数非正时抛错', () => {
    expectAnalyticsError(
      () =>
        aggregateOptionChain({
          currency: 'BTC',
          contracts: chainPerExpiry(NEAR_EXPIRY),
          spotIndex: 0,
          capturedAt: CAPTURED_AT,
        }),
      ANALYTICS_ERROR_CODES.AGGREGATE_INPUT_INVALID,
    )
  })
})
