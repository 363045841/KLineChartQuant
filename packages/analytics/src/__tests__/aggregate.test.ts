/**
 * 期权链聚合单元测试。
 *
 * 用固定的小规模链验证口径：过滤规则、近月与全链两套关键位、P/C 比、±1σ/±2σ 与翻转位兜底。
 * 数值全部可按手算复核，不依赖外部数据。
 */
import { describe, expect, it } from 'vitest'
import { ANALYTICS_ERROR_CODES } from '../errors'
import { aggregateOptionChain, interpolateIvAtDelta } from '../options/impl/aggregate'
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
    venue: 'deribit',
    contracts,
    spotIndex: 100,
    capturedAt: CAPTURED_AT,
  })

  it('只统计 0 < DTE <= 90 的合约', () => {
    expect(snapshot.chainContractCount).toBe(9)
    expect(snapshot.filteredContractCount).toBe(8)
  })

  it('全链的 Call 墙与 Put 墙合并所有到期日', () => {
    expect(snapshot.allChain.callWall).toEqual({ strike: 110, openInterest: 200 })
    expect(snapshot.allChain.putWall).toEqual({ strike: 90, openInterest: 400 })
  })

  it('近月的墙位只看最近一个到期日', () => {
    expect(snapshot.nearTerm.callWall).toEqual({ strike: 110, openInterest: 100 })
    expect(snapshot.nearTerm.putWall).toEqual({ strike: 90, openInterest: 200 })
  })

  it('最大痛点按各视图自己的到期日计算', () => {
    expect(snapshot.nearTerm.maxPainUsd).toBe(100)
    expect(snapshot.allChain.maxPainUsd).toBe(100)
  })

  it('净 GEX 按各视图自己的合约计算', () => {
    // 近月只有 put 90 与 call 110 两个行权价，call 110 更接近平值、gamma 更大，净 GEX 为正。
    expect(snapshot.nearTerm.netGexUsdPerPercent).toBeGreaterThan(0)
    expect(Number.isFinite(snapshot.allChain.netGexUsdPerPercent)).toBe(true)
  })

  it('P/C 未平仓量比按各视图自己的持仓计算', () => {
    // 近月：put 250 / call 150。
    expect(snapshot.nearTerm.putCallOiRatio).toBeCloseTo(250 / 150, 10)
    // 全链：put 500 / call 300。
    expect(snapshot.allChain.putCallOiRatio).toBeCloseTo(500 / 300, 10)
    expect(snapshot.nearTerm.totalOpenInterest).toBe(400)
    expect(snapshot.allChain.totalOpenInterest).toBe(800)
  })

  it('近月平值 IV 与剩余天数', () => {
    expect(snapshot.nearTerm.expiryIso).toBe('2026-11-11')
    expect(snapshot.nearTerm.dteDays).toBeCloseTo(32 / 24, 10)
    expect(snapshot.nearTerm.atmIvPercent).toBeCloseTo(50, 10)
  })

  it('±1σ 与 ±2σ 由近月 ATM IV 与剩余天数推出', () => {
    const expectedMove =
      snapshot.spotIndex *
      (snapshot.nearTerm.atmIvPercent / 100) *
      Math.sqrt(snapshot.nearTerm.dteDays / 365)
    expect(snapshot.nearTerm.expectedMoveOneSigmaUsd).toBeCloseTo(expectedMove, 10)
    expect(snapshot.nearTerm.sigmaLowerUsd).toBeCloseTo(snapshot.spotIndex - expectedMove, 10)
    expect(snapshot.nearTerm.sigmaUpperUsd).toBeCloseTo(snapshot.spotIndex + expectedMove, 10)
    expect(snapshot.nearTerm.expectedMoveTwoSigmaUsd).toBeCloseTo(expectedMove * 2, 10)
    expect(snapshot.nearTerm.sigma2LowerUsd).toBeCloseTo(snapshot.spotIndex - expectedMove * 2, 10)
    expect(snapshot.nearTerm.sigma2UpperUsd).toBeCloseTo(snapshot.spotIndex + expectedMove * 2, 10)
  })

  it('来源时刻取全部合约 creation_timestamp 的最大值', () => {
    expect(snapshot.sourceTimestamp).toBe(Date.UTC(2026, 10, 10, 0, 0, 0))
  })

  it('主图翻转位遵循近月优先、全链兜底的规则', () => {
    const nearTermFlip = snapshot.nearTerm.gammaFlipUsd
    const allChainFlip = snapshot.allChain.gammaFlipUsd
    expect(snapshot.gammaFlip.gammaFlipUsd).toBe(nearTermFlip ?? allChainFlip)
    expect(snapshot.gammaFlip.source).toBe(nearTermFlip === null ? 'all-chain' : 'near-term')
  })
})

