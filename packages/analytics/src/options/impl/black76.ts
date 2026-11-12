/**
 * 反向合约 Black-76 定价的希腊值计算。
 *
 * Deribit 全链快照不返回 `greeks` 字段，只能本地自算。实测用 mark_iv 反算的 gamma
 * 与官方逐合约 `ticker.greeks.gamma` 一致（差异仅来自官方只保留 5 位有效数字）。
 *
 * 记 F 为该到期日的期货价、K 为行权价、σ 为年化隐含波动率、T 为剩余年数：
 *   d1 = [ln(F/K) + 0.5σ²T] / (σ√T)
 *   gamma = φ(d1) / (F σ √T)
 * gamma 的量纲是「每 1 USD 标的价格变动，期权美元价格的一阶导变化」，
 * 与 Deribit 官方口径同量级，可直接用于 GEX。
 */
import { ANALYTICS_ERROR_CODES, AnalyticsError } from '../../errors'

/** 标准正态分布的概率密度函数。 */
const INVERSE_SQRT_TWO_PI = 1 / Math.sqrt(2 * Math.PI)

/** Black-76 gamma 输入。 */
export interface Black76GammaInput {
  /** 该到期日的期货价 F */
  readonly forward: number
  /** 行权价 K */
  readonly strike: number
  /** 年化隐含波动率，小数形式（0.4189 表示 41.89%） */
  readonly volatility: number
  /** 剩余年数 */
  readonly timeToExpiryYears: number
}

/**
 * 标准正态分布概率密度。
 *
 * @param x 自变量
 * @returns φ(x)
 */
export function standardNormalDensity(x: number): number {
  return INVERSE_SQRT_TWO_PI * Math.exp(-0.5 * x * x)
}

/**
 * 计算反向合约 Black-76 gamma。
 *
 * @param input 期货价、行权价、波动率与剩余年数
 * @returns gamma（单位 1/USD）
 * @throws AnalyticsError 输入非正时抛出
 */
export function black76Gamma(input: Black76GammaInput): number {
  const { forward, strike, volatility, timeToExpiryYears } = input
  if (!(forward > 0) || !(strike > 0) || !(volatility > 0) || !(timeToExpiryYears > 0)) {
    throw new AnalyticsError(
      ANALYTICS_ERROR_CODES.AGGREGATE_INPUT_INVALID,
      'Black-76 gamma 输入必须为正数',
      { forward, strike, volatility, timeToExpiryYears },
    )
  }

  const sigmaSqrtTime = volatility * Math.sqrt(timeToExpiryYears)
  const d1 = (Math.log(forward / strike) + 0.5 * sigmaSqrtTime * sigmaSqrtTime) / sigmaSqrtTime
  return standardNormalDensity(d1) / (forward * sigmaSqrtTime)
}
