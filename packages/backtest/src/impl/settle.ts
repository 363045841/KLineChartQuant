/**
 * 理论结局结算（无管理，含固定成本）。
 *
 * 第一版三价规则是**刻意简化**（第二版会换成结构位）：
 * - 入场：信号 bar 收盘价
 * - 止损：多头云下沿 `min(spanA, spanB)`；空头云上沿 `max(spanA, spanB)`
 * - 第一目标：entry ± 2R；第二目标：entry ± 3R（只记录是否到达，不改结局）
 * - 成本：按 `config.costBpsPerSide` 的单边名义成本计入 R 记账，见 `impl/cost.ts`
 *
 * 结算规则（复刻 #7 的骨架）：
 * - 止损与目标用 high/low 触及判定，影线打损也算
 * - 同一根 bar 同时触及止损与目标时，按止损处理（OHLC 无法判断先后，保守取值）
 * - 结局：hit_target / hit_stop / invalidated / expired
 *   - invalidated：持仓期间出现反向 L2 信号且尚未触及止损/目标，按该 bar 收盘价出场
 *   - expired：持仓超过 maxBars 仍未触发止损/目标，按该 bar 收盘价出场
 * - 记录 maxFavorable / maxAdverse（R 单位）与 reachedTarget2
 *
 * 管理规则（1R 保本 / 第一目标减半 / 结构追踪）第一版不做：
 * `TradeRecord.managedOutcome` 恒为 null。
 */
import type {
  BacktestConfig,
  Candle,
  Direction,
  SignalEvent,
  TradeOutcome,
  TradeRecord,
} from '../types'
import { costRForPrices } from './cost'

/** 结算输入。 */
export interface SettleInput {
  /** 交易对 */
  readonly symbol: string
  /** 交易编号 */
  readonly id: number
  /** K 线 */
  readonly candles: readonly Candle[]
  /** 信号事件 */
  readonly signal: SignalEvent
  /** 每根 bar 上的信号方向（用于判定反向信号失效） */
  readonly signalDirections: readonly (Direction | null)[]
  /** 配置 */
  readonly config: BacktestConfig
}

/**
 * 判定交易是否被反向信号失效。
 *
 * @param direction 持仓方向
 * @param opposite 该 bar 上的信号方向
 * @returns 是否需要失效出场
 */
function isInvalidatedBy(direction: Direction, opposite: Direction | null): boolean {
  return opposite !== null && opposite !== direction
}

/**
 * 结算一笔理论结局交易。
 *
 * @param input 信号、K 线与配置
 * @returns 交易记录
 * @throws Error 入场价等于止损价（数据异常，无法定义 R）
 */
export function settleTheoreticalTrade(input: SettleInput): TradeRecord {
  const { signal, candles, signalDirections, config } = input
  const direction = signal.direction
  const sign = direction === 'long' ? 1 : -1
  const entryPrice = signal.entryPrice
  const stopPrice = signal.stopPrice
  const riskPerUnit = Math.abs(entryPrice - stopPrice)
  if (!(riskPerUnit > 0)) {
    throw new Error(
      `${input.symbol} 信号 ${signal.barIndex} 的入场价与止损价重合，无法计算 R（entry=${entryPrice}, stop=${stopPrice}）`,
    )
  }

  const target1 = entryPrice + sign * config.target1R * riskPerUnit
  const target2 = entryPrice + sign * config.target2R * riskPerUnit
  const lastIndex = candles.length - 1

  let exitIndex = -1
  let exitPrice = Number.NaN
  let outcome: TradeOutcome = 'expired'

  for (let index = signal.barIndex + 1; index <= lastIndex; index += 1) {
    const bar = candles[index]
    const barsHeld = index - signal.barIndex

    // 止损优先：同一根 bar 内止损与目标都触及时，按止损结算（保守）。
    const stopTouched = direction === 'long' ? bar.low <= stopPrice : bar.high >= stopPrice
    if (stopTouched) {
      exitIndex = index
      exitPrice = stopPrice
      outcome = 'hit_stop'
      break
    }

    const targetTouched = direction === 'long' ? bar.high >= target1 : bar.low <= target1
    if (targetTouched) {
      exitIndex = index
      exitPrice = target1
      outcome = 'hit_target'
      break
    }

    if (barsHeld >= config.maxBars) {
      exitIndex = index
      exitPrice = bar.close
      outcome = 'expired'
      break
    }

    if (isInvalidatedBy(direction, signalDirections[index] ?? null)) {
      exitIndex = index
      exitPrice = bar.close
      outcome = 'invalidated'
      break
    }
  }

  // 数据结束仍未了结：按最后一根收盘价记为 expired。
  if (exitIndex < 0) {
    exitIndex = lastIndex
    exitPrice = candles[lastIndex].close
    outcome = 'expired'
  }

  const grossR = ((exitPrice - entryPrice) * sign) / riskPerUnit
  // 成本是摩擦，与方向无关：多头与空头都从净 R 里扣同一笔。
  const costR = costRForPrices(entryPrice, exitPrice, riskPerUnit, config.costBpsPerSide)
  const rMultiple = grossR - costR

  // 持有区间的有利/不利偏移（R 单位），以及是否触及第二目标。
  let maxFavorableR = 0
  let maxAdverseR = 0
  let reachedTarget2 = false
  for (let index = signal.barIndex + 1; index <= exitIndex; index += 1) {
    const bar = candles[index]
    const favorable =
      direction === 'long'
        ? (bar.high - entryPrice) / riskPerUnit
        : (entryPrice - bar.low) / riskPerUnit
    const adverse =
      direction === 'long'
        ? (entryPrice - bar.low) / riskPerUnit
        : (bar.high - entryPrice) / riskPerUnit
    if (favorable > maxFavorableR) maxFavorableR = favorable
    if (adverse > maxAdverseR) maxAdverseR = adverse
    if (favorable >= config.target2R) reachedTarget2 = true
  }

  return {
    id: input.id,
    symbol: input.symbol,
    direction,
    grade: signal.grade,
    signalIndex: signal.barIndex,
    entryIndex: signal.barIndex,
    exitIndex,
    entryTime: candles[signal.barIndex].closeTime,
    exitTime: candles[exitIndex].closeTime,
    entryPrice,
    stopPrice,
    target1,
    target2,
    riskPerUnit,
    exitPrice,
    outcome,
    grossR,
    costR,
    rMultiple,
    barsHeld: exitIndex - signal.barIndex,
    maxFavorableR,
    maxAdverseR,
    reachedTarget2,
    managedOutcome: null,
  }
}
