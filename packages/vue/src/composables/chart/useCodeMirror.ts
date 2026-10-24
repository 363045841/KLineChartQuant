/**
 * CodeMirror 6 的 Vue 组合式封装：创建编辑器视图、双向同步文本、卸载时销毁。
 *
 * 脚本语言服务按需加载，源码是文档的唯一输入，关闭弹窗即释放当前语言会话。
 */
import { javascript } from '@codemirror/lang-javascript'
import { forEachDiagnostic, setDiagnosticsEffect } from '@codemirror/lint'
import { Compartment, EditorState, Transaction } from '@codemirror/state'
import { EditorView } from 'codemirror'
import { computed, type Ref, shallowRef, watch } from 'vue'
import { useDeviceEnvironment } from '../useDeviceEnvironment.js'
import { scriptEditorSetup } from './scriptEditor/impl/editorSetup.js'
import { scriptEditorTheme } from './scriptEditor/impl/editorTheme.js'
import { scriptEditorContextMenu } from './scriptEditor/impl/editorContextMenu.js'
import type { ScriptEditorProblem } from './scriptEditor/types.js'

/** 在 host 元素上挂载编辑器，并把文档变化写回 value。 */
export function useCodeMirror(
  host: Ref<HTMLElement | null>,
  value: Ref<string>,
  onChange: (next: string) => void,
  editable: Readonly<Ref<boolean>>,
): {
  view: Ref<EditorView | null>
  languageLoading: Ref<boolean>
  languageError: Ref<string | null>
  diagnostics: Readonly<Ref<readonly ScriptEditorProblem[]>>
  revealProblem(problem: ScriptEditorProblem): void
  formatAvailable: Readonly<Ref<boolean>>
  formatDocument(): Promise<void>
} {
  const view = shallowRef<EditorView | null>(null)
  const languageLoading = shallowRef(false)
  const languageError = shallowRef<string | null>(null)
  const diagnostics = shallowRef<readonly ScriptEditorProblem[]>([])

  /** 从问题列表定位当前文档范围，即使只读也允许选中和滚动。 */
  function revealProblem(problem: ScriptEditorProblem): void {
    const instance = view.value
    if (!instance || !problem.location) return
    const from = Math.min(problem.location.from, instance.state.doc.length)
    const to = Math.max(from, Math.min(problem.location.to, instance.state.doc.length))
    instance.dispatch({
      selection: { anchor: from, head: to },
      effects: EditorView.scrollIntoView(from, { y: 'center' }),
    })
    instance.focus()
  }
  const device = useDeviceEnvironment()
  // formFactors 结算前不启动 Worker，避免把平板误当成桌面后再销毁。
  const languageEnabled = computed(
    () => device.value.resolved && device.value.deviceType === 'desktop',
  )
  const languageReady = shallowRef(false)
  const formatAvailable = computed(
    () => languageEnabled.value && languageReady.value && editable.value && !languageError.value,
  )
  const editing = new Compartment()
  let languageSupport:
    | ReturnType<
        typeof import('@363045841yyt/klinechart-script-server').createScriptLanguageSupport
      >
    | undefined
  /** 仅应用当前文档的格式化结果，保留撤销能力和光标映射。 */
  async function formatDocument(): Promise<void> {
    const instance = view.value
    const support = languageSupport
    if (!instance || !support || !formatAvailable.value) return
    const original = instance.state.doc
    try {
      const edits = await support.formatDocument(original.toString())
      if (
        view.value !== instance ||
        languageSupport !== support ||
        instance.state.doc !== original ||
        !formatAvailable.value
      )
        return
      instance.dispatch({
        changes: edits.map(({ span, newText }) => ({
          from: span.start,
          to: span.start + span.length,
          insert: newText,
        })),
        annotations: Transaction.userEvent.of('input.format'),
      })
      instance.focus()
    } catch (error) {
      if (languageSupport !== support) return
      languageError.value = `格式化失败：${error instanceof Error ? error.message : String(error)}`
    }
  }

  watch(
    host,
    (element, _previous, onCleanup) => {
      if (!element) return
      const language = new Compartment()
      const instance = new EditorView({
        parent: element,
        state: EditorState.create({
          doc: value.value,
          extensions: [
            scriptEditorSetup,
            javascript({ typescript: true }),
            scriptEditorTheme,
            scriptEditorContextMenu(() => languageSupport, () => editable.value),
            EditorState.tabSize.of(2),
            editing.of([
              EditorState.readOnly.of(!editable.value),
              EditorView.editable.of(editable.value),
            ]),
            language.of([]),
            EditorView.updateListener.of((update) => {
              if (update.docChanged && editable.value) onChange(update.state.doc.toString())
              // 读取 CodeMirror 已接收、已映射到当前文档的诊断，不另起一轮 LSP 查询。
              if (
                update.docChanged ||
                update.transactions.some(
                  (transaction) =>
                    transaction.reconfigured ||
                    transaction.effects.some((effect) => effect.is(setDiagnosticsEffect)),
                )
              ) {
                const next: ScriptEditorProblem[] = []
                forEachDiagnostic(update.state, (diagnostic, from, to) => {
                  const line = update.state.doc.lineAt(from)
                  next.push({
                    severity: diagnostic.severity,
                    message: diagnostic.message,
                    source: diagnostic.source,
                    location: { from, to, line: line.number, column: from - line.from + 1 },
                  })
                })
                diagnostics.value = next
              }
            }),
          ],
        }),
      })
      view.value = instance
      // 服务独立于视图启停；移动设备在动态 import 前退出，保留基本编辑和高亮。
      const stopLanguage = watch(
        languageEnabled,
        (enabled, _old, cleanup) => {
          languageError.value = null
          if (!enabled) return
          let active = true
          let disposeLanguage: (() => void) | undefined
          /** 启动失败和运行中 Worker 错误共用同一条可见错误链路。 */
          const showLanguageError = (error: unknown) => {
            if (!active) return
            disposeLanguage?.()
            languageSupport = undefined
            languageReady.value = false
            languageLoading.value = false
            instance.dispatch({ effects: language.reconfigure([]) })
            const message = error instanceof Error ? error.message : String(error)
            languageError.value = `LSP 启动失败：${message}`
            diagnostics.value = []
          }
          languageLoading.value = true
          // 挂载前读取最新草稿，不用打开时的旧文本覆盖初始化期间的编辑。
          void import('@363045841yyt/klinechart-script-server')
            .then(async ({ createScriptLanguageSupport }) => {
              if (!active) return
              const support = createScriptLanguageSupport(showLanguageError)
              disposeLanguage = support.dispose
              const extensions = await support.initialize(() => instance.state.doc.toString())
              if (!active) return
              languageSupport = support
              languageReady.value = true
              instance.dispatch({ effects: language.reconfigure(extensions) })
            })
            .catch(showLanguageError)
            .finally(() => {
              if (active) languageLoading.value = false
            })
          cleanup(() => {
            active = false
            languageSupport = undefined
            languageReady.value = false
            languageLoading.value = false
            disposeLanguage?.()
            instance.dispatch({ effects: language.reconfigure([]) })
            diagnostics.value = []
          })
        },
        { immediate: true, flush: 'sync' },
      )
      onCleanup(() => {
        stopLanguage()
        instance.destroy()
        view.value = null
        diagnostics.value = []
        languageLoading.value = false
      })
    },
    { flush: 'post' },
  )

  // 外部以程序方式修改 value 时同步进文档，避免与用户输入互相覆盖。
  watch(editable, (next) => {
    view.value?.dispatch({
      effects: editing.reconfigure([EditorState.readOnly.of(!next), EditorView.editable.of(next)]),
    })
  })
  watch(value, (next) => {
    const instance = view.value
    if (!instance) return
    const current = instance.state.doc.toString()
    if (current === next) return
    instance.dispatch({ changes: { from: 0, to: current.length, insert: next } })
  })

  return {
    view,
    languageLoading,
    languageError,
    diagnostics,
    revealProblem,
    formatAvailable,
    formatDocument,
  }
}
