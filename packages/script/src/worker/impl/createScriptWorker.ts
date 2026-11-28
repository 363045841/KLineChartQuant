/** Script Worker 端口：把主线程调用转成消息、把返回值解包并转发调试输出。 */
import type { DrawingObject, IndicatorSeries } from '@363045841yyt/klinechart-plot-contracts'
import type { LogEvent } from '../../contracts/log.js'
import { applyDrawingDelta } from '../../execution/session/impl/drawingDelta.js'
import type { CompiledScriptSources } from '../../execution/types.js'
import type { QuickJSScriptDefinition } from '../../quickjs/types.js'
import type { CompilationHost, CompilationLease } from '../compiler/types.js'
import { encodeRunInput, inputTransferList, WorkerInputReceiver } from '../transport/impl/input.js'
import { unpackIndicatorSeries } from '../transport/impl/series.js'
import {
  ScriptThreadFailure,
  type ScriptRequestsInput,
  type ScriptRunInput,
  type ScriptRunResult,
  type ScriptThread,
  type ScriptWorker,
  type ScriptWorkerRequest,
  type ScriptWorkerResponse,
} from '../types.js'

/** 端口持有的已编译条目；安装状态只在这里维护一份。 */
interface ScriptEntry {
  readonly lease: CompilationLease
  readonly source: string
  readonly trusted: boolean
  installed: boolean
  /** 已应用到的行情修订号；不连续时改发全量。 */
  revision: number
}

/**
 * 创建脚本执行端口。
 *
 * @param thread - 宿主线程；Web Worker 或 worker_threads 由调用方适配
 * @param onOutput - 脚本输出的接收方
 * @param compiler - 池持有的编译宿主，用于取得编译产物
 */
