/**
 * CodeMirror 6 的 Vue 组合式封装：创建编辑器视图、双向同步文本、卸载时销毁。
 *
 * 脚本语言服务按需加载，源码是文档的唯一输入，关闭弹窗即释放当前语言会话。
 */
import { javascript } from '@codemirror/lang-javascript'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView } from 'codemirror'
import { type Ref, shallowRef, watch } from 'vue'
import { scriptEditorSetup } from './scriptEditor/impl/editorSetup.js'
import { scriptEditorTheme } from './scriptEditor/impl/editorTheme.js'

/** 在 host 元素上挂载编辑器，并把文档变化写回 value。 */
export function useCodeMirror(
  host: Ref<HTMLElement | null>,
  value: Ref<string>,
  onChange: (next: string) => void,
): {
  view: Ref<EditorView | null>
  languageLoading: Ref<boolean>
  languageError: Ref<string | null>
} {
  const view = shallowRef<EditorView | null>(null)
  const languageLoading = shallowRef(false)
  const languageError = shallowRef<string | null>(null)

  watch(
    host,
    (element, _previous, onCleanup) => {
      if (!element) return
      const language = new Compartment()
      let active = true
      let disposeLanguage: (() => void) | undefined
      /** 启动失败和运行中 Worker 错误共用同一条可见错误链路。 */
      const showLanguageError = (error: unknown) => {
        if (!active) return
        disposeLanguage?.()
        languageLoading.value = false
        const message = error instanceof Error ? error.message : String(error)
        languageError.value = `LSP 启动失败：${message}`
      }
      const instance = new EditorView({
        parent: element,
        state: EditorState.create({
          doc: value.value,
          extensions: [
            scriptEditorSetup,
            javascript(),
            scriptEditorTheme,
            EditorState.tabSize.of(2),
            language.of([]),
            EditorView.updateListener.of((update) => {
              if (update.docChanged) onChange(update.state.doc.toString())
            }),
          ],
        }),
      })
      view.value = instance
      languageLoading.value = true
      languageError.value = null
      // 初始化期间仍可编辑；挂载服务前再读取最新草稿，不用打开时的旧文本覆盖。
      void import('./scriptEditor/impl/languageSupport.js')
        .then(async ({ createScriptLanguageSupport }) => {
          if (!active) return
          const support = createScriptLanguageSupport(showLanguageError)
          disposeLanguage = support.dispose
          const extensions = await support.initialize(() => instance.state.doc.toString())
          if (!active) return
          instance.dispatch({ effects: language.reconfigure(extensions) })
        })
        .catch(showLanguageError)
        .finally(() => {
          if (active) languageLoading.value = false
        })
      onCleanup(() => {
        active = false
        disposeLanguage?.()
        instance.destroy()
        view.value = null
        languageLoading.value = false
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

  return { view, languageLoading, languageError }
}
