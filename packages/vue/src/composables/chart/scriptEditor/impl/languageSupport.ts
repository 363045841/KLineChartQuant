/** 装配现成 CodeMirror 类型适配并管理独立语言 Worker 的生命周期。 */
import { javascriptLanguage } from '@codemirror/lang-javascript'
import { type Extension, StateEffect, StateField } from '@codemirror/state'
import { EditorView, showTooltip, type Tooltip, ViewPlugin } from '@codemirror/view'
import {
  tsAutocompleteWorker,
  tsFacetWorker,
  tsHoverWorker,
  tsLinterWorker,
  tsSyncWorker,
} from '@valtown/codemirror-ts'
import { type Remote, releaseProxy, wrap } from 'comlink'
import { SCRIPT_EDITOR_FILE, type ScriptLanguageWorker } from '../types.js'
import ScriptLanguageWorkerConstructor from './scriptLanguage.worker?worker&inline'

const signatureEffect = StateEffect.define<Tooltip | null>()
const signatureField = StateField.define<Tooltip | null>({
  create: () => null,
  update(value, transaction) {
    if (transaction.docChanged || transaction.selection) value = null
    for (const effect of transaction.effects) {
      if (effect.is(signatureEffect)) value = effect.value
    }
    return value
  },
  provide: (field) => showTooltip.from(field),
})

/** 查询签名并忽略已过期的响应；实际调用识别和参数列表由 TypeScript 提供。 */
function signatureHints(worker: Remote<ScriptLanguageWorker>): Extension {
  return ViewPlugin.define((view) => {
    let revision = 0
    let disposed = false
    /** 光标或文本变化时获取当前函数签名。 */
    async function updateSignature(): Promise<void> {
      const request = ++revision
      const state = view.state
      const position = state.selection.main.head
      const signature = await worker.getSignatureHelp(SCRIPT_EDITOR_FILE, position)
      if (
        disposed ||
        revision !== request ||
        view.state.doc !== state.doc ||
        view.state.selection.main.head !== position
      )
        return
      view.dispatch({
        effects: signatureEffect.of(
          signature
            ? {
                pos: position,
                above: true,
                create() {
                  const dom = document.createElement('div')
                  dom.className = 'cm-script-signature'
                  dom.textContent = signature
                  return { dom }
                },
              }
            : null,
        ),
      })
    }
    return {
      update(update) {
        if (!update.docChanged && !update.selectionSet) return
        // ViewPlugin 先于文档同步监听器执行，微任务保证 Worker 先收到新文档。
        queueMicrotask(() => {
          if (!disposed) void updateSignature()
        })
      },
      destroy() {
        disposed = true
      },
    }
  })
}

/** 为当前编辑器创建服务；dispose 在初始化尚未结束时也能终止 Worker。 */
export function createScriptLanguageSupport(onFailure: (error: Error) => void) {
  const innerWorker = new ScriptLanguageWorkerConstructor()
  const worker = wrap<ScriptLanguageWorker>(innerWorker)
  let disposed = false
  let initialized = false
  let rejectFailure: (error: Error) => void = () => {}
  const failed = new Promise<never>((_resolve, reject) => {
    rejectFailure = reject
  })
  // Comlink 不会把 Worker 的模块加载错误转换成 RPC 拒绝，需要监听原生错误。
  const handleError = (event: ErrorEvent) => {
    const error = new Error(event.message || '语言服务 Worker 启动失败')
    if (initialized) onFailure(error)
    else rejectFailure(error)
  }
  const handleMessageError = () => {
    const error = new Error('语言服务 Worker 消息无法解析')
    if (initialized) onFailure(error)
    else rejectFailure(error)
  }
  innerWorker.addEventListener('error', handleError)
  innerWorker.addEventListener('messageerror', handleMessageError)
  return {
    /** 初始化后返回服务扩展，现有文档由调用方在挂载前传入。 */
    async initialize(getSource: () => string): Promise<Extension> {
      await Promise.race([
        (async () => {
          await worker.initialize()
          if (disposed) return
          await worker.updateFile({ path: SCRIPT_EDITOR_FILE, code: getSource() })
        })(),
        failed,
      ])
      if (disposed) return []
      initialized = true
      return [
        tsFacetWorker.of({ worker, path: SCRIPT_EDITOR_FILE }),
        tsSyncWorker(),
        tsLinterWorker(),
        tsHoverWorker(),
        javascriptLanguage.data.of({ autocomplete: tsAutocompleteWorker() }),
        signatureField,
        signatureHints(worker),
      ]
    },
    /** 释放代理并终止当前会话，关闭弹窗后不保留语言程序。 */
    dispose() {
      if (disposed) return
      disposed = true
      innerWorker.removeEventListener('error', handleError)
      innerWorker.removeEventListener('messageerror', handleMessageError)
      rejectFailure(new Error('脚本编辑器已关闭'))
      worker[releaseProxy]()
      innerWorker.terminate()
    },
  }
}
