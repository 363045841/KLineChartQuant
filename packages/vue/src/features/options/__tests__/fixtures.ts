// 期权面板视图的公共测试替身：空关键位、空近月视图与可覆盖的样例视图。
//
// 解读句与结构判断两个用例共用同一份构造，避免同一套字段各写一遍。

import type { OptionLevelSetView, OptionNearTermView, OptionPanelView } from '../types.js'

/** 没有墙位与翻转位的一套空关键位。 */
export const EMPTY_LEVELS: OptionLevelSetView = {
  gammaFlipUsd: null,
  callWall: null,
  putWall: null,
  callGammaWall: null,
  putGammaWall: null,
  maxPainUsd: null,
  netGexUsdPerPercent: null,
  putCallOiRatio: null,
  totalOpenInterest: null,
  contractCount: null,
}

/** 空的近月视图：关键位之外补齐波动字段，避免用例漏字段后拼出 undefined。 */
export const EMPTY_NEAR_TERM: OptionNearTermView = {
  ...EMPTY_LEVELS,
  expiryIso: null,
  dteDays: null,
  atmIvPercent: null,
  sigmaLowerUsd: null,
  sigmaUpperUsd: null,
  sigma2LowerUsd: null,
  sigma2UpperUsd: null,
}

/**
 * 造一份面板视图，只声明与断言相关的字段。
 *
 * 默认场景：现价 67,144.55，翻转位 68,138.87（负 gamma），
 * Γ 加权墙 69,000 / 67,000，OI 墙 69,500 / 66,500。
 *
 * @param overrides 覆盖项
 * @returns 面板视图
 */
export function sampleView(overrides: Partial<OptionPanelView> = {}): OptionPanelView {
  return {
    currency: 'BTC',
    capturedAt: 1_764_000_000_000,
    spotIndex: 67_144.55,
    gammaFlipUsd: 68_138.87,
    gammaFlipSource: 'near-term',
    nearTerm: {
      ...EMPTY_NEAR_TERM,
      gammaFlipUsd: 68_138.87,
      callWall: { strike: 69_500, openInterest: 299.7 },
      putWall: { strike: 66_500, openInterest: 328.3 },
      callGammaWall: { strike: 69_000, gammaWeight: 1.2e-5 },
      putGammaWall: { strike: 67_000, gammaWeight: 1.4e-5 },
      maxPainUsd: 69_000,
      atmIvPercent: 32.01,
      dteDays: 0.91,
      sigmaLowerUsd: 66_133.48,
      sigmaUpperUsd: 68_349.85,
      expiryIso: '2026-11-15',
      putCallOiRatio: 0.918,
      netGexUsdPerPercent: -9_332_737.7,
    },
    allChain: { ...EMPTY_LEVELS },
    ...overrides,
  }
}
