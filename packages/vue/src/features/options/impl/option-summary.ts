// 把期权面板压成一句解读：面板顶部的「快速解读」与 AI 面板的快捷提示共用同一句。

import type { OptionPanelView } from '../types.js'

/**
 * 价格文本：千分位，最多两位小数，避免 67144.55000000001 这种噪声。
 *
 * @param value 价格
 * @returns 可读文本
 */
function price(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

/**
 * 目标价相对现价的位置：上方 / 下方加百分比距离。
 *
 * @param spot 现价
 * @param target 目标价
 * @returns 位置描述
 */
function gap(spot: number, target: number): string {
  const percent = ((target - spot) / spot) * 100
  return `${percent >= 0 ? '上方' : '下方'} ${Math.abs(percent).toFixed(2)}%`
}

/**
 * 生成一句期权解读。
 *
 * 只说事实：现价与各关键位的相对位置、近月波动区间、P/C 比。不给方向判断——
 * 关键位是观察锚点，不是买卖信号。
 *
 * @param view 面板视图
 * @returns 一句话；没有现价时返回不可用提示
 */
export function describeOptionLevels(view: OptionPanelView): string {
  const spot = view.spotIndex
  if (spot === null || !(spot > 0)) return '期权数据暂不可用。'

  const parts: string[] = [`${view.currency} 现价 ${price(spot)}`]

  const flip = view.gammaFlipUsd
  if (flip === null) {
    parts.push('本轮没有可用的 Gamma 翻转位')
  } else {
    const regime =
      spot >= flip
        ? '正 gamma：做市商对冲压制波动，区间震荡更常见'
        : '负 gamma：做市商对冲放大波动，趋势更容易延续'
    parts.push(`Gamma 翻转 ${price(flip)} 在${gap(spot, flip)}（${regime}）`)
  }

  const walls: string[] = []
  // 墙位主口径是 OI×Γ 加权；老快照没有这个字段时这句就缺墙位，不拿 OI 墙顶替。
  const putWall = view.nearTerm.putGammaWall
  const callWall = view.nearTerm.callGammaWall
  if (putWall !== null) walls.push(`Put 墙 ${price(putWall.strike)} 在${gap(spot, putWall.strike)}`)
  if (callWall !== null) {
    walls.push(`Call 墙 ${price(callWall.strike)} 在${gap(spot, callWall.strike)}`)
  }
  if (walls.length > 0) parts.push(walls.join('、'))

  const maxPain = view.nearTerm.maxPainUsd
  if (maxPain !== null) parts.push(`最大痛点 ${price(maxPain)}`)

  const volatility: string[] = []
  const atmIv = view.nearTerm.atmIvPercent
  const dte = view.nearTerm.dteDays
  const lower = view.nearTerm.sigmaLowerUsd
  const upper = view.nearTerm.sigmaUpperUsd
  if (atmIv !== null) volatility.push(`近月 ATM IV ${atmIv.toFixed(1)}%`)
  if (dte !== null) volatility.push(`DTE ${dte.toFixed(2)} 天`)
  if (lower !== null && upper !== null) volatility.push(`±1σ ${price(lower)}–${price(upper)}`)
  if (volatility.length > 0) parts.push(volatility.join('，'))

  const putCall = view.nearTerm.putCallOiRatio
  if (putCall !== null) parts.push(`P/C ${putCall.toFixed(2)}`)

  return `${parts.join('；')}。`
}
