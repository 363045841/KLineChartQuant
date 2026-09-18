/** 创建图元时的锚点物化：把输入锚点补齐为全部持久化锚点，之后只持久化坐标。 */

import type { DrawingKind, PersistedDrawingAnchor } from '../../foundation/plugin/index.js'

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
 * 第三个输入锚点一律只提供价格：第二条线的时间坐标由首两点决定，因此其时间被忽略。
 * @param kind 图元种类
 * @param anchors 用户输入的锚点，数量等于输入锚点数时才补齐
 * @param createAnchorId 派生锚点的 id 生成器
 * @returns 全部持久化锚点；无需补点时返回输入锚点副本
 */
export function materializeDrawingAnchors(
  kind: DrawingKind,
  anchors: ReadonlyArray<PersistedDrawingAnchor>,
  createAnchorId: () => string,
): PersistedDrawingAnchor[] {
  if (anchors.length !== getDrawingInputAnchorCount(kind)) return [...anchors]
  switch (kind) {
    case 'parallel-channel':
      return appendParallelAnchors(anchors, createAnchorId)
    case 'disjoint-channel':
      return appendDisjointAnchors(anchors, createAnchorId)
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

/**
 * 平行通道：第二条线与第一条线跨越同样的首两点时间、斜率相同。
 * 2 落在首点 X 上、价格取第三个输入点；3 落在次点 X 上，价格按第一条线的价格增量同向平移。
 */
function appendParallelAnchors(
  anchors: ReadonlyArray<PersistedDrawingAnchor>,
  createAnchorId: () => string,
): PersistedDrawingAnchor[] {
  const [first, second, third] = anchors
  if (!first || !second || !third) return [...anchors]
  return [
    first,
    second,
    pointAt(first, createAnchorId(), third.price),
    pointAt(second, createAnchorId(), third.price + (second.price - first.price)),
  ]
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
function appendDisjointAnchors(
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