describe('aggregateOptionChain 翻转位', () => {
  it('净 GEX 在现价网格内过零时给出翻转位', () => {
    const snapshot = aggregateOptionChain({
      currency: 'BTC',
      venue: 'deribit',
      contracts: [
        // 单一到期日，put 与 call 关于现价对称：低候选价由 put 压制、高候选价由 call 压制，
        // 中间必有一次过零，插值结果落在现价附近。
        makeContract({ strike: 80, optionType: 'put', openInterest: 10000, expiryMs: MID_EXPIRY }),
        makeContract({
          strike: 120,
          optionType: 'call',
          openInterest: 10000,
          expiryMs: MID_EXPIRY,
        }),
      ],
      spotIndex: 100,
      capturedAt: CAPTURED_AT,
    })

    const flip = snapshot.nearTerm.gammaFlipUsd
    expect(flip).not.toBeNull()
    // 网格边界是 ±20%，护栏把超过 10% 的过零判为无效，所以结果必然落在 90 与 110 之间。
    expect(flip ?? 0).toBeGreaterThan(90)
    expect(flip ?? 0).toBeLessThan(110)
  })

  it('净 GEX 全程同号时不给翻转位', () => {
    const snapshot = aggregateOptionChain({
      currency: 'BTC',
      venue: 'deribit',
      contracts: [
        // 清一色 put：任何候选价上的净 GEX 都是负的，没有过零。
        makeContract({ strike: 90, optionType: 'put', openInterest: 100, expiryMs: NEAR_EXPIRY }),
        makeContract({ strike: 110, optionType: 'put', openInterest: 50, expiryMs: NEAR_EXPIRY }),
      ],
      spotIndex: 100,
      capturedAt: CAPTURED_AT,
    })

    expect(snapshot.nearTerm.gammaFlipUsd).toBeNull()
    expect(snapshot.gammaFlip.gammaFlipUsd).toBeNull()
    expect(snapshot.gammaFlip.source).toBe('all-chain')
  })

  it('近月为空时用全链兜底，并标明来源', () => {
    const snapshot = aggregateOptionChain({
      currency: 'BTC',
      venue: 'deribit',
      contracts: [
        makeContract({ strike: 90, optionType: 'put', openInterest: 100, expiryMs: NEAR_EXPIRY }),
        // 次月的对称 put/call 让合并后的净 GEX 出现过零。
        makeContract({ strike: 80, optionType: 'put', openInterest: 10000, expiryMs: MID_EXPIRY }),
        makeContract({
          strike: 120,
          optionType: 'call',
          openInterest: 10000,
          expiryMs: MID_EXPIRY,
        }),
      ],
      spotIndex: 100,
      capturedAt: CAPTURED_AT,
    })

    expect(snapshot.nearTerm.gammaFlipUsd).toBeNull()
    expect(snapshot.allChain.gammaFlipUsd).not.toBeNull()
    expect(snapshot.gammaFlip.gammaFlipUsd).toBe(snapshot.allChain.gammaFlipUsd)
    expect(snapshot.gammaFlip.source).toBe('all-chain')
  })
})

