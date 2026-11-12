/**
 * 期权链聚合计算：净 GEX、Gamma 翻转位、Call/Put 墙、最大痛点、近月 ATM IV 与 ±1σ。
 *
 * 口径说明（与 issue #11 的决议一致）：
 * - 只统计 `0 < DTE <= 90` 且 `open_interest > 0` 的合约：更远到期的合约流动性差，
 *   OI 权重会主导净 GEX；零持仓合约对 GEX、墙位、最大痛点没有贡献，只会把统计张数撑大
 *   （实测参考快照 876 张，按 DTE 过滤后 568 张，再加 OI 过滤后 456 张，与决议里的 455 张吻合）。
 * - gamma 用各到期日自己的期货价（`underlying_price`）与 `mark_iv` 本地反算；
 *   美元口径的 GEX 统一乘现货指数²，避免长到期合约的基差把量纲带偏。
 * - 净 GEX 单位是「USD / 1% 波动」：gamma × OI × 1 张 × S² × 0.01，call 记正、put 记负。
 * - Gamma 翻转位按行权价累计净 GEX 由负转正的位置线性插值；全程同号时返回 null。
 * - Call/Put 墙取该方向未平仓量最大的行权价；并列时取较小行权价。
 * - 最大痛点取「到期赔付总额最小」的行权价；并列时取最接近现货的。
 */
import { ANALYTICS_ERROR_CODES, AnalyticsError } from '../../errors'
import type {
  OptionAggregateSnapshot,
  OptionContract,
  OptionCurrency,
  OptionStrikeExposure,
} from '../types'
import { OPTION_CHAIN_MAX_DTE_DAYS } from '../types'
import { black76Gamma } from './black76'

/** 一天的毫秒数。 */
const MS_PER_DAY = 86_400_000

/** 一年的毫秒数：波动率年化按 365 天折算。 */
const MS_PER_YEAR = 365 * MS_PER_DAY

/** GEX 折算比例：单位统一为「每 1% 价格变动」。 */
const PERCENT_MOVE = 0.01

/** 每张期权对应的标的数量：Deribit BTC/ETH 期权 contract_size 均为 1。 */
const CONTRACT_SIZE = 1

/** 单个行权价的聚合桶。 */
interface StrikeBucket {
  /** 行权价 */
  readonly strike: number
  /** call 未平仓量合计 */
  readonly callOpenInterest: number
  /** put 未平仓量合计 */
  readonly putOpenInterest: number
  /** 该行权价的净 GEX（USD/1%） */
  readonly netGexUsdPerPercent: number
}

/** 聚合输入。 */
export interface AggregateOptionChainInput {
  /** 标的 */
  readonly currency: OptionCurrency
  /** 全链合约（未过滤） */
  readonly contracts: readonly OptionContract[]
  /** 现货指数价格 */
  readonly spotIndex: number
  /** 采集时刻（毫秒），用于计算 DTE */
  readonly capturedAt: number
}

/** 近月平值信息。 */
interface NearTermAtm {
  readonly expiryIso: string
  readonly dteDays: number
  readonly atmIvPercent: number
}

/**
 * 计算剩余天数。
 *
 * @param expiryMs 到期毫秒时间戳
 * @param capturedAt 采集毫秒时间戳
 * @returns 剩余天数（可为负）
 */
function remainingDays(expiryMs: number, capturedAt: number): number {
  return (expiryMs - capturedAt) / MS_PER_DAY
}

/**
 * 按行权价聚合 GEX 与未平仓量。
 *
 * @param contracts 已过滤的合约
 * @param spotIndex 现货指数
 * @param capturedAt 采集时刻
 * @returns 按行权价升序排列的聚合桶
 */
function buildStrikeBuckets(
  contracts: readonly OptionContract[],
  spotIndex: number,
  capturedAt: number,
): StrikeBucket[] {
  const buckets = new Map<number, { call: number; put: number; gex: number }>()

  for (const contract of contracts) {
    const timeToExpiryYears = (contract.expiryMs - capturedAt) / MS_PER_YEAR
    const gamma = black76Gamma({
      forward: contract.underlyingPrice,
      strike: contract.strike,
      volatility: contract.markIvPercent / 100,
      timeToExpiryYears,
    })
    const signedGex =
      gamma *
      contract.openInterest *
      CONTRACT_SIZE *
      spotIndex *
      spotIndex *
      PERCENT_MOVE *
      (contract.optionType === 'call' ? 1 : -1)

    const bucket = buckets.get(contract.strike) ?? { call: 0, put: 0, gex: 0 }
    if (contract.optionType === 'call') {
      bucket.call += contract.openInterest
    } else {
      bucket.put += contract.openInterest
    }
    bucket.gex += signedGex
    buckets.set(contract.strike, bucket)
  }

  return [...buckets.entries()]
    .map(([strike, bucket]) => ({
      strike,
      callOpenInterest: bucket.call,
      putOpenInterest: bucket.put,
      netGexUsdPerPercent: bucket.gex,
    }))
    .sort((left, right) => left.strike - right.strike)
}

