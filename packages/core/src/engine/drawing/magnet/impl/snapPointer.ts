// 磁吸实现：采集候选 → 按屏幕距离选择 → 生成落点。
//
// 三段纯函数、无副作用：
// - 采集：OHLC、图元的线、指标值各自产出候选，候选自带可写回的领域值；
// - 选择：两档都按半径过滤，strong 的门槛更大，同距离按来源优先级与稳定 id 定序；
// - 应用：命中的时间锚点改写 X，否则 X 落 Bar 中心；价格取候选原值。
//
// 全部坐标是 Pane 局部逻辑像素，与命中、手柄、帧投影共用同一空间，调用方不再做偏移。

import type { DrawingViewportPort, PaneLayoutInfo } from '@/controllers/types.js'
import type { FrameCoordinates } from '@/foundation/geometry/frameCoordinates.js'
import type { KLineData } from '@/foundation/types/price.js'
import {
  type ActiveMagnetMode,
  MAGNET_RADIUS_STRONG,
  MAGNET_RADIUS_WEAK,
  MagnetMode,
  type MagnetSnapConfig,
  type SnapCandidate,
  type SnapLine,
  type SnapResult,
  SnapSource,
} from '../types.js'

/** 图元线与指标值优先于 OHLC：同距离时用户显式参照胜出。 */
const SOURCE_RANK: Readonly<Record<SnapSource, number>> = {
  [SnapSource.Drawing]: 0,
  [SnapSource.Indicator]: 0,
  [SnapSource.Bar]: 1,
}

/** 候选 + 与指针的距离，仅在选择阶段使用。 */
interface RankedCandidate {
  readonly candidate: SnapCandidate
  readonly distance: number
}

/**
 * 把指针吸附到候选集合里最近的一项。
 *
 * @param x 指针 Pane 局部 X
 * @param y 指针 Pane 局部 Y
 * @param pane 指针所在 Pane
 * @param adapter 视口与坐标换算
 * @param config 档位、候选源与排除集合
 * @returns 吸附落点；数据不可用或无法解析逻辑下标时返回 null
 */
export function snapPointer(
  x: number,
  y: number,
  pane: PaneLayoutInfo,
  adapter: DrawingViewportPort,
  config: MagnetSnapConfig,
): SnapResult | null {
  const data = adapter.getData()
  if (data.length === 0) return null

  const coordinates = adapter.getCoordinates(pane.paneId)
  if (!coordinates) return null
  const logicalIndex = coordinates.xToSlot(x)
  if (logicalIndex === null) return null
  const barIndex = Math.min(Math.max(logicalIndex, 0), data.length - 1)
  const bar = data[barIndex]
  if (bar === undefined) return null

  const barX = coordinates.logicalToX(barIndex)
  if (barX === null) return null
  const queryX = barX

  const candidates = collectCandidates({
    bar,
    barIndex,
    barX,
    queryX,
    coordinates,
    pane,
    config,
  })

  const candidate = selectCandidate(candidates, x, y, config.mode)

  return {
    // 时间锚点自带 X；其余候选共用 Bar 中心，保证同一 Bar 内时间戳一致。
    x: candidate !== null && candidate.time !== null ? candidate.x : barX,
    y: candidate !== null && candidate.price !== null ? candidate.y : y,
    candidate,
  }
}

/** 采集阶段的输入。 */
interface CollectInput {
  readonly bar: KLineData
  readonly barIndex: number
  readonly barX: number
  /** 求值使用已解析的 Bar 中心 X。 */
  readonly queryX: number
  readonly coordinates: FrameCoordinates
  readonly pane: PaneLayoutInfo
  readonly config: MagnetSnapConfig
}

/** 汇总三个候选源；顺序不影响结果（选择阶段有显式定序）。 */
function collectCandidates(input: CollectInput): SnapCandidate[] {
  return [
    ...collectLineCandidates(input),
    ...collectIndicatorCandidates(input),
    ...collectBarCandidates(input),
  ]
}

/**
 * OHLC 候选：两个档位都给四值，差异只在半径——weak 只收半径内的，
 * strong 无门槛。候选集合不随档位变化，避免「同一位置换个档位就吸不到」。
 */
