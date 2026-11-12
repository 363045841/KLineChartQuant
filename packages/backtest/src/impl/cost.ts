/**
 * 交易成本模型（纯计算，不依赖结算与统计）。
 *
 * 口径（第一版）：
 * - 成本按「单边名义金额的 bps」计，手续费与滑点合并成一个参数 `costBpsPerSide`。
 * - 一次完整交易有两次成交（入场、出场），故
 *   `costR = bps / 10000 × (entryPrice + exitPrice) / riskPerUnit`。
 * - 成本是摩擦，与持多还是持空无关：多头与空头都从净 R 里扣同一笔。
 * - 成本只进入 R 记账，**不改变「是否触及止损/目标」的判定**。本版不建模
 *   「滑点把价格推过止损、导致提前触发」的次级效应，触发判定仍按原始 OHLC。
 * - 当前数据是 Binance 现货 K 线，永续资金费率不适用；接永续数据后再单独建模。
 */
import type { TradeRecord } from '../types'

/** 默认结算成本：单边 10 bp（现货 taker 往返约 20 bp，含手续费与滑点）。 */
export const DEFAULT_COST_BPS_PER_SIDE = 10

/** 默认成本敏感度档位（单边 bps）：覆盖合约 taker 到现货 taker 的常见区间。 */
export const DEFAULT_COST_SENSITIVITY_BPS: readonly number[] = [0, 2, 4, 5, 8, 10, 15]

/**
 * 单边 bps 的成本折算系数：乘上 bps 即得该笔交易的 costR。
 *
 * @param entryPrice 入场价
 * @param exitPrice 出场价
 * @param riskPerUnit 每单位价格风险（|entry - stop|）
 * @returns 每 1 bp 单边成本对应的 R
 */
export function costRPerBps(entryPrice: number, exitPrice: number, riskPerUnit: number): number {
  return (entryPrice + exitPrice) / (10_000 * riskPerUnit)
}

/**
 * 指定单边成本下的成本（R 单位）。
 *
 * @param entryPrice 入场价
 * @param exitPrice 出场价
 * @param riskPerUnit 每单位价格风险
 * @param costBpsPerSide 单边成本（bps）
 * @returns costR（恒为非负）
 */
export function costRForPrices(
  entryPrice: number,
  exitPrice: number,
  riskPerUnit: number,
  costBpsPerSide: number,
): number {
  return costBpsPerSide * costRPerBps(entryPrice, exitPrice, riskPerUnit)
}

/**
 * 按给定单边成本重算一笔交易的 `costR` 与净 `rMultiple`。
 *
 * `grossR` 与成交价保持不变——成本只影响记账，不改变结局。
 *
 * @param trade 原交易
 * @param costBpsPerSide 单边成本（bps）
 * @returns 重算后的新交易记录（不修改入参）
 */
export function projectTradeCost(trade: TradeRecord, costBpsPerSide: number): TradeRecord {
  const costR = costRForPrices(trade.entryPrice, trade.exitPrice, trade.riskPerUnit, costBpsPerSide)
  return { ...trade, costR, rMultiple: trade.grossR - costR }
}
