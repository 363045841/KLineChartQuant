/** 编译线程逻辑：TypeScript 与语言服务只在这里加载，不处理行情或执行指标。 */
import { compileSources } from '../../../execution/impl/compileSources.js'
import { ScriptExecutionError } from '../../../errors.js'
import type { WorkerEndpoint } from '../../endpoint.js'
import type { CompilerRequest, CompilerResponse } from '../types.js'

/**
 * 启动编译线程。
 *
 * @param endpoint - 宿主提供的消息端点；浏览器是 Worker 全局，Node 是 parentPort
 */
export function startCompilerWorker(endpoint: WorkerEndpoint): void {
  endpoint.onMessage((data) => {
    const { requestId, source, libraries } = data as CompilerRequest
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
    endpoint.postMessage(response)
  })
}