function collectBarCandidates(input: CollectInput): SnapCandidate[] {
  const { bar, barIndex, barX, coordinates } = input
  const fields: ReadonlyArray<readonly [string, number]> = [
    ['high', bar.high],
    ['low', bar.low],
    ['open', bar.open],
    ['close', bar.close],
  ]
  return fields.flatMap(([field, price]) => {
    const y = coordinates.priceToY(price)
    return y === null
      ? []
      : [
          {
            x: barX,
            y,
            price,
            time: null,
            source: SnapSource.Bar,
            id: `bar:${barIndex}:${field}`,
          },
        ]
  })
}

/** 图元线候选：只在 Bar 中心 X 落在该线段区间内时求值，绘制范围之外不参与。 */
function collectLineCandidates(input: CollectInput): SnapCandidate[] {
  const { queryX, barX, pane, coordinates, config } = input
  const excluded = new Set(config.excludeDrawingIds)
  const candidates: SnapCandidate[] = []
  for (const line of config.sources.getLines(pane.paneId)) {
    if (excluded.has(line.drawingId)) continue
    const y = valueAtX(line, queryX)
    if (y === null) continue
    const price = line.price === undefined ? coordinates.yToPrice(y) : line.price
    if (price === null) continue
    candidates.push({
      x: barX,
      y,
      // 水平线段自带领域价格，直接写回原值；其余线段只能由 Y 反算。
      price,
      time: null,
      source: SnapSource.Drawing,
      id: `drawing:${line.drawingId}:${line.a.x}:${line.a.y}`,
    })
  }
  return candidates
}

/** 指标值候选：一条 plot 在当前逻辑下标的一个值。 */
function collectIndicatorCandidates(input: CollectInput): SnapCandidate[] {
  const { barIndex, barX, pane, coordinates, config } = input
  return config.sources.getIndicatorValues(pane.paneId, barIndex).flatMap((value) => {
    const y = coordinates.priceToY(value.value)
    return y === null
      ? []
      : [
          {
            x: barX,
            y,
            price: value.value,
            time: null,
            source: SnapSource.Indicator,
            id: `indicator:${value.id}`,
          },
        ]
  })
}

/**
 * 线在指定 X 处的 Y；X 不在线段区间内返回 null。
 *
 * 竖直线不提供价格值，因此不参与价格吸附。
 */
function valueAtX(line: SnapLine, x: number): number | null {
  const minX = Math.min(line.a.x, line.b.x)
  const maxX = Math.max(line.a.x, line.b.x)
  if (x < minX || x > maxX) return null
  const span = line.b.x - line.a.x
  if (span === 0) return null
  return line.a.y + ((line.b.y - line.a.y) * (x - line.a.x)) / span
}

/**
 * 从候选里选出最近的一项。
 *
 * 两个档位都按半径过滤，差别只在门槛大小：weak 精确瞄准，strong 允许余光去够。
 * 同距离时先比来源优先级，再比稳定 id——不用遍历顺序决定结果。
 */
function selectCandidate(
  candidates: ReadonlyArray<SnapCandidate>,
  x: number,
  y: number,
  mode: ActiveMagnetMode,
): SnapCandidate | null {
  const radius = mode === MagnetMode.Weak ? MAGNET_RADIUS_WEAK : MAGNET_RADIUS_STRONG
  const ranked: RankedCandidate[] = []
  for (const candidate of candidates) {
    const distance = distanceTo(candidate, x, y)
    if (distance > radius) continue
    ranked.push({ candidate, distance })
  }
  ranked.sort(compareRanked)
  return ranked[0]?.candidate ?? null
}

/** 点候选按二维距离，值线只比 Y，时间锚点只比 X。 */
function distanceTo(candidate: SnapCandidate, x: number, y: number): number {
  if (candidate.price !== null && candidate.time !== null)
    return Math.hypot(candidate.x - x, candidate.y - y)
  if (candidate.price !== null) return Math.abs(candidate.y - y)
  return Math.abs(candidate.x - x)
}

/** 距离 → 来源优先级 → 稳定 id。 */
function compareRanked(left: RankedCandidate, right: RankedCandidate): number {
  if (left.distance !== right.distance) return left.distance - right.distance
  const rank = SOURCE_RANK[left.candidate.source] - SOURCE_RANK[right.candidate.source]
  if (rank !== 0) return rank
  return left.candidate.id < right.candidate.id
    ? -1
    : left.candidate.id > right.candidate.id
      ? 1
      : 0
}
