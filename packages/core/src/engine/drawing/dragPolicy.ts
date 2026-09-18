/** 绘图拖拽策略：拖动图元的某个锚点时，解析要一起移动的锚点及其位移系数。 */

import type { DrawingKind } from '../../foundation/plugin/index.js'
import { getLines } from './lines.js'

/** 锚点跟随位移的分量系数：1 同向、-1 反向、0 不跟随，缺省为 1。 */
export interface DragFollow {
  /** 时间轴（屏幕 X）位移系数。 */
  readonly time?: 1 | 0 | -1
  /** 价格轴（屏幕 Y）位移系数。 */
  readonly price?: 1 | 0 | -1
}

/** 一次锚点拖拽中要移动的锚点及其位移系数；follow 缺省表示两个分量都同向跟随。 */
export interface MovingAnchor {
  /** 移动的锚点下标。 */
  readonly index: number
  /** 各分量接受的位移系数。 */
  readonly follow?: DragFollow
}

/** 解析拖动某个锚点时一起移动的锚点；被拖锚点自身始终接受完整位移。 */
export type AnchorDragFollowers = (
  /** 被拖拽的锚点下标 */
  index: number,
) => readonly MovingAnchor[]

/** 只跟随时间轴，价格保持不动。 */
const FOLLOW_TIME_ONLY: DragFollow = { time: 1, price: 0 }

/** 只跟随价格轴，时间保持不动。 */
const FOLLOW_PRICE_ONLY: DragFollow = { time: 0, price: 1 }

/** 时间轴同向、价格轴反向的镜像跟随。 */
const FOLLOW_MIRRORED: DragFollow = { time: 1, price: -1 }

/** 不相交通道的同 X 配对：0↔3、1↔2（与创建期物化的第二条线方向一致）。 */
const DISJOINT_CHANNEL_X_PARTNERS: readonly number[] = [3, 2, 1, 0]

/** 缺省跟随：只动被拖锚点自身。 */
const onlyDraggedAnchor: AnchorDragFollowers = (index) => [{ index }]

/** 各图元的单点拖拽跟随规则；未登记的图元只动被拖锚点。 */
const anchorDragFollowers: Partial<Record<DrawingKind, AnchorDragFollowers>> = {
  /**
   * 平行通道的端点按角色跨线成对：0/2 为左端、1/3 为右端。
   * 拖动任一端点时，另一条线上的同角色端点按同一位移跟随，剩下两点固定，两条线向量始终相同。
   */
  'parallel-channel': (index) => {
    // 角色对固定为左端 {0,2} 与右端 {1,3}，按下标升序返回。
    const role = index % 2
    return [{ index: role }, { index: role + 2 }]
  },

  /**
   * 平滑顶底：0/1 为斜线端点，2/3 为水平线端点。
   * 同侧端点共享 X（0↔2、1↔3），水平线两端共享价格。
   */
  'flat-line': (index) => {
    if (index < 2) {
      return [{ index }, { index: index + 2, follow: FOLLOW_TIME_ONLY }]
    }
    // 水平线端点自由移动：斜线同侧端点只跟时间，水平线另一端只跟价格。
    return [
      { index },
      { index: index - 2, follow: FOLLOW_TIME_ONLY },
      { index: index === 2 ? 3 : 2, follow: FOLLOW_PRICE_ONLY },
    ]
  },

  /**
   * 不相交通道：0/1 为第一条线，2/3 为第二条线，同 X 配对为 0↔3、1↔2。
   * 拖动任一端点时，同 X 的伙伴跟随时间轴、价格反向，剩下两点固定，两条线始终保持同 X 且斜率互为相反数。
   */
  'disjoint-channel': (index) => [
    { index },
    { index: DISJOINT_CHANNEL_X_PARTNERS[index]!, follow: FOLLOW_MIRRORED },
  ],
}

/**
 * 解析拖动某个锚点时一起移动的锚点。
 * @param kind 被拖拽图元的种类
 * @param index 被拖拽的锚点下标
 */
export function resolveAnchorFollowers(kind: DrawingKind, index: number): readonly MovingAnchor[] {
  return (anchorDragFollowers[kind] ?? onlyDraggedAnchor)(index)
}

/**
 * 解析拖拽线段中点垂直手柄时一起上下移动的锚点对。
 * 两个锚点按同一价格增量移动、时间不变，因此该线只沿价格轴平移、形状不变。
 * @param kind 图元种类
 * @param lineIndex 线在 {@link getLines} 数组中的下标
 * @returns 锚点对；该线未开启垂直手柄时返回 null
 */
export function resolveVerticalHandleAnchors(
  kind: DrawingKind,
  lineIndex: number,
): readonly [from: number, to: number] | null {
  const line = getLines(kind)[lineIndex]
  return line?.verticalHandle ? [line.from, line.to] : null
}
