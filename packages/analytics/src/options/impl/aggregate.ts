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
 * - 逐到期汇总与 25Δ 偏斜（schema 3）：偏斜取 7–90 天里最接近 30 天的到期，
 *   两翼按 |delta| 在相邻行权价之间线性插值，不用最近行权价顶替。
 */
import { ANALYTICS_ERROR_CODES, AnalyticsError } from '../../errors'
import type { OptionVenue } from '../markets'
import type {
  OptionAggregateSnapshot,
  OptionContract,
  OptionCurrency,
  OptionExpirySummary,
  OptionGammaWall,
  OptionLevelSet,
  OptionSkewUnavailableReason,
  OptionStrikeExposure,
} from '../types'
import { OPTION_CHAIN_MAX_DTE_DAYS } from '../types'
import { black76Delta, black76Gamma } from './black76'

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
  /** 数据场所：随行落盘，读方据此说明来源 */
  readonly venue: OptionVenue
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
    if (previousGex >= 0 !== gex >= 0) {
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
 * 取一个到期日的平值 IV。
 *
 * 先选行权价最接近该到期期货价的合约，再把该行权价上 call 与 put 的 mark IV 取平均。
 *
 * @param contracts 同一到期日的合约
 * @param forward 该到期日的期货价
 * @returns 平值 IV 百分数；期货价无效或没有合约时为 null
 */
function atmIvOf(contracts: readonly OptionContract[], forward: number): number | null {
  if (!(forward > 0) || contracts.length === 0) return null
  let atmStrike = contracts[0].strike
  for (const contract of contracts) {
    if (Math.abs(contract.strike - forward) < Math.abs(atmStrike - forward)) {
      atmStrike = contract.strike
    }
  }
  let sum = 0
  let count = 0
  for (const contract of contracts) {
    if (contract.strike !== atmStrike) continue
    sum += contract.markIvPercent
    count += 1
  }
  return count === 0 ? null : sum / count
}

/**
 * 计算近月平值 IV 与剩余天数。
 *
 * 口径：先用 `selectNearTermExpiry` 选定到期桶，再用 `atmIvOf` 取该桶的平值 IV。
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

  const atmIvPercent = atmIvOf(nearTermContracts, forward)
  if (atmIvPercent === null) {
    throw new AnalyticsError(
      ANALYTICS_ERROR_CODES.AGGREGATE_INPUT_INVALID,
      '近月合约缺少有效的平值 IV',
      { expiryMs: nearTermExpiryMs },
    )
  }

  return {
    expiryIso: nearTermContracts[0].expiryIso,
    dteDays: remainingDays(nearTermExpiryMs, capturedAt),
    atmIvPercent,
  }
}

/**
 * 25Δ 偏斜的目标期限：取最接近 30 天的到期，与 30 天常数期限口径一致。
 */
const SKEW_TARGET_DTE_DAYS = 30

/** 25Δ 偏斜允许使用的最小 DTE：更短到期的翼位由事件风险主导，delta 对价格也极敏感。 */
const SKEW_MIN_DTE_DAYS = 7

/** 风险逆转的翼位 delta。 */
const SKEW_DELTA = 0.25

/** 一个翼位候选：|delta| 与对应的 mark IV。 */
interface DeltaIvPoint {
  /** |delta|；call 与 put 都取绝对值 */
  readonly absDelta: number
  /** 该合约的 mark IV 百分数 */
  readonly ivPercent: number
}

/**
 * 按 |delta| 线性插值出目标 delta 上的 IV。
 *
 * 只在夹住目标值的相邻两点之间插值：链没伸到目标 delta 时返回 null，不用最近点顶替。
 * 实测最近行权价的 delta 可偏离 0.25 达 7–12%（20NOV put 为 0.233Δ），偏差与日间变化同量级。
 *
 * @param points 候选点，顺序不限
 * @param target 目标 |delta|
 * @returns IV 百分数；没有夹住目标值时为 null
 */
export function interpolateIvAtDelta(
  points: readonly DeltaIvPoint[],
  target: number,
): number | null {
  const ordered = [...points].sort((left, right) => left.absDelta - right.absDelta)
  for (let index = 1; index < ordered.length; index += 1) {
    const low = ordered[index - 1]
    const high = ordered[index]
    if (low === undefined || high === undefined) continue
    if (low.absDelta > target || high.absDelta < target) continue
    const span = high.absDelta - low.absDelta
    if (!(span > 0)) continue
    const weight = (target - low.absDelta) / span
    return low.ivPercent + weight * (high.ivPercent - low.ivPercent)
  }
  return null
}

/**
 * 算一个到期日的 25Δ 风险逆转。
 *
 * 口径：Black-76 远期 delta（r = 0），call 取 N(d1)、put 取 N(d1) − 1，两翼按 |delta| 插值；
 * 结果 = IV(25Δ call) − IV(25Δ put)，单位波动点。负值表示下行保护更贵。
 *
 * @param contracts 同一到期日的合约
 * @param forward 该到期日的期货价
 * @param timeToExpiryYears 剩余年数
 * @returns 偏斜值与不可用原因
 */
function skew25dOf(
  contracts: readonly OptionContract[],
  forward: number,
  timeToExpiryYears: number,
): { value: number | null; reason: OptionSkewUnavailableReason | null } {
  if (!(forward > 0) || !(timeToExpiryYears > 0)) {
    return { value: null, reason: 'invalid-forward' }
  }
  const calls: DeltaIvPoint[] = []
  const puts: DeltaIvPoint[] = []
  for (const contract of contracts) {
    if (!(contract.markIvPercent > 0)) continue
    const delta = black76Delta({
      forward,
      strike: contract.strike,
      volatility: contract.markIvPercent / 100,
      timeToExpiryYears,
      optionType: contract.optionType,
    })
    const point: DeltaIvPoint = { absDelta: Math.abs(delta), ivPercent: contract.markIvPercent }
    if (contract.optionType === 'call') calls.push(point)
    else puts.push(point)
  }
  const callIv = interpolateIvAtDelta(calls, SKEW_DELTA)
  const putIv = interpolateIvAtDelta(puts, SKEW_DELTA)
  if (callIv === null && putIv === null) return { value: null, reason: 'missing-wings' }
  if (callIv === null) return { value: null, reason: 'missing-call-wing' }
  if (putIv === null) return { value: null, reason: 'missing-put-wing' }
  return { value: callIv - putIv, reason: null }
}

/** 一个到期日的合约分组与汇总。 */
interface ExpiryGroup {
  /** 到期毫秒时间戳 */
  readonly expiryMs: number
  /** 到期日（UTC 日期） */
  readonly expiryIso: string
  /** 剩余天数 */
  readonly dteDays: number
  /** 该到期日的期货价 */
  readonly forward: number
  /** 该到期日的合约 */
  readonly contracts: readonly OptionContract[]
  /** 落盘的逐到期汇总 */
  readonly summary: OptionExpirySummary
}

/**
 * 按到期日分组并汇总。
 *
 * @param contracts 已过滤的合约
 * @param capturedAt 采集时刻
 * @returns 按到期升序的分组
 */
function groupExpiriesOf(contracts: readonly OptionContract[], capturedAt: number): ExpiryGroup[] {
  const order: number[] = []
  const grouped = new Map<number, OptionContract[]>()
  for (const contract of contracts) {
    const bucket = grouped.get(contract.expiryMs)
    if (bucket === undefined) {
      order.push(contract.expiryMs)
      grouped.set(contract.expiryMs, [contract])
      continue
    }
    bucket.push(contract)
  }
  order.sort((left, right) => left - right)

  const groups: ExpiryGroup[] = []
  for (const expiryMs of order) {
    const groupContracts = grouped.get(expiryMs) ?? []
    const first = groupContracts[0]
    if (first === undefined) continue
    const forward = first.underlyingPrice
    let callOpenInterest = 0
    let putOpenInterest = 0
    for (const contract of groupContracts) {
      if (contract.optionType === 'call') callOpenInterest += contract.openInterest
      else putOpenInterest += contract.openInterest
    }
    const dteDays = remainingDays(expiryMs, capturedAt)
    groups.push({
      expiryMs,
      expiryIso: first.expiryIso,
      dteDays,
      forward,
      contracts: groupContracts,
      summary: {
        expiryIso: first.expiryIso,
        dteDays,
        atmIvPercent: atmIvOf(groupContracts, forward),
        putCallOiRatio: callOpenInterest > 0 ? putOpenInterest / callOpenInterest : null,
        totalOpenInterest: callOpenInterest + putOpenInterest,
      },
    })
  }
  return groups
}

/**
 * 选出 25Δ 偏斜使用的到期日：7 天以上、最接近 30 天。
 *
 * 不用近月：近月到期每天滚动（DTE 0.2–14 天），同一条序列会混着不同期限，
 * 而偏斜本身随期限变化（实测同期 0.83 天为 −6.89、38.83 天为 −5.07 个波动点）。
 *
 * @param groups 按到期升序的分组
 * @returns 选中的分组；没有 7 天以上到期时为 null
 */
function selectSkewGroup(groups: readonly ExpiryGroup[]): ExpiryGroup | null {
  let best: ExpiryGroup | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  for (const group of groups) {
    if (group.dteDays < SKEW_MIN_DTE_DAYS) continue
    const distance = Math.abs(group.dteDays - SKEW_TARGET_DTE_DAYS)
    if (distance < bestDistance) {
      best = group
      bestDistance = distance
    }
  }
  return best
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

  const expiryGroups = groupExpiriesOf(filtered, input.capturedAt)
  const skewGroup = selectSkewGroup(expiryGroups)
  const skew: { value: number | null; reason: OptionSkewUnavailableReason | null } =
    skewGroup === null
      ? { value: null, reason: 'no-eligible-expiry' }
      : skew25dOf(
          skewGroup.contracts,
          skewGroup.forward,
          (skewGroup.expiryMs - input.capturedAt) / MS_PER_YEAR,
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
    schemaVersion: 3,
    currency: input.currency,
    venue: input.venue,
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
    expiries: expiryGroups.map((group) => group.summary),
    skew25dVolPoints: skew.value,
    skew25dExpiryIso: skew.value === null || skewGroup === null ? null : skewGroup.expiryIso,
    skew25dReason: skew.reason,
  }
}