export function createScriptWorker(
  thread: ScriptThread,
  onOutput: (id: string, events: readonly LogEvent[]) => void,
  compiler: CompilationHost,
): ScriptWorker {
  let nextRequestId = 0
  let failure: ScriptThreadFailure | undefined
  const input = new WorkerInputReceiver()
  /** 每个脚本只维护一份绘图增量，仅替换变化项；未变化对象保留引用。 */
  const drawings = new Map<string, readonly DrawingObject[]>()
  /** 每个脚本保留上一轮完整序列；尾部补丁只覆盖变化段。 */
  const seriesStore = new Map<string, IndicatorSeries>()
  const entries = new Map<string, ScriptEntry>()
  const preparing = new Set<CompilationLease>()
  let ready: Promise<void> = Promise.resolve()
  const pending = new Map<
    number,
    {
      resolve: (response: ScriptWorkerResponse) => void
      reject: (error: Error) => void
    }
  >()

  /** 线程失效后拒绝全部请求，并终止迟到的失效线程消息。 */
  function stop(error: Error): void {
    if (failure) return
    failure = new ScriptThreadFailure(error.message, { cause: error })
    for (const entry of entries.values()) entry.lease.release()
    for (const lease of preparing) lease.release()
    entries.clear()
    drawings.clear()
    seriesStore.clear()
    preparing.clear()
    thread.terminate()
    for (const request of pending.values()) request.reject(failure)
    pending.clear()
  }

  /** 按请求 ID 完成调用；脚本输出不影响主流程。 */
  thread.onMessage((data) => {
    if (failure) return
    const response = data as ScriptWorkerResponse
    if (response.type === 'output') {
      onOutput(response.id, response.events)
      return
    }
    const request = pending.get(response.requestId)
    if (!request) return
    pending.delete(response.requestId)
    if (response.type === 'error') {
      request.reject(Object.assign(new Error(response.error.message), response.error))
    } else {
      request.resolve(response)
    }
  })

  /** 初始化失败时回传给客户端。 */
  thread.onError((error) => stop(error))

  /** 无法读取线程消息时回传给客户端，避免调用方永久等待。 */
  thread.onMessageError(() => stop(new Error('无法读取 Script Worker 消息')))

  /** 登记并转发专用通信块；发送失败立即标记线程失效。 */
  function request(
    message: ScriptWorkerRequest,
    transfer: ArrayBuffer[] = [],
  ): Promise<ScriptWorkerResponse> {
    if (failure) return Promise.reject(failure)
    return new Promise((resolve, reject) => {
      pending.set(message.requestId, { resolve, reject })
      try {
        thread.postMessage(message, transfer)
      } catch (error) {
        pending.delete(message.requestId)
        const cause = error instanceof Error ? error : new Error(String(error))
        reject(cause)
        stop(cause)
      }
    })
  }

  /** 串行化请求；编译失败只影响当前调用，不破坏已安装的运行态。 */
  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = ready.then(operation)
    ready = result.then(
      () => {},
      () => {},
    )
    return result
  }

  /** 编译并读取声明；读完立即释放运行态，不占会话。 */
  function compile(
    id: string,
    source: string,
    libraries: readonly import('../../quickjs/types.js').QuickJSLibrary[] | undefined,
    trusted: boolean,
  ): Promise<QuickJSScriptDefinition> {
    const lease = compiler.acquire(source, libraries)
    preparing.add(lease)
    return lease.module
      .then((module) => {
        if (failure) throw failure
        return request({
          requestId: ++nextRequestId,
          type: 'prepare',
          id,
          module,
          trusted,
        })
      })
      .then((response) => {
        if (response.type !== 'prepare') throw new Error('Script Worker 响应类型不匹配')
        entries.get(id)?.lease.release()
        entries.set(id, { lease, source, trusted, installed: false, revision: -1 })
        drawings.delete(id)
        seriesStore.delete(id)
        return response.definition
      })
      .catch((error: unknown) => {
        lease.release()
        throw failure ?? error
      })
      .finally(() => {
        preparing.delete(lease)
      })
  }

  /** 首次执行前安装运行态；同一源码只安装一次。 */
  function ensureInstalled(id: string, entry: ScriptEntry): Promise<void> {
    if (entry.installed) return Promise.resolve()
    return entry.lease.module
      .then((module) =>
        request({
          requestId: ++nextRequestId,
          type: 'install',
          id,
          module,
          trusted: entry.trusted,
        }),
      )
      .then((response) => {
        if (response.type !== 'install') throw new Error('Script Worker 响应类型不匹配')
        entry.installed = true
      })
  }

  return {
    prepare(id, source, libraries, trusted = false) {
      return enqueue(() => compile(id, source, libraries, trusted))
    },

    run(id: string, runInput: ScriptRunInput): Promise<ScriptRunResult> {
      return enqueue(async () => {
        const entry = entries.get(id)
        if (!entry) throw new Error(`脚本尚未准备：${id}`)
        await ensureInstalled(id, entry)
        if (failure) throw failure
        const reset = entry.revision !== runInput.change.revision - 1
        const patch = encodeRunInput(runInput, reset)
        // 行情在发送前已同步；脚本错误不回退修订号，只有线程失败才丢弃条目。
        entry.revision = runInput.change.revision
        const response = await request(
          {
            requestId: ++nextRequestId,
            type: 'run',
            id,
            input: patch,
            params: runInput.params,
            live: runInput.live,
          },
          inputTransferList(patch),
        )
        if (response.type !== 'run') throw new Error('Script Worker 响应类型不匹配')
        const series = unpackIndicatorSeries(response.series, seriesStore.get(id))
        seriesStore.set(id, series)
        const deltaCollection = unpackIndicatorSeries(response.drawingDelta.series)
        const next = applyDrawingDelta(drawings.get(id) ?? [], {
          reset: response.drawingDelta.reset,
          upsert: deltaCollection.drawings ?? [],
          remove: response.drawingDelta.remove,
        })
        drawings.set(id, next)
        return { series: { ...series, drawings: next }, alerts: response.alerts }
      })
    },

    requests(id: string, requestInput: ScriptRequestsInput) {
      return enqueue(async () => {
        const entry = entries.get(id)
        if (!entry) throw new Error(`脚本尚未准备：${id}`)
        await ensureInstalled(id, entry)
        const response = await request({
          requestId: ++nextRequestId,
          type: 'requests',
          id,
          params: requestInput.params,
          symbol: requestInput.symbol,
        })
        if (response.type !== 'requests') throw new Error('Script Worker 响应类型不匹配')
        return response.requests
      })
    },

    /** 删除指定脚本的编译快照与运行态。 */
    release(id) {
      return enqueue(async () => {
        entries.get(id)?.lease.release()
        entries.delete(id)
        drawings.delete(id)
        seriesStore.delete(id)
        if (!failure) await request({ requestId: ++nextRequestId, type: 'release', id })
      })
    },

    /** 终止线程并拒绝所有未完成的请求。 */
    dispose() {
      stop(new Error('Script Worker 已销毁'))
    },
  }
}
