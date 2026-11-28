/** Script 计算线程：安装编译产物并执行，不加载 TypeScript 或语言服务。 */
import { type LogEvent, SCRIPT_LOG_LIMIT } from '@363045841yyt/klinechart-plot-contracts'
import { ScriptExecutionError, ScriptPlotError } from '../../errors.js'
import { prepareNativeModule } from '../../execution/impl/prepareNativeModule.js'
import { preloadQuickJS, prepareQuickJSModule } from '../../quickjs/impl/runQuickJSModule.js'
import type { PreparedScript } from '../../quickjs/types.js'
import { WorkerInputReceiver } from '../transport/impl/input.js'
import { packIndicatorSeries } from '../transport/impl/series.js'
import type { ScriptWorkerRequest, ScriptWorkerResponse } from '../types.js'
import type { WorkerEndpoint } from '../endpoint.js'

const scripts = new Map<string, PreparedScript>()
const input = new WorkerInputReceiver()
let pending: Promise<void> = Promise.resolve()
let output: LogEvent[] = []

/** 日志按请求批量发送，逐 bar 输出不会产生逐条跨线程消息。 */
function onLog(event: LogEvent): void {
  output.push(event)
  if (output.length > SCRIPT_LOG_LIMIT) output.shift()
}

/** 取已安装的脚本；缺失时按同一错误报告。 */
function requireScript(id: string): PreparedScript {
  const script = scripts.get(id)
  if (!script) throw new Error(`脚本尚未安装：${id}`)
  return script
}

/** 编译产物交给后端装配；trusted 决定是否加载 QuickJS。 */
async function createScript(
  message: Extract<ScriptWorkerRequest, { type: 'prepare' | 'install' }>,
): Promise<PreparedScript> {
  // 信任由宿主注册属性决定，原生准备和运行完全不经过 QuickJS。
  if (!message.trusted) await preloadQuickJS()
  const prepare = message.trusted ? prepareNativeModule : prepareQuickJSModule
  return prepare(message.module, onLog)
}

/** 只读取声明，读完立即释放临时运行态。 */
async function prepareRequest(
  message: Extract<ScriptWorkerRequest, { type: 'prepare' }>,
): Promise<ScriptWorkerResponse> {
  const script = await createScript(message)
  try {
    return { requestId: message.requestId, type: 'prepare', definition: script.definition }
  } finally {
    script.dispose()
  }
}

/** 安装运行态；同一 id 再次安装会替换旧会话。 */
async function installRequest(
  message: Extract<ScriptWorkerRequest, { type: 'install' }>,
): Promise<ScriptWorkerResponse> {
  const script = await createScript(message)
  scripts.get(message.id)?.dispose()
  scripts.set(message.id, script)
  return { requestId: message.requestId, type: 'install' }
}

/** 分发非编译请求。 */
function runRequest(
  message: Exclude<ScriptWorkerRequest, { type: 'prepare' | 'install' }>,
): ScriptWorkerResponse {
  const { requestId, id } = message
  switch (message.type) {
    case 'run': {
      const current = input.decode(message.input)
      const result = requireScript(id).run({
        bars: current.bars,
        change: message.input.bars.change,
        params: message.params,
        context: current.context,
        live: message.live,
      })
      const { drawings: _drawings, drawingDelta, alerts, ...series } = result
      return {
        requestId,
        type: 'run',
        series: packIndicatorSeries(series, message.input.bars.change.start),
        drawingDelta: {
          reset: drawingDelta.reset,
          remove: drawingDelta.remove,
          series: packIndicatorSeries({
            plots: [],
            fills: [],
            drawings: drawingDelta.upsert,
          }),
        },
        alerts,
      }
    }
    case 'requests':
      return {
        requestId,
        type: 'requests',
        requests: requireScript(id).requests(message.params, message.symbol),
      }
    case 'release':
      scripts.get(id)?.dispose()
      scripts.delete(id)
      return { requestId, type: 'release' }
    default:
      throw new Error('未知请求类型')
  }
}

/** 把异常统一成错误响应，脚本错误额外带上错误码与绘图信息。 */
function errorResponse(requestId: number, cause: unknown): ScriptWorkerResponse {
  const error = cause instanceof Error ? cause : new Error(String(cause))
  return {
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

/** 执行一个请求；编译失败保留此前的快照，错误只拒绝当前请求。 */
function handleRequest(endpoint: WorkerEndpoint, message: ScriptWorkerRequest): Promise<void> {
  const { requestId, id } = message
  output = []
  return (async () => {
    let response: ScriptWorkerResponse
    try {
      response =
        message.type === 'prepare'
          ? await prepareRequest(message)
          : message.type === 'install'
            ? await installRequest(message)
            : runRequest(message)
    } catch (cause) {
      if (message.type === 'run') {
        const error = cause instanceof Error ? cause : new Error(String(cause))
        onLog({ kind: 'log', level: 'error', time: Date.now(), barIndex: -1, message: error.message })
      }
      response = errorResponse(requestId, cause)
    }
    if (output.length) {
      const logs: ScriptWorkerResponse = { requestId, type: 'output', id, events: output }
      endpoint.postMessage(logs)
    }
    endpoint.postMessage(
      response,
      response.type === 'run'
        ? [response.series.buffer, response.drawingDelta.series.buffer]
        : undefined,
    )
  })()
}

/**
 * 启动计算线程。
 *
 * @param endpoint - 宿主提供的消息端点；浏览器是 Worker 全局，Node 是 parentPort
 */
export function startScriptWorker(endpoint: WorkerEndpoint): void {
  endpoint.onMessage((data) => {
    const message = data as ScriptWorkerRequest
    pending = pending.then(() => handleRequest(endpoint, message))
  })
}
