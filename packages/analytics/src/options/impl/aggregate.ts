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
 * - Gamma 翻转位是「净 GEX 过零的现价」：把现价按 ±20% 扫 41 个候选点，每个点等比平移期货价
 *   重新定 gamma，累计全链净 GEX，取离现价最近的一次过零；网格内不过零、或过零点偏离现价
 *   超过 10%，都视为本轮没有有效翻转（深虚位的偶然过零没有经济意义）。
 * - Call/Put 墙取该方向未平仓量最大的行权价；并列时取较小行权价。
 * - 最大痛点取「到期赔付总额最小」的行权价；并列时取最接近现货的。
 */
import { ANALYTICS_ERROR_CODES, AnalyticsError } from '../../errors'
import type {
  OptionAggregateSnapshot,
  OptionContract,
  OptionCurrency,
  OptionLevelSet,
  OptionStrikeExposure,
  OptionGammaWall,
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
  /** call 侧的 OI×Γ 合计，单位 1/USD */
  readonly callGammaWeight: number
  /** put 侧的 OI×Γ 合计，单位 1/USD */
  readonly putGammaWeight: number
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
  const buckets = new Map<
    number,
    { call: number; put: number; gex: number; callWeight: number; putWeight: number }
  >()

  for (const contract of contracts) {
    const timeToExpiryYears = (contract.expiryMs - capturedAt) / MS_PER_YEAR
    const gamma = black76Gamma({
      forward: contract.underlyingPrice,
      strike: contract.strike,
      volatility: contract.markIvPercent / 100,
      timeToExpiryYears,
    })
    // Gamma 加权墙按「OI×Γ」比较，与 GEX 的美元口径无关，所以这里不乘 S²。
    const gammaWeight = gamma * contract.openInterest * CONTRACT_SIZE
    const signedGex =
      gamma *
      contract.openInterest *
      CONTRACT_SIZE *
      spotIndex *
      spotIndex *
      PERCENT_MOVE *
      (contract.optionType === 'call' ? 1 : -1)

    const bucket = buckets.get(contract.strike) ?? {
      call: 0,
      put: 0,
      gex: 0,
      callWeight: 0,
      putWeight: 0,
    }
    if (contract.optionType === 'call') {
      bucket.call += contract.openInterest
      bucket.callWeight += gammaWeight
    } else {
      bucket.put += contract.openInterest
      bucket.putWeight += gammaWeight
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
      callGammaWeight: bucket.callWeight,
      putGammaWeight: bucket.putWeight,
    }))
    .sort((left, right) => left.strike - right.strike)
}

/**
 * 取某方向未平仓量最大的行权价。
 *
 * @param buckets 按行权价升序的聚合桶
 * @param side 方向
 * @returns 墙位；该方向没有持仓时为 null，并列时取较小行权价
 */
function selectWall(
  buckets: readonly StrikeBucket[],
  side: 'call' | 'put',
): OptionStrikeExposure | null {
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
  return best
}

/**
 * 取某方向 OI×Γ 合计最大的行权价。
 *
 * OI 墙读「仓位聚集」，Gamma 加权墙读「日内对冲火力」：平值附近 Γ 呈钟形，
 * 加权后自然偏向现价周围真正需要调仓的行权价，远端彩票 Call 不会抢位。
 *
 * @param buckets 按行权价升序的聚合桶
 * @param side 方向
 * @returns 加权墙位；该方向没有持仓时为 null，并列时取较小行权价
 */