/**
 * 取某方向未平仓量最大的行权价。
 *
 * @param buckets 按行权价升序的聚合桶
 * @param side 方向
 * @returns 墙位；并列时取较小行权价
 */
function selectWall(buckets: readonly StrikeBucket[], side: 'call' | 'put'): OptionStrikeExposure {
  let best: OptionStrikeExposure | null = null
  for (const bucket of buckets) {
    const openInterest = side === 'call' ? bucket.callOpenInterest : bucket.putOpenInterest
    if (openInterest <= 0) {
      continue
    }
    if (best === null || openInterest > best.openInterest) {
      best = { strike: bucket.strike, openInterest }
    }
  }
  if (best === null) {
    throw new AnalyticsError(
      ANALYTICS_ERROR_CODES.AGGREGATE_EMPTY,
      `${side} 方向没有未平仓合约，无法确定墙位`,
      { side },
    )
  }
  return best
}

/**
 * 计算指定到期行权价下的总赔付（未平仓量加权）。
 *
 * @param candidate 假设的到期价格
 * @param buckets 聚合桶
 * @returns 赔付总额（张 × USD）
 */
function totalPayoutAt(candidate: number, buckets: readonly StrikeBucket[]): number {
  let total = 0
  for (const bucket of buckets) {
    if (candidate > bucket.strike) {
      total += (candidate - bucket.strike) * bucket.callOpenInterest
    }
    if (bucket.strike > candidate) {
      total += (bucket.strike - candidate) * bucket.putOpenInterest
    }
  }
  return total
}

/**
 * 计算最大痛点。
 *
 * @param buckets 聚合桶
 * @param spotIndex 现货指数，用于并列时选更接近的行权价
 * @returns 赔付总额最小的行权价
 */
function computeMaxPain(buckets: readonly StrikeBucket[], spotIndex: number): number {
  let bestStrike = buckets[0].strike
  let bestPayout = totalPayoutAt(bestStrike, buckets)
  let bestDistance = Math.abs(bestStrike - spotIndex)

  for (const bucket of buckets.slice(1)) {
    const payout = totalPayoutAt(bucket.strike, buckets)
    const distance = Math.abs(bucket.strike - spotIndex)
    const better = payout < bestPayout || (payout === bestPayout && distance < bestDistance)
    if (better) {
      bestStrike = bucket.strike
      bestPayout = payout
      bestDistance = distance
    }
  }
  return bestStrike
}

/**
 * 计算 Gamma 翻转位：按行权价累计净 GEX 由负转正的位置。
 *
 * @param buckets 按行权价升序的聚合桶
 * @returns 翻转价位；累计净 GEX 始终同号时返回 null
 */
function computeGammaFlip(buckets: readonly StrikeBucket[]): number | null {
  let cumulative = 0
  let previousCumulative = 0
  let previousStrike = buckets[0].strike

  for (const bucket of buckets) {
    previousCumulative = cumulative
    cumulative += bucket.netGexUsdPerPercent
    if (previousCumulative < 0 && cumulative >= 0) {
      const span = cumulative - previousCumulative
      if (span === 0) {
        return bucket.strike
      }
      const ratio = -previousCumulative / span
      return previousStrike + ratio * (bucket.strike - previousStrike)
    }
    previousStrike = bucket.strike
  }
  return null
}

/**
 * 计算近月平值 IV 与剩余天数。
 *
 * 口径：取剩余天数最小的到期日，选行权价最接近该到期日期货价的合约，
 * 该行权价的 call/put 隐含波动率取平均作为平值 IV。
 *
 * @param contracts 已过滤的合约
 * @param capturedAt 采集时刻
 * @returns 近月到期日、剩余天数与平值 IV
 */
