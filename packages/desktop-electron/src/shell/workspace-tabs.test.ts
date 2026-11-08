/**
 * 标签顺序的纯函数回归：只验证位置计算，不触碰 IndexedDB 与 Vue。
 */
import { describe, expect, it } from 'vitest'

import type { WorkspaceTab } from '../../electron/window-bridge'
import { reorderTabs } from './workspace-tabs'

/** 造一批只带身份的标签，顺序即参数顺序。 */
function tabs(...ids: string[]): ReadonlyArray<WorkspaceTab> {
  return ids.map((id) => ({ id, label: id.toUpperCase(), spec: null }))
}

/** 取出 id 序列，便于比对顺序。 */
function ids(value: ReadonlyArray<WorkspaceTab>): string[] {
  return value.map((tab) => tab.id)
}

describe('reorderTabs', () => {
  it('把标签向后移动', () => {
    expect(ids(reorderTabs(tabs('a', 'b', 'c'), 'a', 'b', 'after'))).toEqual(['b', 'a', 'c'])
  })

  it('把标签向前移动', () => {
    expect(ids(reorderTabs(tabs('a', 'b', 'c'), 'c', 'a', 'before'))).toEqual(['c', 'a', 'b'])
  })

  it('插到末尾', () => {
    expect(ids(reorderTabs(tabs('a', 'b', 'c'), 'b', 'c', 'after'))).toEqual(['a', 'c', 'b'])
  })

  it.each([
    ['落点是自己', 'a', 'a', 'before'],
    ['被移动的标签不存在', 'x', 'a', 'before'],
    ['落点标签不存在', 'a', 'x', 'after'],
    ['位置没有实际变化', 'b', 'c', 'before'],
  ] as const)('%s时原样返回，调用方据此跳过落盘', (_label, tabId, targetId, placement) => {
    const source = tabs('a', 'b', 'c')

    expect(reorderTabs(source, tabId, targetId, placement)).toBe(source)
  })
})
