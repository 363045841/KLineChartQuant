/** 使用真实 TypeScript 查询验证签名视图复用、参数强调与鼠标关闭行为。 */
import { EditorState, Transaction } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { scriptSyntaxHighlighting } from '../codePresentation.js'
import { createScriptLanguageWorker } from '../languageWorker.js'
import { scriptSignatureHelp } from '../scriptSignatureHelp.js'
import { SCRIPT_EDITOR_FILE } from '../types.js'

const views: EditorView[] = []

afterEach(() => {
  for (const view of views.splice(0)) view.destroy()
  document.body.replaceChildren()
})

/** 建立真实语言会话，保留与生产环境一致的文档同步和异步查询边界。 */
async function createEditor() {
  const worker = createScriptLanguageWorker()
  await worker.initialize()
  worker.updateFile({ path: SCRIPT_EDITOR_FILE, code: '' })
  const failures: Error[] = []
  const parent = document.createElement('div')
  document.body.append(parent)
  const view = new EditorView({
    parent,
    state: EditorState.create({
      extensions: [
        scriptSyntaxHighlighting,
        scriptSignatureHelp(
          {
            getSignatureHelp: async (path, position) => worker.getSignatureHelp(path, position),
          },
          (error) => failures.push(error),
        ),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            worker.updateFile({ path: SCRIPT_EDITOR_FILE, code: update.state.doc.toString() })
          }
        }),
      ],
    }),
  })
  views.push(view)
  return { view, failures }
}

/** 模拟输入事务并让光标跟随插入内容。 */
function type(view: EditorView, text: string) {
  const from = view.state.selection.main.head
  view.dispatch({ changes: { from, insert: text }, selection: { anchor: from + text.length } })
}

describe('script signature interaction', () => {
  it('连续输入复用提示与代码 DOM，同时移动当前参数强调', async () => {
    const { view, failures } = await createEditor()
    type(view, 'ta.sma(')
    await vi.waitFor(() => expect(view.dom.querySelector('.cm-script-signature')).not.toBeNull())
    const tooltip = view.dom.querySelector('.cm-script-signature')
    const code = tooltip?.querySelector('.cm-editor')
    type(view, 'close, ')
    // Worker 尚未响应时，提示仍留在 DOM 中。
    expect(view.dom.querySelector('.cm-script-signature')).toBe(tooltip)
    await vi.waitFor(() => {
      expect(
        [...view.dom.querySelectorAll('.cm-script-code-emphasis')]
          .map((span) => span.textContent)
          .join(''),
      ).toBe('length: number')
    })
    expect(tooltip?.querySelector('.cm-editor')).toBe(code)
    expect(failures).toEqual([])
  })

  it('鼠标点击关闭提示，并取消此前排队中的查询', async () => {
    const { view } = await createEditor()
    type(view, 'ta.sma(')
    view.dispatch({
      selection: { anchor: 2 },
      annotations: Transaction.userEvent.of('select.pointer'),
    })
    // 跨过微任务和实际查询返回，验证关闭不会被迟到响应撤销。
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    expect(view.dom.querySelector('.cm-script-signature')).toBeNull()
    view.dispatch({ selection: { anchor: view.state.doc.length } })
    type(view, 'close')
    await vi.waitFor(() => expect(view.dom.querySelector('.cm-script-signature')).not.toBeNull())
    view.dispatch({
      selection: { anchor: 0 },
      annotations: Transaction.userEvent.of('select.pointer'),
    })
    expect(view.dom.querySelector('.cm-script-signature')).toBeNull()
  })
})
