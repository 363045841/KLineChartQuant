/** 创建图元时的锚点物化：把输入锚点补齐为全部持久化锚点，之后只持久化坐标。 */

import { DRAWING_ERROR_CODES, KLineChartError } from '../../errors.js'
import type { DrawingKind, PersistedDrawingAnchor } from '../../foundation/plugin/index.js'

/** 物化派生锚点所需的时间轴能力；DrawingViewportPort 结构上满足该接口。 */
export interface DrawingAnchorTimeline {
  /** 当前绘制数据点。 */
  getDrawingData(): ReadonlyArray<{ timestamp: number }>
  /** 逻辑索引 → 时间戳；越界返回 null。 */
  getDrawingTimestampAtLogicalIndex(index: number): number | null
  /** 时间戳 → 逻辑索引。 */
  getLogicalIndexAtTimestamp(timestamp: number): number | null
}

/** 图元创建时用户输入的锚点数。 */
export function getDrawingInputAnchorCount(kind: DrawingKind): 1 | 2 | 3 {
  switch (kind) {
    case 'horizontal-line':
    case 'horizontal-ray':
    case 'vertical-line':
    case 'cross-line':
      return 1
    case 'parallel-channel':
    case 'flat-line':
    case 'disjoint-channel':
      return 3
    default:
      return 2
  }
}

/** 图元持久化后的完整锚点数。 */
export function getDrawingAnchorCount(kind: DrawingKind): 1 | 2 | 3 | 4 {
  switch (kind) {
    case 'parallel-channel':
    case 'flat-line':
    case 'disjoint-channel':
      return 4
    default:
      return getDrawingInputAnchorCount(kind)
  }
}

/**
 * 把创建输入的锚点补齐为全部持久化锚点。
 * @param anchors 用户输入的锚点，数量等于输入锚点数时才补齐
 * @param createAnchorId 派生锚点的 id 生成器
 * @param timeline 解析派生锚点时间坐标所需的时间轴能力
 * @returns 全部持久化锚点；无需补点时返回输入锚点副本
 */
export function materializeDrawingAnchors(
  kind: DrawingKind,
  anchors: ReadonlyArray<PersistedDrawingAnchor>,
  createAnchorId: () => string,
  timeline: DrawingAnchorTimeline,
): PersistedDrawingAnchor[] {
  if (anchors.length !== getDrawingInputAnchorCount(kind)) return [...anchors]
  switch (kind) {
    case 'parallel-channel':
      return appendTranslatedAnchor(kind, anchors, createAnchorId, timeline)
    case 'disjoint-channel':
      return appendDisjointChannelAnchors(anchors, createAnchorId)
    case 'flat-line':
      return appendFlatLineAnchors(anchors, createAnchorId)
    default:
      return [...anchors]
  }
}

/** 复制来源锚点的时间坐标（含未来槽位），按给定价格构造点锚点。 */
function pointAt(
  source: PersistedDrawingAnchor,
  id: string,
  price: number,
): PersistedDrawingAnchor {
  return { id, type: 'point', time: source.time, futureOffset: source.futureOffset, price }
}

/** 平行通道：第四点按首两点的逻辑索引差平移第三个输入点，价格同向相加。 */
function appendTranslatedAnchor(
  kind: DrawingKind,
  anchors: ReadonlyArray<PersistedDrawingAnchor>,
  createAnchorId: () => string,
  timeline: DrawingAnchorTimeline,
): PersistedDrawingAnchor[] {
  const [first, second, third] = anchors
  if (!first || !second || !third) return [...anchors]
  const firstIndex = resolveAnchorIndex(first, timeline)
  const secondIndex = resolveAnchorIndex(second, timeline)
  const thirdIndex = resolveAnchorIndex(third, timeline)
  if (firstIndex === null || secondIndex === null || thirdIndex === null) {
    throw new KLineChartError(
      DRAWING_ERROR_CODES.INVALID_ANCHOR,
      `Drawing kind '${kind}' cannot derive its fourth anchor from unresolvable anchors.`,
      { details: { kind } },
    )
  }
  const fourth = createPointAnchor(
    createAnchorId(),
    thirdIndex + (secondIndex - firstIndex),
    third.price + (second.price - first.price),
    timeline,
  )
  return [...anchors, fourth]
}

/** 平滑顶底：两个水平端点分别落在首两点的时间上，价格取第三个输入点。 */
function appendFlatLineAnchors(
  anchors: ReadonlyArray<PersistedDrawingAnchor>,
  createAnchorId: () => string,
): PersistedDrawingAnchor[] {
  const [first, second, third] = anchors
  if (!first || !second || !third) return [...anchors]
  return [
    first,
    second,
    pointAt(first, createAnchorId(), third.price),
    pointAt(second, createAnchorId(), third.price),
  ]
}

/**
 * 不相交通道：第二条线与第一条线跨越同样的首两点时间，斜率互为相反数。
 * 2 与次点同 X、价格取第三个输入点；3 与首点同 X，价格由第一条线的价格增量取反推出。
 */
function appendDisjointChannelAnchors(
  anchors: ReadonlyArray<PersistedDrawingAnchor>,
  createAnchorId: () => string,
): PersistedDrawingAnchor[] {
  const [first, second, third] = anchors
  if (!first || !second || !third) return [...anchors]
  return [
    first,
    second,
    pointAt(second, createAnchorId(), third.price),
    pointAt(first, createAnchorId(), third.price + (second.price - first.price)),
  ]
}

/** 解析锚点的逻辑索引，含未来槽位偏移。 */
function resolveAnchorIndex(
  anchor: PersistedDrawingAnchor,
  timeline: DrawingAnchorTimeline,
): number | null {
  const time = typeof anchor.time === 'string' ? Date.parse(anchor.time) : anchor.time
  if (time === undefined || !Number.isFinite(time)) return null
  const baseIndex = timeline.getLogicalIndexAtTimestamp(time)
  return baseIndex === null ? null : baseIndex + (anchor.futureOffset ?? 0)
}

/** 按逻辑索引和价格创建锚点；索引超出数据末尾时记为未来槽位。 */
function createPointAnchor(
  id: string,
  index: number,
  price: number,
  timeline: DrawingAnchorTimeline,
): PersistedDrawingAnchor {
  const lastIndex = timeline.getDrawingData().length - 1
  if (!Number.isInteger(index) || index < 0 || lastIndex < 0) {
    throw new KLineChartError(
      DRAWING_ERROR_CODES.INVALID_ANCHOR,
      `Derived drawing anchor index ${index} is outside the drawable range.`,
      { details: { index, lastIndex } },
    )
  }
  const timestamp = timeline.getDrawingTimestampAtLogicalIndex(Math.min(index, lastIndex))
  if (timestamp === null) {
    throw new KLineChartError(
      DRAWING_ERROR_CODES.INVALID_ANCHOR,
      `Derived drawing anchor index ${index} has no timestamp.`,
      { details: { index } },
    )
  }
  return {
    id,
    type: 'point',
    time: timestamp,
    ...(index > lastIndex ? { futureOffset: index - lastIndex } : {}),
    price,
  }
}
