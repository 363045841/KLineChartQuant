/**
 * 结构快照装配：把枢轴、摆动点、破坏事件与偏向合成一份 `StructureSnapshot`。
 *
 * 装配本身不做判断，只做两件事：把各级别的检测结果按时间合并，以及把「哪些事实在
 * `confirmedUpTo` 之前已确认」过滤掉未确认项。任何消费方拿到的快照都不含未来数据。
 */
import type { KLinePeriod } from '../../../data/provider/types.js'
import {
  BIAS_BASIS,
  BREAK_DIRECTION,
  PIVOT_KIND,
  STRUCTURE_BIAS,
  type StructureBiasState,
  type StructureBreak,
  type StructurePivot,
  type StructureQuality,
  type StructureSnapshot,
  type StructureSwing,
  SWING_LABEL,
} from '../types.js'
import { detectBreaks } from './breaks.js'
import { detectPivots, type StructureBar } from './pivots.js'

/** 装配输入。 */
export interface BuildStructureSnapshotInput {
  /** 品种标识，形如 `binance:spot:BTCUSDT` */
  readonly instrumentId: string
  readonly timeframe: KLinePeriod
  /** 已收盘 bar，按时间升序 */
  readonly bars: readonly StructureBar[]
  /** 主级别枢轴窗口 */
  readonly swingLookback: number
  /** 次级别枢轴窗口，必须小于等于主级别窗口 */
  readonly internalLookback: number
}

/**
 * 给枢轴序列打 HH/HL/LH/LL 标签。
 *
 * 每个枢轴只与「上一个同类枢轴」比较，因此标签是局部的、因果的，不需要全序列重算。
 *
 * @param pivots 按 barIndex 升序的枢轴
 * @returns 按时间升序的摆动点
 */
function buildSwings(pivots: readonly StructurePivot[]): StructureSwing[] {
  const swings: StructureSwing[] = []
  let lastHigh: StructurePivot | null = null
  let lastLow: StructurePivot | null = null
  for (const pivot of pivots) {
    if (pivot.kind === PIVOT_KIND.high) {
      const label =
        lastHigh === null || pivot.price > lastHigh.price
          ? SWING_LABEL.higherHigh
          : SWING_LABEL.lowerHigh
      swings.push({
        label,
        pivot,
        referenceTime: lastHigh === null ? null : lastHigh.time,
        delta: lastHigh === null ? null : pivot.price - lastHigh.price,
      })
      lastHigh = pivot
      continue
    }
    const label =
      lastLow === null || pivot.price > lastLow.price ? SWING_LABEL.higherLow : SWING_LABEL.lowerLow
    swings.push({
      label,
      pivot,
      referenceTime: lastLow === null ? null : lastLow.time,
      delta: lastLow === null ? null : pivot.price - lastLow.price,
    })
    lastLow = pivot
  }
  return swings
}

/**
 * 由最近一次破坏推导偏向。
 *
 * @param lastBos 最近一次 BOS
 * @param lastChoch 最近一次 CHoCH
 * @returns 偏向状态
 */
function buildBias(
  lastBos: StructureBreak | null,
  lastChoch: StructureBreak | null,
): StructureBiasState {
  const last =
    lastBos === null
      ? lastChoch
      : lastChoch === null
        ? lastBos
        : lastBos.barIndex > lastChoch.barIndex
          ? lastBos
          : lastChoch
  if (last === null) {
    return {
      direction: STRUCTURE_BIAS.unknown,
      basis: BIAS_BASIS.none,
      sinceTime: null,
      sinceBreak: null,
    }
  }
  return {
    direction: last.direction === BREAK_DIRECTION.up ? STRUCTURE_BIAS.bull : STRUCTURE_BIAS.bear,
    basis: last.kind === 'bos' ? BIAS_BASIS.bos : BIAS_BASIS.choch,
    sinceTime: last.time,
    sinceBreak: last,
  }
}

/**
 * 装配一份结构快照。
 *
 * @param input 品种、周期、bar 与窗口参数
 * @returns 结构快照
 * @throws Error 窗口非法或次级别窗口大于主级别窗口
 */
export function buildStructureSnapshot(input: BuildStructureSnapshotInput): StructureSnapshot {
  const { bars, swingLookback, internalLookback } = input
  if (internalLookback > swingLookback) {
    throw new Error(
      `次级别窗口不得大于主级别窗口：internal=${internalLookback}, swing=${swingLookback}`,
    )
  }
  const confirmedUpTo = bars.length - 1
  const swingPivots = detectPivots(bars, swingLookback, 'swing')
  const internalPivots =
    internalLookback === swingLookback ? [] : detectPivots(bars, internalLookback, 'internal')
  const pivots = [...swingPivots, ...internalPivots].sort(
    (left, right) => left.barIndex - right.barIndex,
  )
  const breaks = detectBreaks(bars, swingPivots, 'swing')

  const lastBos = [...breaks].reverse().find((item) => item.kind === 'bos') ?? null
  const lastChoch = [...breaks].reverse().find((item) => item.kind === 'choch') ?? null

  const quality: StructureQuality = {
    barsUsed: bars.length,
    requiredBars: Math.max(swingLookback * 2 + 1, 30),
    sufficient: bars.length >= Math.max(swingLookback * 2 + 1, 30),
    limitations: ['结构区（FVG / Order Block）尚未实现，zones 恒为空'],
  }

  return {
    instrumentId: input.instrumentId,
    timeframe: input.timeframe,
    asOf: bars.length === 0 ? 0 : bars[bars.length - 1].closeTime,
    lastClosedBarTime: bars.length === 0 ? 0 : bars[bars.length - 1].closeTime,
    confirmedUpTo,
    pivots: pivots.filter((pivot) => pivot.confirmedBarIndex <= confirmedUpTo),
    swings: buildSwings(pivots),
    lastBos,
    lastChoch,
    zones: [],
    bias: buildBias(lastBos, lastChoch),
    quality,
  }
}
