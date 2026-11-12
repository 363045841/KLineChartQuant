/**
 * 因果枢轴检测（swing / internal 两级）。
 *
 * 因果性定义：一个枢轴要在 `i + lookback` 根 bar 收盘之后才被确认，因为只有到那时
 * `[i - lookback, i + lookback]` 的极值关系才落定。所以 `confirmedBarIndex = i + lookback`，
 * 且该枢轴此后永不改变。
 *
 * 为什么不用居中窗口：`smart-money-concepts` #101 用居中窗口把 XAUUSD M15 的 PF
 * 从 1.82 吹到 7.32——那是拿未来数据换回测好看，不是找结构。
 */
import { PIVOT_KIND, type PivotKind, type PivotScale, type StructurePivot } from '../types.js'

/** 检测所需的最小 bar 形状；只读，不绑定具体行情结构。 */
export interface StructureBar {
  /** bar 起始时间（UTC 毫秒） */
  readonly openTime: number
  /** bar 收盘时间（UTC 毫秒） */
  readonly closeTime: number
  readonly high: number
  readonly low: number
  readonly close: number
}

/**
 * 判断某根 bar 在其窗口内是否为极值。
 *
 * 用严格不等号：平顶/平底不产枢轴。保守取向——宁可少认一个摆动点，
 * 也不要把平台整理里的抖动当成结构。
 *
 * @param bars bar 序列
 * @param index 待判定的 bar
 * @param lookback 两侧窗口
 * @param kind 取 high 还是 low
 * @returns 是否严格极值
 */
function isStrictExtreme(
  bars: readonly StructureBar[],
  index: number,
  lookback: number,
  kind: PivotKind,
): boolean {
  const value = kind === PIVOT_KIND.high ? bars[index].high : bars[index].low
  for (let offset = -lookback; offset <= lookback; offset += 1) {
    if (offset === 0) {
      continue
    }
    const other = kind === PIVOT_KIND.high ? bars[index + offset].high : bars[index + offset].low
    if (kind === PIVOT_KIND.high ? other >= value : other <= value) {
      return false
    }
  }
  return true
}

/**
 * 检测全部枢轴。
 *
 * @param bars 已收盘 bar，按时间升序
 * @param lookback 两侧各需要的 bar 数（>= 1）
 * @param scale 枢轴级别
 * @returns 按 barIndex 升序的枢轴（同一根 bar 可能同时是高点与低点枢轴时按 high、low 顺序各出一条）
 * @throws Error 窗口非法
 */
export function detectPivots(
  bars: readonly StructureBar[],
  lookback: number,
  scale: PivotScale,
): StructurePivot[] {
  if (!Number.isInteger(lookback) || lookback < 1) {
    throw new Error(`枢轴窗口必须是 >= 1 的整数，收到：${lookback}`)
  }
  const pivots: StructurePivot[] = []
  for (let index = lookback; index + lookback < bars.length; index += 1) {
    const confirmedBarIndex = index + lookback
    for (const kind of [PIVOT_KIND.high, PIVOT_KIND.low] as const) {
      if (!isStrictExtreme(bars, index, lookback, kind)) {
        continue
      }
      pivots.push({
        kind,
        scale,
        barIndex: index,
        time: bars[index].openTime,
        price: kind === PIVOT_KIND.high ? bars[index].high : bars[index].low,
        confirmedBarIndex,
        confirmedTime: bars[confirmedBarIndex].closeTime,
      })
    }
  }
  return pivots
}
