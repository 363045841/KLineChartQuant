/** 用真实 CodeMirror 验证主编辑器和提示共用配色，以及参数更新时的视图复用。 */
import { typescriptLanguage } from '@codemirror/lang-javascript'
import { EditorView } from '@codemirror/view'
import { afterEach, describe, expect, it } from 'vitest'
import { createScriptCodeView } from '../impl/createScriptCodeView.js'
import { scriptEditorTheme } from '../impl/editorTheme.js'
import type { ScriptCodeView } from '../types.js'

const views: Array<Pick<ScriptCodeView, 'destroy'>> = []

afterEach(() => {
  for (const view of views.splice(0)) view.destroy()
  document.body.replaceChildren()
})

/** 读取实际渲染的语法分段，排除没有文字的编辑器占位节点。 */
function syntaxSpans(dom: HTMLElement) {
  return [...dom.querySelectorAll('.cm-line span')].map((span) => ({
    text: span.textContent,
    classes: [...span.classList].filter((name) => name !== 'cm-script-code-emphasis'),
  }))
}

describe('script code presentation', () => {
  it('主编辑器与只读提示使用相同的语法颜色分段', () => {
    const source = 'function calculate(source: number, length: number): number'
    const parent = document.createElement('div')
    document.body.append(parent)
    const editor = new EditorView({
      parent,
      doc: source,
      extensions: [typescriptLanguage, scriptEditorTheme],
    })
    const code = createScriptCodeView(parent, source)
    views.push(editor, code)
    expect(syntaxSpans(code.dom)).toEqual(syntaxSpans(editor.dom))
    expect(syntaxSpans(code.dom).length).toBeGreaterThan(0)
    expect(code.dom.querySelector('.cm-content')?.getAttribute('contenteditable')).toBe('false')
  })

  it('移动参数强调和更换签名时复用 DOM，并保留语法配色', () => {
    const parent = document.createElement('div')
    document.body.append(parent)
    const source = 'calculate(source: number, length: number): number'
    const code = createScriptCodeView(parent, source)
    views.push(code)
    const dom = code.dom
    const content = dom.querySelector('.cm-content')
    const originalColors = syntaxSpans(dom).flatMap((span) => span.classes)
    const from = source.indexOf('length')
    code.update(source, { from, to: from + 'length: number'.length })
    expect(
      [...dom.querySelectorAll('.cm-script-code-emphasis')]
        .map((span) => span.textContent)
        .join(''),
    ).toBe('length: number')
    expect(syntaxSpans(dom).flatMap((span) => span.classes)).toEqual(originalColors)
    code.update('other(value: string): void', { from: 6, to: 19 })
    expect(parent.querySelectorAll('.cm-editor')).toHaveLength(1)
    expect(code.dom).toBe(dom)
    expect(dom.querySelector('.cm-content')).toBe(content)
    expect(dom.querySelector('.cm-line')?.textContent).toBe('other(value: string): void')
    code.update('other(value: string): void')
    expect(dom.querySelector('.cm-script-code-emphasis')).toBeNull()
  })
})
