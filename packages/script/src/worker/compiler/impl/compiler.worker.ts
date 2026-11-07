/** 唯一编译线程入口：TypeScript 与语言服务只在这里加载，不处理行情或执行指标。 */
import { compileSources } from '../../../execution/impl/compileSources.js'
import { ScriptExecutionError } from '../../../errors.js'
import type { CompilerRequest, CompilerResponse } from '../types.js'

/** 编译一份源码及依赖；失败只拒绝本次请求。 */
globalThis.onmessage = (event: MessageEvent<CompilerRequest>): void => {
  const { requestId, source, libraries } = event.data
  let response: CompilerResponse
  try {
    response = { requestId, type: 'compiled', module: compileSources(source, libraries) }
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error(String(cause))
    response = {
      requestId,
      type: 'error',
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
        ...(cause instanceof ScriptExecutionError ? { code: cause.code } : {}),
      },
    }
  }
  globalThis.postMessage(response)
}
