/** 装配 CodeMirror 语言适配并管理独立语言 Worker 的生命周期。 */
import { typescriptLanguage } from '@codemirror/lang-javascript'
import type { Extension } from '@codemirror/state'
import {
  tsAutocompleteWorker,
  tsFacetWorker,
  tsHoverWorker,
  tsLinterWorker,
  tsSyncWorker,
} from '@valtown/codemirror-ts'
import { releaseProxy, wrap } from 'comlink'
import { SCRIPT_EDITOR_FILE, type ScriptLanguageWorker } from './types.js'
import { renderScriptHover } from './renderScriptHover.js'
import ScriptLanguageWorkerConstructor from './scriptLanguage.worker?worker&inline'
import { scriptSignatureHelp } from './scriptSignatureHelp.js'

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
  /** 原生 Worker 错误与自定义查询错误共用当前会话的失败链路。 */
  const reportFailure = (error: Error) => {
    if (disposed) return
    if (initialized) onFailure(error)
    else rejectFailure(error)
  }
  // Comlink 不会把 Worker 的模块加载错误转换成 RPC 拒绝，需要监听原生错误。
  const handleError = (event: ErrorEvent) => {
    reportFailure(new Error(event.message || '语言服务 Worker 启动失败'))
  }
  const handleMessageError = () => {
    reportFailure(new Error('语言服务 Worker 消息无法解析'))
  }
  innerWorker.addEventListener('error', handleError)
  innerWorker.addEventListener('messageerror', handleMessageError)
  return {
    /** 复用独立语言 Worker 格式化当前原文。 */
    formatDocument(source: string) {
      return worker.formatDocument(SCRIPT_EDITOR_FILE, source)
    },
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
        tsHoverWorker({ renderTooltip: renderScriptHover }),
        typescriptLanguage.data.of({ autocomplete: tsAutocompleteWorker() }),
        scriptSignatureHelp(worker, reportFailure),
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
