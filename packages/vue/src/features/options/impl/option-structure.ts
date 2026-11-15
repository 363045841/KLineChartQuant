// 把期权面板的数字压成三行结构判断：基调、区间、注意。
//
// 与 `describeOptionLevels` 的分工：那句话给模型当输入摘要；这里给交易员看，
// 说清现价落在哪一段、上下边界在哪、哪两个口径在打架。全部是条件描述，不是预测。

import type { OptionPanelView } from '../types.js'

/** 三行结构判断。 */
export interface OptionStructureReading {
  /** 第一行：gamma 基调与波动含义 */
  readonly bias: string
  /** 第二行：关注区间与换基调的位置；没有可用的上下边界时为空串 */
  readonly zones: string
  /** 第三行起：需要留意的事项，最多三条 */
  readonly watch: readonly string[]
}

/** 现价上下的一个参考位。 */
interface ReferenceLevel {
  /** 价位 */
  readonly price: number
  /** 口径名，写进句子 */
  readonly label: string
}

/** 两墙差异达到该比例时提示「日内与结算焦点不一致」。 */
const WALL_CONFLICT_RATIO = 0.05

/** 现价距参考位小于该比例时视为「贴着」。 */
const TOUCH_RATIO = 0.005

/** 注意事项最多几条。 */
const MAX_WATCH_ITEMS = 3

/** 期权数据不可用时的占位。 */
const EMPTY: OptionStructureReading = {
  bias: '期权数据暂不可用。',
  zones: '',
  watch: [],
}

/**
 * 价格文本：千分位，最多两位小数。
 *
 * @param value 价格
 * @returns 可读文本
 */