function computeNearTermAtm(contracts: readonly OptionContract[], capturedAt: number): NearTermAtm {
  let nearTermExpiryMs = contracts[0].expiryMs
  for (const contract of contracts) {
    if (contract.expiryMs < nearTermExpiryMs) {
      nearTermExpiryMs = contract.expiryMs
    }
  }

  const nearTermContracts = contracts.filter((contract) => contract.expiryMs === nearTermExpiryMs)
  const forward = nearTermContracts[0].underlyingPrice
  if (!(forward > 0)) {
    throw new AnalyticsError(
      ANALYTICS_ERROR_CODES.AGGREGATE_INPUT_INVALID,
      '近月合约缺少有效的期货价',
      { expiryMs: nearTermExpiryMs, forward },
    )
  }

  let atmStrike = nearTermContracts[0].strike
  for (const contract of nearTermContracts) {
    if (Math.abs(contract.strike - forward) < Math.abs(atmStrike - forward)) {
      atmStrike = contract.strike
    }
  }

  const ivSum = nearTermContracts
    .filter((contract) => contract.strike === atmStrike)
    .reduce((sum, contract) => sum + contract.markIvPercent, 0)
  const ivCount = nearTermContracts.filter((contract) => contract.strike === atmStrike).length
  const atmIvPercent = ivSum / ivCount

  return {
    expiryIso: nearTermContracts[0].expiryIso,
    dteDays: remainingDays(nearTermExpiryMs, capturedAt),
    atmIvPercent,
  }
}

/**
 * 聚合一次期权链快照。
 *
 * @param input 全链合约、现货指数与采集时刻
 * @returns 聚合位快照
 * @throws AnalyticsError 过滤后无合约、输入非法或 gamma 计算失败
 */
export function aggregateOptionChain(input: AggregateOptionChainInput): OptionAggregateSnapshot {
  if (!(input.spotIndex > 0)) {
    throw new AnalyticsError(
      ANALYTICS_ERROR_CODES.AGGREGATE_INPUT_INVALID,
      '现货指数价格必须为正数',
      { currency: input.currency, spotIndex: input.spotIndex },
    )
  }

  const filtered = input.contracts.filter((contract) => {
    const dteDays = remainingDays(contract.expiryMs, input.capturedAt)
    return dteDays > 0 && dteDays <= OPTION_CHAIN_MAX_DTE_DAYS && contract.openInterest > 0
  })
  if (filtered.length === 0) {
    throw new AnalyticsError(
      ANALYTICS_ERROR_CODES.AGGREGATE_EMPTY,
      `没有满足 0 < DTE <= ${OPTION_CHAIN_MAX_DTE_DAYS} 且持仓为正的合约`,
      { currency: input.currency, chainContractCount: input.contracts.length },
    )
  }

  const buckets = buildStrikeBuckets(filtered, input.spotIndex, input.capturedAt)
  const netGexUsdPerPercent = buckets.reduce((sum, bucket) => sum + bucket.netGexUsdPerPercent, 0)
  const nearTerm = computeNearTermAtm(filtered, input.capturedAt)
  const expectedMoveOneSigmaUsd =
    input.spotIndex * (nearTerm.atmIvPercent / 100) * Math.sqrt(nearTerm.dteDays / 365)

  const sourceTimestamp = input.contracts.reduce(
    (latest, contract) => Math.max(latest, contract.creationTimestamp),
    0,
  )

  return {
    schemaVersion: 1,
    currency: input.currency,
    capturedAt: input.capturedAt,
    sourceTimestamp,
    spotIndex: input.spotIndex,
    chainContractCount: input.contracts.length,
    filteredContractCount: filtered.length,
    nearTermExpiryIso: nearTerm.expiryIso,
    nearTermDteDays: nearTerm.dteDays,
    nearTermAtmIvPercent: nearTerm.atmIvPercent,
    netGexUsdPerPercent,
    gammaFlipUsd: computeGammaFlip(buckets),
    callWall: selectWall(buckets, 'call'),
    putWall: selectWall(buckets, 'put'),
    maxPainUsd: computeMaxPain(buckets, input.spotIndex),
    expectedMoveOneSigmaUsd,
    sigmaLowerUsd: input.spotIndex - expectedMoveOneSigmaUsd,
    sigmaUpperUsd: input.spotIndex + expectedMoveOneSigmaUsd,
  }
}
