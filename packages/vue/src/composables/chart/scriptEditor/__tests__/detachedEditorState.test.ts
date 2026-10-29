/** 验证跨窗口确认乱序时不丢输入，以及保存和返回携带最终草稿。 */
import { describe, expect, it } from 'vitest'
import { createDetachedEditorState } from '../impl/detachedEditorState.js'
import type { DetachedEditorCommand, DetachedEditorSnapshot } from '../windowTypes.js'
import { createEditorTabState } from './helpers/editorTabState.js'

/** 生成宿主首次交接给新页面的已保存草稿。 */
function initialSnapshot(): DetachedEditorSnapshot {
  return {
    ...createEditorTabState(),
    title: '编辑脚本',
    source: 'const a = 1',
    trusted: true,
    editVersion: 0,
    identity: 'user',
    saving: false,
    saved: true,
    error: null,
    executionError: null,
    treeError: null,
    logs: [],
    theme: 'dark',
  }
}

describe('独立编辑器草稿', () => {
  it('草稿确认落后时仍然接收新输出', () => {
    const state = createDetachedEditorState(initialSnapshot(), () => {})
    state.updateSource('new draft')
    const logs = [
      { kind: 'log', level: 'info', time: 1, barIndex: 0, message: 'latest' },
    ] satisfies DetachedEditorSnapshot['logs']
    state.apply({ ...initialSnapshot(), logs })
    expect(state.snapshot.value.source).toBe('new draft')
    expect(state.snapshot.value.logs).toEqual(logs)
  })
  it('连续输入不等待宿主确认，迟到快照不会覆盖新输入或重新授予信任', () => {
    const sent: DetachedEditorCommand[] = []
    const state = createDetachedEditorState(initialSnapshot(), (message) => sent.push(message))
    state.updateSource('const a = 12')
    state.updateSource('const a = 123')
    state.apply({ ...initialSnapshot(), source: 'const a = 12', editVersion: 1 })
    expect(state.snapshot.value.source).toBe('const a = 123')
    expect(state.snapshot.value.trusted).toBe(false)
    expect(state.snapshot.value.saved).toBe(false)
    expect(sent.map((message) => message.editVersion)).toEqual([1, 2])
    state.apply({ ...state.snapshot.value, saving: true })
    expect(state.snapshot.value.saving).toBe(true)
  })

  it.each(['save', 'return', 'create-copy'] satisfies DetachedEditorCommand['type'][])(
    '%s 不依赖草稿确认，携带最新文本与信任状态',
    (type) => {
      const sent: DetachedEditorCommand[] = []
      const state = createDetachedEditorState(initialSnapshot(), (message) => sent.push(message))
      state.updateSource('const latest = 42')
      state.updateTrusted(true)
      state.command(type)
      expect(sent.at(-1)).toEqual({
        type,
        source: 'const latest = 42',
        trusted: true,
        editVersion: 2,
        activeTabId: 'test-tab',
      })
    },
  )
})
