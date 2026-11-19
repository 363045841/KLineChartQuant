import type { PaneObjectGroup, PaneObjectRow } from '@363045841yyt/klinechart-core'
import { describe, expect, it } from 'vitest'
import { createNewPaneTarget, neighbourDropIndex, resolveDropIndex } from './object-tree-dnd.js'

/** 构造一行指标；对象树索引换算只关心身份与层带。 */
function row(objectId: string, band: PaneObjectRow['band'] = 'main'): PaneObjectRow {
  return {
    objectId,
    domainId: objectId,
    kind: 'indicator',
    label: objectId,
    paneId: 'main',
    band,
    z: 0,
    visible: true,
    locked: false,
    capabilities: {
      removable: true,
      hideable: true,
      orderable: true,
      movable: true,
      lockable: true,
    },
  }
}

function group(rows: PaneObjectRow[], paneId = 'main'): PaneObjectGroup {
  return { paneId, title: null, rows }
}

describe('object-tree-dnd', () => {
  it('把展示插入位置换算成层带内自底层起的位置', () => {
    const rows = group([row('a'), row('b'), row('c')])

    expect(resolveDropIndex(rows, 0, 'c', 'main')).toBe(2)
    expect(resolveDropIndex(rows, 3, 'a', 'main')).toBe(0)
  })

  it('只统计同一层带的行', () => {
    const rows = group([row('drawing', 'drawing'), row('a'), row('b')])

    expect(resolveDropIndex(rows, 0, 'b', 'main')).toBe(1)
  })

  it('上下移动一格返回展示插入位置，边界返回 null', () => {
    const rows = group([row('a'), row('b'), row('c')])

    expect(neighbourDropIndex(rows, rows.rows[1]!, 'up')).toBe(0)
    expect(neighbourDropIndex(rows, rows.rows[1]!, 'down')).toBe(3)
    expect(neighbourDropIndex(rows, rows.rows[0]!, 'up')).toBeNull()
    expect(neighbourDropIndex(rows, rows.rows[2]!, 'down')).toBeNull()
  })

  it('两端新窗口分别以首尾有内容的分组为锚点，方向与落点一致', () => {
    const groups = [group([row('a')], 'pane-1'), group([], 'pane-2'), group([row('b')], 'pane-3')]

    expect(createNewPaneTarget(groups, 'above')).toEqual({
      kind: 'newPane',
      anchorPaneId: 'pane-1',
      placement: 'above',
    })
    expect(createNewPaneTarget(groups, 'below')).toEqual({
      kind: 'newPane',
      anchorPaneId: 'pane-3',
      placement: 'below',
    })
  })

  it('没有可作锚点的分组时不生成新窗口目标', () => {
    expect(createNewPaneTarget([], 'above')).toBeNull()
    expect(createNewPaneTarget([group([], 'pane-1')], 'below')).toBeNull()
  })
})
