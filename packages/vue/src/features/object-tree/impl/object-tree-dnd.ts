/**
 * 对象树拖拽与键盘移动的索引换算。
 *
 * 展示顺序是“上层在前”，领域 `index` 是“层带内自底层起”；两者在这里互换，
 * 并且只统计同一层带的行，跨层带的拖动无法表达成同一个序号。
 */

import type {
  PaneObjectGroup,
  PaneObjectRow,
  RenderObjectMoveTarget,
} from '@363045841yyt/klinechart-core'

/** 新建 Pane 的落位方向；取自移动目标契约，不另行声明字面量。 */
export type PaneDropSide = Extract<RenderObjectMoveTarget, { kind: 'newPane' }>['placement']

/** 新建 Pane 的对象移动目标；锚点与方向都由对象树落点决定。 */
export type NewPaneMoveTarget = Extract<RenderObjectMoveTarget, { kind: 'newPane' }>

/**
 * 把展示插入位置换算成领域插入位置。
 *
 * @param group 目标分组
 * @param displayIndex 展示顺序中的插入位置，0 表示最上层之前
 * @param objectId 被移动对象身份，计数时排除自身
 * @param band 被移动对象所属层带
 * @returns 同层带内自底层起的插入位置
 */
export function resolveDropIndex(
  group: PaneObjectGroup,
  displayIndex: number,
  objectId: string,
  band: PaneObjectRow['band'],
): number {
  const start = Math.max(0, Math.min(displayIndex, group.rows.length))
  return group.rows.slice(start).filter((row) => row.objectId !== objectId && row.band === band)
    .length
}

/**
 * 同层带内上移或下移一格后的展示插入位置。
 *
 * @param group 目标分组
 * @param row 被移动的行
 * @param direction 向上（更靠前）或向下（更靠后）
 * @returns 目标展示位置；已在边界时返回 null
 */
export function neighbourDropIndex(
  group: PaneObjectGroup,
  row: PaneObjectRow,
  direction: 'up' | 'down',
): number | null {
  const sameBand = group.rows.filter((item) => item.band === row.band)
  const position = sameBand.findIndex((item) => item.objectId === row.objectId)
  if (position < 0) return null
  const target = position + (direction === 'up' ? -1 : 1)
  if (target < 0 || target >= sameBand.length) return null
  const anchorIndex = group.rows.indexOf(sameBand[target]!)
  return direction === 'up' ? anchorIndex : anchorIndex + 1
}

/**
 * 生成对象的移动目标。
 *
 * @param group 目标分组
 * @param displayIndex 展示顺序中的插入位置
 * @param row 被移动的行
 * @returns 带 pane 身份与领域位置的移动目标
 */
export function createMoveTarget(
  group: PaneObjectGroup,
  displayIndex: number,
  row: PaneObjectRow,
): RenderObjectMoveTarget {
  return {
    kind: 'pane',
    paneId: group.paneId,
    index: resolveDropIndex(group, displayIndex, row.objectId, row.band),
  }
}

/**
 * 生成“在新 Pane 中放置对象”的移动目标。
 *
 * 顶部落点以首个有内容的分组为锚点在其上方新建，底部落点以末个分组为锚点在其下方新建；
 * 空分组不能作锚点，否则新窗口会挂在没有内容的容器上。
 *
 * @param groups 当前按 pane 分列的对象分组，顺序与面板一致
 * @param side 落点方向
 * @returns 新建 Pane 的移动目标；没有可作锚点的分组时返回 null
 */
export function createNewPaneTarget(
  groups: ReadonlyArray<PaneObjectGroup>,
  side: PaneDropSide,
): NewPaneMoveTarget | null {
  const anchor =
    side === 'above'
      ? groups.find((group) => group.rows.length > 0)
      : [...groups].reverse().find((group) => group.rows.length > 0)
  if (anchor === undefined) return null
  return { kind: 'newPane', anchorPaneId: anchor.paneId, placement: side }
}
