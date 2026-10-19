/** 验证悬浮提示只为块级代码创建只读代码视图，行内 code 保持行内流。 */
import { EditorView } from '@codemirror/view'
import type { HoverInfo } from '@valtown/codemirror-ts'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { renderScriptHover } from '../renderScriptHover.js'

/** 构造最小 hover 信息；documentation 分段与 TypeScript 的返回结构一致。 */
function createHover(documentation: string): HoverInfo {
  return {
    start: 0,
    end: 0,
    typeDef: undefined,
    quickInfo: {
      kind: ts.ScriptElementKind.memberVariableElement,
      kindModifiers: ts.ScriptElementKindModifier.none,
      textSpan: { start: 0, length: 0 },
      displayParts: [{ text: 'security', kind: 'text' }],
      documentation: [{ text: documentation, kind: 'text' }],
      tags: [],
    },
  }
}

describe('script hover rendering', () => {
  it('行内 code 保持行内，块级代码才使用只读代码视图', () => {
    const parent = document.createElement('div')
    document.body.append(parent)
    const view = new EditorView({ parent, doc: '' })
    try {
      const tooltip = renderScriptHover(
        createHover('回调中的 `open`、`close` 都属于目标周期。\n\n```ts\nconst a = 1\n```\n'),
        view,
      )
      const codes = [...tooltip.dom.querySelectorAll('.cm-script-hover-documentation code')]
      const inline = codes.find((code) => code.closest('pre') === null)
      const block = codes.find((code) => code.closest('pre') !== null)
      // 行内 code 若被替换成代码视图，块级布局会强制每个标识符换行。
      expect(inline?.textContent).toBe('open')
      expect(inline?.querySelector('.cm-editor')).toBeNull()
      expect(block?.querySelector('.cm-editor')).not.toBeNull()
      tooltip.destroy?.()
    } finally {
      view.destroy()
      document.body.replaceChildren()
    }
  })
})
