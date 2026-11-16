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
 *
 * r = 0 时远期 delta 就是 call 的 N(d1) 与 put 的 N(d1) − 1；25Δ 偏斜用它定位两翼。
 */
import { ANALYTICS_ERROR_CODES, AnalyticsError } from '../../errors'
import type { OptionType } from '../types'

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
 * 标准正态分布函数。
 *
 * 用 Abramowitz–Stegun 7.1.26 近似 erf，绝对误差小于 1.5e-7，
 * 对 delta 定位（0.25 附近）足够，不引入额外依赖。
 *
 * @param x 自变量
 * @returns Φ(x)
 */
export function standardNormalCdf(x: number): number {
  return 0.5 * (1 + erfApproximation(x / Math.SQRT2))
}

/**
 * Abramowitz–Stegun 7.1.26 的 erf 近似。
 *
 * @param x 自变量
 * @returns erf(x)
 */
function erfApproximation(x: number): number {
  const sign = x < 0 ? -1 : 1
  const value = Math.abs(x)
  const t = 1 / (1 + 0.3275911 * value)
  const poly =
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t
  return sign * (1 - poly * Math.exp(-value * value))
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
/** Black-76 delta 输入。 */
export interface Black76DeltaInput extends Black76GammaInput {
  /** 期权方向 */
  readonly optionType: OptionType
}

/**
 * 计算反向合约 Black-76 远期 delta。
 *
 * r = 0 时 call 的 delta 是 N(d1)、put 是 N(d1) − 1；25Δ 偏斜用绝对值定位翼位。
 *
 * @param input 期货价、行权价、波动率、剩余年数与方向
 * @returns call 为正、put 为负的 delta
 * @throws AnalyticsError 输入非正时抛出
 */
export function black76Delta(input: Black76DeltaInput): number {
  const { forward, strike, volatility, timeToExpiryYears, optionType } = input
  if (!(forward > 0) || !(strike > 0) || !(volatility > 0) || !(timeToExpiryYears > 0)) {
    throw new AnalyticsError(
      ANALYTICS_ERROR_CODES.AGGREGATE_INPUT_INVALID,
      'Black-76 delta 输入必须为正数',
      { forward, strike, volatility, timeToExpiryYears },
    )
  }

  const sigmaSqrtTime = volatility * Math.sqrt(timeToExpiryYears)
  const d1 = (Math.log(forward / strike) + 0.5 * sigmaSqrtTime * sigmaSqrtTime) / sigmaSqrtTime
  const nd1 = standardNormalCdf(d1)
  return optionType === 'call' ? nd1 : nd1 - 1
}
