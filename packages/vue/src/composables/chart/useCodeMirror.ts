/**
 * CodeMirror 6 的 Vue 组合式封装：创建编辑器视图、双向同步文本、卸载时销毁。
 *
 * 只负责编辑器生命周期与文本同步，不认识脚本语义；补全只提供脚本运行时注入的全局。
 */
import {
  autocompletion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete'
import { javascript } from '@codemirror/lang-javascript'
import { EditorState } from '@codemirror/state'
import { basicSetup, EditorView } from 'codemirror'
import { onBeforeUnmount, type Ref, shallowRef, watch } from 'vue'
import { scriptEditorTheme } from './scriptEditor/impl/editorTheme.js'

/** 脚本运行时注入的全局标识符。 */
const SCRIPT_GLOBALS = [
  'defineIndicator',
  'input',
  'open',
  'high',
  'low',
  'close',
  'volume',
  'time',
  'ta',
  'plot',
  'params',
]
/** ta 命名空间下的函数。 */
const TA_MEMBERS = ['sma', 'ema', 'rsi', 'highest', 'lowest', 'crossover', 'crossunder']

/** 为注入全局与 ta 成员提供补全。 */
function completions(context: CompletionContext): CompletionResult | null {
  const token = context.matchBefore(/[A-Za-z_][\w.]*/)
  if (!token || (token.from === token.to && !context.explicit)) return null
  if (token.text.startsWith('ta.')) {
    return {
      from: token.from + 'ta.'.length,
      options: TA_MEMBERS.map((label) => ({ label, type: 'method' })),
    }
  }
  return { from: token.from, options: SCRIPT_GLOBALS.map((label) => ({ label, type: 'variable' })) }
}

/** 在 host 元素上挂载编辑器，并把文档变化写回 value。 */
export function useCodeMirror(
  host: Ref<HTMLElement | null>,
  value: Ref<string>,
  onChange: (next: string) => void,
): { view: Ref<EditorView | null> } {
  const view = shallowRef<EditorView | null>(null)

  watch(
    host,
    (element, _previous, onCleanup) => {
      if (!element) return
      const instance = new EditorView({
        parent: element,
        state: EditorState.create({
          doc: value.value,
          extensions: [
            basicSetup,
            javascript(),
            scriptEditorTheme,
            EditorState.tabSize.of(2),
            autocompletion({ override: [completions] }),
            EditorView.updateListener.of((update) => {
              if (update.docChanged) onChange(update.state.doc.toString())
            }),
          ],
        }),
      })
      view.value = instance
      onCleanup(() => {
        instance.destroy()
        view.value = null
      })
    },
    { flush: 'post' },
  )

  // 外部以程序方式修改 value 时同步进文档，避免与用户输入互相覆盖。
  watch(value, (next) => {
    const instance = view.value
    if (!instance) return
    const current = instance.state.doc.toString()
    if (current === next) return
    instance.dispatch({ changes: { from: 0, to: current.length, insert: next } })
  })

  onBeforeUnmount(() => view.value?.destroy())

  return { view }
}