function selectGammaWall(
  buckets: readonly StrikeBucket[],
  side: 'call' | 'put',
): OptionGammaWall | null {
  let best: OptionGammaWall | null = null
  for (const bucket of buckets) {
    const gammaWeight = side === 'call' ? bucket.callGammaWeight : bucket.putGammaWeight
    if (!(gammaWeight > 0)) continue
    if (best === null || gammaWeight > best.gammaWeight) {
      best = { strike: bucket.strike, gammaWeight }
    }
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

/** Gamma 翻转扫描的带宽：现价上下各 20%。 */
const FLIP_BAND = 0.2

/** 扫描网格的分段数：41 个采样点足够分辨一次过零。 */
const FLIP_GRID_STEPS = 40

/** 翻转位偏离现价超过该比例时，视为本轮没有有效翻转。 */
const FLIP_MAX_DISTANCE_RATIO = 0.1

/**
 * 假设现价为 spot 时的净 GEX（USD/1%）。
 *
 * 期货价按 `spot / spotIndex` 等比平移，gamma 随候选价重新计算，量纲与快照里的
 * `netGexUsdPerPercent` 一致。
 *
 * @param contracts 该视图的合约
 * @param spot 假设的现价
 * @param spotIndex 实际现价
 * @param capturedAt 采集时刻
 * @returns 该候选价下的净 GEX
 */
function netGexAt(
  contracts: readonly OptionContract[],
  spot: number,
  spotIndex: number,
  capturedAt: number,
): number {
  const ratio = spot / spotIndex
  let net = 0
  for (const contract of contracts) {
    const gamma = black76Gamma({
      forward: contract.underlyingPrice * ratio,
      strike: contract.strike,
      volatility: contract.markIvPercent / 100,
      timeToExpiryYears: (contract.expiryMs - capturedAt) / MS_PER_YEAR,
    })
    net +=
      gamma *
      contract.openInterest *
      CONTRACT_SIZE *
      spot *
      spot *
      PERCENT_MOVE *
      (contract.optionType === 'call' ? 1 : -1)
  }
  return net
}

/**
 * 计算 Gamma 翻转位：净 GEX 过零的那个现价。
 *
 * Deribit 只给逐合约 IV，没有现成的翻转位，只能扫：把现价按 ±20% 分成 41 个候选点，
 * 每个点重新定 gamma 后累计净 GEX，取离现价最近的一次过零并线性插值。
 * 不按行权价累计：那是价格轴的代理，单方向持仓占优时几乎总是同号，实测长期给 null。
 *
 * @param contracts 该视图的合约
 * @param spotIndex 现货指数价格
 * @param capturedAt 采集时刻
 * @returns 翻转位；网格内不过零或偏离现价超过 10% 时返回 null
 */
function computeGammaFlip(
  contracts: readonly OptionContract[],
  spotIndex: number,
  capturedAt: number,
): number | null {
  let previousSpot = spotIndex * (1 - FLIP_BAND)
  let previousGex = netGexAt(contracts, previousSpot, spotIndex, capturedAt)
  let flip: number | null = null
  for (let step = 1; step <= FLIP_GRID_STEPS; step++) {
    const spot = spotIndex * (1 - FLIP_BAND + (2 * FLIP_BAND * step) / FLIP_GRID_STEPS)
    const gex = netGexAt(contracts, spot, spotIndex, capturedAt)
    if ((previousGex >= 0) !== (gex >= 0)) {
      const span = Math.abs(previousGex) + Math.abs(gex)
      const cross = previousSpot + ((spot - previousSpot) * Math.abs(previousGex)) / span
      if (flip === null || Math.abs(cross - spotIndex) < Math.abs(flip - spotIndex)) flip = cross
    }
    previousSpot = spot
    previousGex = gex
  }
  if (flip === null) return null
  if (Math.abs(flip - spotIndex) > FLIP_MAX_DISTANCE_RATIO * spotIndex) return null
  return Math.round(flip * 100) / 100
}

/** 近月桶的最小剩余天数：低于它说明已进入交割前的 gamma 坍缩区，换下一个桶。 */
const NEAR_TERM_MIN_DTE_DAYS = 0.15

/** 近月桶的最大剩余天数：超出的桶只进全链视图，不参与近月口径。 */
const NEAR_TERM_MAX_DTE_DAYS = 14

/** 近月桶的持仓门槛：达到窗口内最大桶的这一比例才算可交易。 */
const NEAR_TERM_MIN_OI_RATIO = 0.3

/**
 * 选出近月到期桶。
 *
 * 先按到期日累计持仓，限定在 [0.15, 14] 天的窗口内，再取「持仓达到窗口最大桶 30%」
 * 的最近一个：既跳过得没人交易的日签（几千张的桶，一笔大单就能翻墙），
 * 又不会让月底大桶把当周周签挤掉。窗口内一个桶都没有时退回最近的未来到期日。
 *
 * @param contracts 已过滤的合约
 * @param capturedAt 采集时刻
 * @returns 选中的到期毫秒时刻
 */
function selectNearTermExpiry(contracts: readonly OptionContract[], capturedAt: number): number {
  const buckets = new Map<number, number>()
  for (const contract of contracts) {
    const dteDays = remainingDays(contract.expiryMs, capturedAt)
    if (dteDays < NEAR_TERM_MIN_DTE_DAYS || dteDays > NEAR_TERM_MAX_DTE_DAYS) continue
    buckets.set(contract.expiryMs, (buckets.get(contract.expiryMs) ?? 0) + contract.openInterest)
  }
  const ranked = [...buckets.entries()].sort((left, right) => left[0] - right[0])
  if (ranked.length === 0) {
    // 窗口内没有可用桶（例如全部进入交割前 3.6 小时），退回最近的未来到期日。
    return contracts.reduce(
      (earliest, contract) => (contract.expiryMs < earliest ? contract.expiryMs : earliest),
      contracts[0].expiryMs,
    )
  }
  const best = Math.max(...ranked.map(([, openInterest]) => openInterest))
  const threshold = best * NEAR_TERM_MIN_OI_RATIO
  const chosen = ranked.find(([, openInterest]) => openInterest >= threshold)
  return chosen?.[0] ?? ranked[0][0]
}

/**
 * 计算近月平值 IV 与剩余天数。
 *
 * 口径：先用 `selectNearTermExpiry` 选定到期桶，再选行权价最接近该桶期货价的合约，
 * 该行权价的 call/put 隐含波动率取平均作为平值 IV。
 *
 * @param contracts 已过滤的合约
 * @param capturedAt 采集时刻
 * @returns 近月到期日、剩余天数与平值 IV
 */
function computeNearTermAtm(contracts: readonly OptionContract[], capturedAt: number): NearTermAtm {
  const nearTermExpiryMs = selectNearTermExpiry(contracts, capturedAt)
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
 * 由聚合桶与合约算出一套关键位。
 *
 * 翻转位要沿现价轴重新定 gamma，这里同时需要逐合约的 IV、DTE 与期货价，所以桶不够用。
 *
 * @param buckets 按行权价升序的聚合桶
 * @param contracts 该视图的合约
 * @param spotIndex 现货指数价格
 * @param capturedAt 采集时刻
 * @returns 该视图的关键位（墙位、最大痛点、翻转位、净 GEX、P/C 比与总持仓）
 */
function buildLevelSet(
  buckets: readonly StrikeBucket[],
  contracts: readonly OptionContract[],
  spotIndex: number,
  capturedAt: number,
): OptionLevelSet {
  let callOpenInterest = 0
  let putOpenInterest = 0
  let netGexUsdPerPercent = 0
  for (const bucket of buckets) {
    callOpenInterest += bucket.callOpenInterest
    putOpenInterest += bucket.putOpenInterest
    netGexUsdPerPercent += bucket.netGexUsdPerPercent
  }
  return {
    gammaFlipUsd: computeGammaFlip(contracts, spotIndex, capturedAt),
    callWall: selectWall(buckets, 'call'),
    putWall: selectWall(buckets, 'put'),
    callGammaWall: selectGammaWall(buckets, 'call'),
    putGammaWall: selectGammaWall(buckets, 'put'),
    maxPainUsd: computeMaxPain(buckets, spotIndex),
    netGexUsdPerPercent,
    putCallOiRatio: callOpenInterest > 0 ? putOpenInterest / callOpenInterest : null,
    totalOpenInterest: callOpenInterest + putOpenInterest,
    contractCount: buckets.length,
  }
}

/**
 * 聚合一次期权链快照。
 *
 * 同时算两份关键位：近月（最近一个到期日，主图口径）与全链（`0 < DTE <= 90` 合并，参考口径）。
 * 近月样本少时翻转位常为 null，此时主图采用全链的值，并在 `gammaFlip.source` 标明来源。
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

  const nearTermAtm = computeNearTermAtm(filtered, input.capturedAt)
  const allChain = buildLevelSet(
    buildStrikeBuckets(filtered, input.spotIndex, input.capturedAt),
    filtered,
    input.spotIndex,
    input.capturedAt,
  )
  const nearTermContracts = filtered.filter(
    (contract) => contract.expiryIso === nearTermAtm.expiryIso,
  )
  const nearTermSet = buildLevelSet(
    buildStrikeBuckets(nearTermContracts, input.spotIndex, input.capturedAt),
    nearTermContracts,
    input.spotIndex,
    input.capturedAt,
  )

  const expectedMoveOneSigmaUsd =
    input.spotIndex * (nearTermAtm.atmIvPercent / 100) * Math.sqrt(nearTermAtm.dteDays / 365)
  const expectedMoveTwoSigmaUsd = expectedMoveOneSigmaUsd * 2

  const sourceTimestamp = input.contracts.reduce(
    (latest, contract) => Math.max(latest, contract.creationTimestamp),
    0,
  )

  const flipped = nearTermSet.gammaFlipUsd === null
  return {
    schemaVersion: 2,
    currency: input.currency,
    capturedAt: input.capturedAt,
    sourceTimestamp,
    spotIndex: input.spotIndex,
    chainContractCount: input.contracts.length,
    filteredContractCount: filtered.length,
    nearTerm: {
      ...nearTermSet,
      expiryIso: nearTermAtm.expiryIso,
      dteDays: nearTermAtm.dteDays,
      atmIvPercent: nearTermAtm.atmIvPercent,
      expectedMoveOneSigmaUsd,
      expectedMoveTwoSigmaUsd,
      sigmaLowerUsd: input.spotIndex - expectedMoveOneSigmaUsd,
      sigmaUpperUsd: input.spotIndex + expectedMoveOneSigmaUsd,
      sigma2LowerUsd: input.spotIndex - expectedMoveTwoSigmaUsd,
      sigma2UpperUsd: input.spotIndex + expectedMoveTwoSigmaUsd,
    },
    allChain,
    gammaFlip: {
      gammaFlipUsd: flipped ? allChain.gammaFlipUsd : nearTermSet.gammaFlipUsd,
      source: flipped ? 'all-chain' : 'near-term',
    },
  }
}

