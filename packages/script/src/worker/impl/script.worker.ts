/** Script 计算 Worker 入口；初始化、编译和逐 bar 执行都发生在本线程。 */

import { type LogEvent, SCRIPT_OUTPUT_LIMIT } from '@363045841yyt/klinechart-plot-contracts'
import { ScriptExecutionError, ScriptPlotError } from '../../errors.js'
import { prepareNativeScript } from '../../execution/impl/prepareNativeScript.js'
import { preloadQuickJS, prepareQuickJSScript } from '../../quickjs/impl/runQuickJSScript.js'
import type { PreparedQuickJSScript } from '../../quickjs/types.js'
import type { ScriptWorkerRequest, ScriptWorkerResponse } from '../types.js'

const scripts = new Map<string, PreparedQuickJSScript>()
let pending: Promise<void> = Promise.resolve()
let output: LogEvent[] = []

/** 日志按请求批量发送，逐 bar 输出不会产生逐条跨线程消息。 */
function onLog(event: LogEvent): void {
  output.push(event)
  if (output.length > SCRIPT_OUTPUT_LIMIT) output.shift()
}
/** 消息串行处理，WASM 首次加载时 run 也必须等待 prepare 完成。 */
globalThis.onmessage = (event: MessageEvent<ScriptWorkerRequest>): void => {
  pending = pending.then(() => handleRequest(event.data))
}

/** 执行一个请求；编译失败保留此前的快照，错误只拒绝当前请求。 */
async function handleRequest(message: ScriptWorkerRequest): Promise<void> {
  const { requestId, id } = message
  output = []
  let response: ScriptWorkerResponse
  try {
    switch (message.type) {
      case 'prepare': {
        // 信任由宿主注册属性决定，原生准备和运行完全不经过 QuickJS。
        if (!message.trusted) await preloadQuickJS()
        const prepare = message.trusted ? prepareNativeScript : prepareQuickJSScript
        const script = prepare(message.source, message.libraries, onLog)
        scripts.set(id, script)
        response = { requestId, type: 'prepare', definition: script.definition }
        break
      }
      case 'run': {
        const script = scripts.get(id)
        if (!script) throw new Error(`脚本尚未准备：${id}`)
        response = {
          requestId,
          type: 'run',
          collection: script.run(message.bars, message.params, message.context),
        }
        break
      }
      case 'requests': {
        const script = scripts.get(id)
        if (!script) throw new Error(`脚本尚未准备：${id}`)
        response = {
          requestId,
          type: 'requests',
          requests: script.requests(message.params, message.symbol),
        }
        break
      }
      case 'release':
        scripts.delete(id)
        response = { requestId, type: 'release' }
        break
    }
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error(String(cause))
    if (message.type === 'run')
      onLog({ kind: 'log', level: 'error', time: Date.now(), barIndex: -1, message: error.message })
    response = {
      requestId,
      type: 'error',
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
        ...(cause instanceof ScriptExecutionError || cause instanceof ScriptPlotError
          ? { code: cause.code }
          : {}),
        ...(cause instanceof ScriptPlotError
          ? { plotName: cause.plotName, barIndex: cause.barIndex }
          : {}),
      },
    }
  }
  if (output.length) {
    const logs: ScriptWorkerResponse = { requestId, type: 'output', id, events: output }
    globalThis.postMessage(logs)
  }
  globalThis.postMessage(response)
}
