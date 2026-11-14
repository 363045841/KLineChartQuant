// 期权序列响应解析：把 8093 `/options/series` 的 JSON 收成只读视图。
//
// 服务端字段缺失是常态（例如某天没有 gamma 翻转），所以这里逐字段降级成 null，
// 只在整体结构不对时返回 null；用类型断言换来的「看起来有值」比报错更难查。

import type {
  OptionGammaWallView,
  OptionLevelSetView,
  OptionNearTermView,
  OptionPanelView,
  OptionWallView,
} from '../types.js'

/** 判断是否为普通对象。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 读取有限数字；缺失或非数字返回 null。 */
function numberOf(source: unknown, key: string): number | null {
  if (!isRecord(source)) return null
  const value = source[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** 读取字符串；缺失返回 null。 */
function textOf(source: unknown, key: string): string | null {
  if (!isRecord(source)) return null
  const value = source[key]
  return typeof value === 'string' ? value : null
}

/** 读取嵌套对象；不是对象时返回 null。 */
function recordOf(source: unknown, key: string): Record<string, unknown> | null {
  if (!isRecord(source)) return null
  const value = source[key]
  return isRecord(value) ? value : null
}

/**
 * 解析一个墙位。
 *
 * @param source 关键位所在对象
 * @param key 字段名（callWall / putWall）
 * @returns 墙位；缺行权价或持仓时返回 null
 */
function wallOf(source: unknown, key: string): OptionWallView | null {
  const wall = recordOf(source, key)
  const strike = numberOf(wall, 'strike')
  const openInterest = numberOf(wall, 'openInterest')
  if (strike === null || openInterest === null) return null
  return { strike, openInterest }
}

/**
 * 解析一个 Gamma 加权墙位。
 *
 * @param source 关键位所在对象
 * @param key 字段名（callGammaWall / putGammaWall）
 * @returns 加权墙位；缺行权价或权重时返回 null
 */
function gammaWallOf(source: unknown, key: string): OptionGammaWallView | null {
  const wall = recordOf(source, key)
  const strike = numberOf(wall, 'strike')
  const gammaWeight = numberOf(wall, 'gammaWeight')
  if (strike === null || gammaWeight === null) return null
  return { strike, gammaWeight }
}

/**
 * 解析一套关键位。
 *
 * @param source 近月或全链对象
 * @returns 关键位视图
 */
function levelSetOf(source: unknown): OptionLevelSetView {
  return {
    gammaFlipUsd: numberOf(source, 'gammaFlipUsd'),
    callWall: wallOf(source, 'callWall'),
    putWall: wallOf(source, 'putWall'),
    callGammaWall: gammaWallOf(source, 'callGammaWall'),
    putGammaWall: gammaWallOf(source, 'putGammaWall'),
    maxPainUsd: numberOf(source, 'maxPainUsd'),
    netGexUsdPerPercent: numberOf(source, 'netGexUsdPerPercent'),
    putCallOiRatio: numberOf(source, 'putCallOiRatio'),
    totalOpenInterest: numberOf(source, 'totalOpenInterest'),
    contractCount: numberOf(source, 'contractCount'),
  }
}

/**
 * 解析近月视图：关键位之外多带波动字段。
 *
 * @param source 近月对象
 * @returns 近月视图
 */
function nearTermOf(source: unknown): OptionNearTermView {
  return {
    ...levelSetOf(source),
    expiryIso: textOf(source, 'expiryIso'),
    dteDays: numberOf(source, 'dteDays'),
    atmIvPercent: numberOf(source, 'atmIvPercent'),
    sigmaLowerUsd: numberOf(source, 'sigmaLowerUsd'),
    sigmaUpperUsd: numberOf(source, 'sigmaUpperUsd'),
    sigma2LowerUsd: numberOf(source, 'sigma2LowerUsd'),
    sigma2UpperUsd: numberOf(source, 'sigma2UpperUsd'),
  }
}

/**
 * 解析一次序列响应，取最后一行的快照。
 *
 * @param raw 响应原文解析后的值
 * @returns 面板视图；没有行或缺少采集时刻与标的时返回 null
 */
export function parseOptionSeries(raw: unknown): OptionPanelView | null {
  const rows = isRecord(raw) ? raw.rows : undefined
  if (!Array.isArray(rows) || rows.length === 0) return null
  const last: unknown = rows[rows.length - 1]
  if (!isRecord(last)) return null
  const capturedAt = numberOf(last, 'capturedAt')
  const currency = textOf(last, 'currency')
  if (capturedAt === null || currency === null) return null
  const gammaFlip = recordOf(last, 'gammaFlip')
  const mainFlip = numberOf(gammaFlip, 'gammaFlipUsd') ?? numberOf(last, 'gammaFlipUsd')
  return {
    currency,
    capturedAt,
    spotIndex: numberOf(last, 'spotIndex'),
    nearTerm: nearTermOf(recordOf(last, 'nearTerm')),
    allChain: levelSetOf(recordOf(last, 'allChain')),
    gammaFlipUsd: mainFlip,
    gammaFlipSource: textOf(gammaFlip, 'source'),
  }
}