function price(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

/**
 * 目标价相对现价的百分比文本。
 *
 * @param spot 现价
 * @param target 目标价
 * @returns 例如 `−4.70%`；方向由调用方写在句子里
 */
function percentOf(spot: number, target: number): string {
  const value = Math.abs(((target - spot) / spot) * 100)
  return `${value.toFixed(2)}%`
}

/**
 * 目标价在现价的方向。
 *
 * @param spot 现价
 * @param target 目标价
 * @returns `上方` / `下方` / `贴着`
 */
function sideOf(spot: number, target: number): string {
  if (Math.abs((target - spot) / spot) < TOUCH_RATIO) return '贴着'
  return target >= spot ? '上方' : '下方'
}

/**
 * 按相对现价的远近排序参考位。
 *
 * @param levels 参考位
 * @param descending true 表示由高到低（现价下方用），false 表示由低到高
 * @returns 排序后的新数组
 */
function sortedByDistance(levels: readonly ReferenceLevel[], descending: boolean): ReferenceLevel[] {
  return [...levels].sort((left, right) =>
    descending ? right.price - left.price : left.price - right.price,
  )
}

/**
 * 第一行：gamma 基调。
 *
 * 用标签代替教科书解释（「负 gamma · 顺势放大」），后面补净 GEX 与 DTE 两个量级，
 * 交易员扫一眼就知道现在处在放大区还是压制区、还剩几天。
 *
 * @param view 面板视图
 * @param spot 现价
 * @returns 一句话
 */
function buildBias(view: OptionPanelView, spot: number): string {
  const flip = view.gammaFlipUsd
  if (flip === null) {
    const walls = view.nearTerm.callGammaWall === null && view.nearTerm.putGammaWall === null
    return walls
      ? `现价 ${price(spot)}，本轮既没有翻转位也没有墙位，结构不可读。`
      : `现价 ${price(spot)}，本轮没有可用的翻转位，只能按墙位看结构。`
  }

  const regime = spot >= flip ? '正 gamma · 均值回归' : '负 gamma · 顺势放大'
  const facts: string[] = [regime]
  const netGex = view.nearTerm.netGexUsdPerPercent
  if (netGex !== null) facts.push(`净 GEX ${(netGex / 1e6).toFixed(1)}M`)
  const dte = view.nearTerm.dteDays
  if (dte !== null) facts.push(`DTE ${dte.toFixed(1)} 天`)

  const side = spot >= flip ? '上方' : '下方'
  return `现价 ${price(spot)} 在翻转位 ${price(flip)} ${side} ${percentOf(spot, flip)}（${facts.join(' · ')}）`
}

/**
 * 描述一个参考位。
 *
 * @param side 方向词（下方 / 上方）
 * @param level 参考位
 * @param spot 现价
 * @param remote 是否为同侧更远的那一条
 * @returns 一句短语
 */
function describeZone(
  side: string,
  level: ReferenceLevel,
  spot: number,
  remote: boolean,
): string {
  const rhythm = percentOf(spot, level.price)
  const signed = side === '下方' ? `−${rhythm}` : `+${rhythm}`
  const label = level.label === 'Gamma 翻转位' ? '反转界' : level.label
  if (remote) return `远端 ${label} ${price(level.price)}（${signed}）`
  const touching = Math.abs((level.price - spot) / spot) < TOUCH_RATIO
  return `${touching ? `${side}紧贴` : side} ${label} ${price(level.price)}（${signed}）`
}

/**
 * 第二行：走廊。
 *
 * 取最近的下侧与上侧参考位，再补同侧更远的一条（通常是对冲目标位）。
 * 交易员一眼能看到「上下边界在哪、再往外是什么」。
 *
 * @param view 面板视图
 * @param spot 现价
 * @returns 一句话；上下都没有参考位时返回空串
 */
function buildZones(view: OptionPanelView, spot: number): string {
  const flip = view.gammaFlipUsd
  const near = view.nearTerm
  const levels: ReferenceLevel[] = []
  if (flip !== null) levels.push({ price: flip, label: 'Gamma 翻转位' })
  if (near.putGammaWall !== null) {
    levels.push({ price: near.putGammaWall.strike, label: 'Put 对冲带' })
  }
  if (near.callGammaWall !== null) {
    levels.push({ price: near.callGammaWall.strike, label: 'Call 对冲带' })
  }

  const below = sortedByDistance(
    levels.filter((level) => level.price < spot),
    true,
  )
  const above = sortedByDistance(
    levels.filter((level) => level.price > spot),
    false,
  )
  const parts: string[] = []
  const nearestBelow = below[0]
  const nearestAbove = above[0]
  if (nearestBelow !== undefined) parts.push(describeZone('下方', nearestBelow, spot, false))
  if (nearestAbove !== undefined) parts.push(describeZone('上方', nearestAbove, spot, false))

  // 同侧更远的那条墙只补一条，优先取离现价更近的，避免句子变长。
  const farther = [below[1], above[1]]
    .filter((level): level is ReferenceLevel => level !== undefined)
    .sort((left, right) => Math.abs(left.price - spot) - Math.abs(right.price - spot))[0]
  if (farther !== undefined) {
    parts.push(describeZone(farther.price < spot ? '下方' : '上方', farther, spot, true))
  }
  return parts.length === 0 ? '' : parts.join('；')
}

/**
 * 两墙口径差异的提示。
 *
 * @param label 方向名（Call / Put）
 * @param gammaWall 加权墙价位
 * @param oiWall OI 墙价位
 * @returns 提示文本；差异不到阈值时为 null
 */
function wallConflict(
  label: string,
  gammaWall: number,
  oiWall: number,
): string | null {
  const smaller = Math.min(gammaWall, oiWall)
  if (!(smaller > 0)) return null
  if (Math.abs(gammaWall - oiWall) / smaller < WALL_CONFLICT_RATIO) return null
  const ratio = ((Math.abs(gammaWall - oiWall) / smaller) * 100).toFixed(1)
  return `${label} 两条墙相差 ${ratio}%（${price(gammaWall)} 对 ${price(oiWall)}），日内焦点与结算焦点不一致`
}

/**
 * 第三行起：注意事项。
 *
 * 按对交易员的重要性排序：贴着参考位、两墙冲突、到期临近、持仓与敞口矛盾。
 *
 * @param view 面板视图
 * @param spot 现价
 * @returns 最多三条
 */
function buildWatch(view: OptionPanelView, spot: number): readonly string[] {
  const near = view.nearTerm
  const items: string[] = []

  const nearest = [
    view.gammaFlipUsd,
    near.putGammaWall === null ? null : near.putGammaWall.strike,
    near.callGammaWall === null ? null : near.callGammaWall.strike,
  ]
    .filter((value): value is number => value !== null && value !== spot)
    .map((value) => ({ value, distance: Math.abs((value - spot) / spot) }))
    .sort((left, right) => left.distance - right.distance)[0]

  if (nearest !== undefined && nearest.distance < TOUCH_RATIO) {
    items.push(
      `现价${sideOf(spot, nearest.value)} ${price(nearest.value)}（${percentOf(spot, nearest.value)}），该位置对冲流最集中，破位后波动容易加速`,
    )
  }

  if (near.callGammaWall !== null && near.callWall !== null) {
    const conflict = wallConflict('Call', near.callGammaWall.strike, near.callWall.strike)
    if (conflict !== null) items.push(conflict)
  }
  if (near.putGammaWall !== null && near.putWall !== null) {
    const conflict = wallConflict('Put', near.putGammaWall.strike, near.putWall.strike)
    if (conflict !== null) items.push(conflict)
  }

  const dte = near.dteDays
  if (dte !== null && dte < 1) {
    items.push(`DTE ${dte.toFixed(2)} 天，临近到期，结算磁吸增强，墙位参考价值上升`)
  }

  const putCall = near.putCallOiRatio
  const netGex = near.netGexUsdPerPercent
  if (putCall !== null && netGex !== null) {
    const putDominantByOi = putCall >= 1
    const putDominantByGamma = netGex < 0
    if (putDominantByOi !== putDominantByGamma) {
      items.push(
        `持仓 P/C ${putCall.toFixed(2)} 与净 GEX ${(netGex / 1e6).toFixed(2)}M 方向不一致，两个口径在打架`,
      )
    }
  }

  return items.slice(0, MAX_WATCH_ITEMS)
}

/**
 * 生成三行结构判断。
 *
 * 只说结构与条件：现价在哪一段、离边界多远、破哪里换基调。不给方向概率，
 * 也不给入场、止损或目标价——那些需要历史检验支撑，目前没有。
 *
 * @param view 面板视图
 * @returns 三行结构判断
 */
export function describeOptionStructure(view: OptionPanelView): OptionStructureReading {
  const spot = view.spotIndex
  if (spot === null || !(spot > 0)) return EMPTY
  return {
    bias: buildBias(view, spot),
    zones: buildZones(view, spot),
    watch: buildWatch(view, spot),
  }
}