describe('aggregateOptionChain 边界', () => {
  it('DTE 恰好为 0 的合约被过滤', () => {
    const snapshot = aggregateOptionChain({
      currency: 'BTC',
      venue: 'deribit',
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
    expect(snapshot.nearTerm.callWall).toEqual({ strike: 100, openInterest: 10 })
  })

  it('零持仓合约不参与统计', () => {
    const snapshot = aggregateOptionChain({
      currency: 'BTC',
      venue: 'deribit',
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
          venue: 'deribit',
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
          venue: 'deribit',
          contracts: chainPerExpiry(NEAR_EXPIRY),
          spotIndex: 0,
          capturedAt: CAPTURED_AT,
        }),
      ANALYTICS_ERROR_CODES.AGGREGATE_INPUT_INVALID,
    )
  })
})

describe('近月到期桶与墙位口径', () => {
  it('跳过没人交易的日签，取持仓达标的最近到期日', () => {
    // 4 小时后的日签只有 1 张；5 天后周签 400 张。按 30% 门槛应选周签。
    const thinExpiry = Date.UTC(2026, 10, 10, 4, 0, 0)
    const weeklyExpiry = Date.UTC(2026, 10, 15, 8, 0, 0)
    const snapshot = aggregateOptionChain({
      currency: 'BTC',
      venue: 'deribit',
      contracts: [
        makeContract({ strike: 100, optionType: 'call', openInterest: 1, expiryMs: thinExpiry }),
        makeContract({
          strike: 100,
          optionType: 'call',
          openInterest: 400,
          expiryMs: weeklyExpiry,
        }),
      ],
      spotIndex: 100,
      capturedAt: CAPTURED_AT,
    })

    expect(snapshot.nearTerm.expiryIso).toBe('2026-11-15')
  })

  it('交割前 3.6 小时内没有可交易桶时退回最近的未来到期日', () => {
    const expiringExpiry = Date.UTC(2026, 10, 10, 2, 0, 0)
    const snapshot = aggregateOptionChain({
      currency: 'BTC',
      venue: 'deribit',
      contracts: [
        makeContract({
          strike: 100,
          optionType: 'call',
          openInterest: 10,
          expiryMs: expiringExpiry,
        }),
      ],
      spotIndex: 100,
      capturedAt: CAPTURED_AT,
    })

    expect(snapshot.nearTerm.expiryIso).toBe('2026-11-10')
  })

  it('Γ 加权墙偏向平值，OI 墙仍取远端大持仓', () => {
    const snapshot = aggregateOptionChain({
      currency: 'BTC',
      venue: 'deribit',
      contracts: [
        makeContract({ strike: 100, optionType: 'call', openInterest: 100, expiryMs: NEAR_EXPIRY }),
        makeContract({
          strike: 400,
          optionType: 'call',
          openInterest: 5000,
          expiryMs: NEAR_EXPIRY,
        }),
        makeContract({ strike: 90, optionType: 'put', openInterest: 80, expiryMs: NEAR_EXPIRY }),
        makeContract({ strike: 30, optionType: 'put', openInterest: 9000, expiryMs: NEAR_EXPIRY }),
      ],
      spotIndex: 100,
      capturedAt: CAPTURED_AT,
    })

    expect(snapshot.nearTerm.callWall?.strike).toBe(400)
    expect(snapshot.nearTerm.callGammaWall?.strike).toBe(100)
    expect(snapshot.nearTerm.putWall?.strike).toBe(30)
    expect(snapshot.nearTerm.putGammaWall?.strike).toBe(90)
    expect(snapshot.nearTerm.callGammaWall?.gammaWeight ?? 0).toBeGreaterThan(0)
  })
})
describe('aggregateOptionChain 逐到期汇总与 25Δ 偏斜', () => {
  /** 偏斜目标到期：DTE = 39 天，落在 7–90 天窗口内且最接近 30 天。 */
  const SKEW_EXPIRY = CAPTURED_AT + 39 * 86_400_000

  /**
   * 造一条两侧都有翼位的链：行权价 80–120，步长 5，call 与 put 各一张。
   *
   * @param expiryMs 到期时刻
   * @param ivOf 每个方向的 mark IV
   * @returns 合约列表
   */
  function wingChain(expiryMs: number, ivOf: (type: 'call' | 'put') => number) {
    const rows = []
    for (let strike = 80; strike <= 120; strike += 5) {
      rows.push(
        makeContract({
          strike,
          optionType: 'call',
          openInterest: 10,
          expiryMs,
          markIvPercent: ivOf('call'),
        }),
        makeContract({
          strike,
          optionType: 'put',
          openInterest: 10,
          expiryMs,
          markIvPercent: ivOf('put'),
        }),
      )
    }
    return rows
  }

  it('逐到期汇总按到期升序给出 ATM IV、P/C 与持仓', () => {
    const snapshot = aggregateOptionChain({
      currency: 'BTC',
      venue: 'deribit',
      contracts: [...wingChain(NEAR_EXPIRY, () => 50), ...wingChain(SKEW_EXPIRY, () => 50)],
      spotIndex: 100,
      capturedAt: CAPTURED_AT,
    })
    expect(snapshot.expiries).toHaveLength(2)
    const [near, far] = snapshot.expiries
    expect(near?.expiryIso).toBe('2026-11-11')
    expect(near?.dteDays).toBeCloseTo(32 / 24, 10)
    expect(near?.atmIvPercent).toBe(50)
    expect(near?.putCallOiRatio).toBe(1)
    // 9 个行权价 × 2 个方向 × 10 张
    expect(near?.totalOpenInterest).toBe(180)
    expect(far?.expiryIso).toBe('2026-12-19')
    expect(far?.dteDays).toBeCloseTo(39, 10)
  })

  it('两翼 IV 相同时 25Δ 偏斜为 0，并选中 39 天的到期', () => {
    const snapshot = aggregateOptionChain({
      currency: 'BTC',
      venue: 'deribit',
      contracts: [...wingChain(NEAR_EXPIRY, () => 50), ...wingChain(SKEW_EXPIRY, () => 50)],
      spotIndex: 100,
      capturedAt: CAPTURED_AT,
    })
    expect(snapshot.skew25dVolPoints).toBeCloseTo(0, 10)
    expect(snapshot.skew25dExpiryIso).toBe('2026-12-19')
    expect(snapshot.skew25dReason).toBeNull()
  })

  it('call 翼低于 put 翼时偏斜为负，数值等于两翼 IV 之差', () => {
    const snapshot = aggregateOptionChain({
      currency: 'BTC',
      venue: 'deribit',
      contracts: wingChain(SKEW_EXPIRY, (type) => (type === 'call' ? 40 : 60)),
      spotIndex: 100,
      capturedAt: CAPTURED_AT,
    })
    expect(snapshot.skew25dVolPoints).toBeCloseTo(-20, 10)
  })

  it('没有 7 天以上的到期时偏斜不可用并写明原因', () => {
    const snapshot = aggregateOptionChain({
      currency: 'BTC',
      venue: 'deribit',
      contracts: wingChain(NEAR_EXPIRY, () => 50),
      spotIndex: 100,
      capturedAt: CAPTURED_AT,
    })
    expect(snapshot.skew25dVolPoints).toBeNull()
    expect(snapshot.skew25dExpiryIso).toBeNull()
    expect(snapshot.skew25dReason).toBe('no-eligible-expiry')
  })

  it('call 翼不到 25Δ 时写明缺哪一翼', () => {
    const puts = wingChain(SKEW_EXPIRY, () => 60).filter(
      (contract) => contract.optionType === 'put',
    )
    const deepCalls = [125, 130].map((strike) =>
      makeContract({
        strike,
        optionType: 'call',
        openInterest: 10,
        expiryMs: SKEW_EXPIRY,
        markIvPercent: 40,
      }),
    )
    const snapshot = aggregateOptionChain({
      currency: 'BTC',
      venue: 'deribit',
      contracts: [...puts, ...deepCalls],
      spotIndex: 100,
      capturedAt: CAPTURED_AT,
    })
    expect(snapshot.skew25dVolPoints).toBeNull()
    expect(snapshot.skew25dReason).toBe('missing-call-wing')
  })

  it('按 |delta| 在相邻点之间线性插值', () => {
    expect(
      interpolateIvAtDelta(
        [
          { absDelta: 0.2, ivPercent: 44 },
          { absDelta: 0.3, ivPercent: 40 },
        ],
        0.25,
      ),
    ).toBeCloseTo(42, 10)
    expect(interpolateIvAtDelta([{ absDelta: 0.2, ivPercent: 44 }], 0.25)).toBeNull()
    expect(
      interpolateIvAtDelta(
        [
          { absDelta: 0.1, ivPercent: 44 },
          { absDelta: 0.2, ivPercent: 44 },
        ],
        0.25,
      ),
    ).toBeNull()
  })
})
