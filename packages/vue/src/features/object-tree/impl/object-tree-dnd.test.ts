import type { PaneObjectGroup, PaneObjectRow } from '@363045841yyt/klinechart-core'
import { describe, expect, it } from 'vitest'
import { neighbourDropIndex, resolveDropIndex } from './object-tree-dnd.js'

/** 构造一行指标；对象树索引换算只关心身份与层带。 */
function row(objectId: string, band: PaneObjectRow['band'] = 'main'): PaneObjectRow {
  return {
    objectId,
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

function group(rows: PaneObjectRow[]): PaneObjectGroup {
  return { paneId: 'main', label: '主图', rows }
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
})
