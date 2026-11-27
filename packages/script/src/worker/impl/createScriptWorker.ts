/** Script Worker 端口：把主线程调用转成消息、把返回值解包并转发调试输出。 */

import type { DrawingObject } from '@363045841yyt/klinechart-plot-contracts'
import type { LogEvent } from '../../contracts/log.js'
import { applyDrawingDelta } from '../../execution/session/impl/drawingDelta.js'
import type { CompilationHost, CompilationLease } from '../compiler/types.js'
import { inputTransferList, WorkerInputSender } from '../transport/impl/input.js'
import { unpackIndicatorSeries } from '../transport/impl/series.js'
import type {
  ScriptThread,
  ScriptWorker,
  ScriptWorkerRequest,
  ScriptWorkerResponse,
} from '../types.js'

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
  let failure: Error | undefined
  const input = new WorkerInputSender()
  /** 每个脚本只维护一份绘图增量，仅替换变化项；未变化对象保留引用。 */
  const drawings = new Map<string, readonly DrawingObject[]>()
  const compiled = new Map<
    string,
    { lease: CompilationLease; trusted: boolean; installed: boolean }
  >()
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
    Object.assign(error, { workerFailure: true })
    failure = error
    input.clear()
    drawings.clear()
    for (const entry of compiled.values()) entry.lease.release()
    for (const lease of preparing) lease.release()
    compiled.clear()
    preparing.clear()
    thread.terminate()
    for (const request of pending.values()) request.reject(error)
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

  /** 登记并转发专用通信块；发送失败立即端口，防止继续使用已失效线程。 */
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
        reject(error)
        stop(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  /** 元数据读取只依赖编译产物本身；破坏性安装执行会话只在首次运行时做。 */
  function ensureInstalled(id: string): Promise<void> {
    const operation = ready.then(async () => {
      if (failure) throw failure
      const entry = compiled.get(id)
      if (!entry) throw new Error(`脚本尚未准备：${id}`)
      if (entry.installed) return
      const module = await entry.lease.module
      const response = await request({
        requestId: ++nextRequestId,
        type: 'prepare',
        id,
        module,
        trusted: entry.trusted,
      })
      if (response.type !== 'prepare') throw new Error('Script Worker 响应类型不匹配')
      entry.installed = true
    })
    ready = operation.then(
      () => {},
      () => {},
    )
    return operation
  }

  return {
    /** 编译在宿主线程完成；安装成功后才替换旧租约，失败保留当前执行模块。 */
    prepare(id, source, libraries, trusted = false, mode = 'execution') {
      const operation = ready.then(async () => {
        if (failure) throw failure
        const lease = compiler.acquire(source, libraries)
        preparing.add(lease)
        try {
          const module = await lease.module
          if (failure) throw failure
          const response = await request({
            requestId: ++nextRequestId,
            type: 'prepare',
            id,
            module,
            trusted,
            metadataOnly: mode === 'metadata',
          })
          if (response.type !== 'prepare') throw new Error('Script Worker 响应类型不匹配')
          compiled.get(id)?.lease.release()
          compiled.set(id, { lease, trusted, installed: mode === 'execution' })
          drawings.delete(id)
          return response.definition
        } catch (error) {
          lease.release()
          throw failure ?? error
        } finally {
          preparing.delete(lease)
        }
      })
      ready = operation.then(
        () => {},
        () => {},
      )
      return operation
    },
    /** 使用 Worker 输入块传输区间数据。 */
    async run(id, bars, params, context, range, live) {
      await ensureInstalled(id)
      if (failure) throw failure
      const inputPatch = input.encode(bars, context)
      const response = await request(
        {
          requestId: ++nextRequestId,
          type: 'run',
          id,
          input: inputPatch,
          params,
          range,
          live,
        },
        inputTransferList(inputPatch),
      )
      if (response.type !== 'run') throw new Error('Script Worker 响应类型不匹配')
      const series = unpackIndicatorSeries(response.series)
      const deltaCollection = unpackIndicatorSeries(response.drawingDelta.series)
      const next = applyDrawingDelta(drawings.get(id) ?? [], {
        reset: response.drawingDelta.reset,
        upsert: deltaCollection.drawings ?? [],
        remove: response.drawingDelta.remove,
      })
      drawings.set(id, next)
      return { series: { ...series, drawings: next }, alerts: response.alerts }
    },
    async requests(id, params, symbol) {
      await ensureInstalled(id)
      const response = await request({
        requestId: ++nextRequestId,
        type: 'requests',
        id,
        params,
        symbol,
      })
      if (response.type !== 'requests') throw new Error('Script Worker 响应类型不匹配')
      return response.requests
    },
    /** 删除指定脚本的编译快照。 */
    async release(id) {
      await ready
      input.clear()
      drawings.delete(id)
      await request({ requestId: ++nextRequestId, type: 'release', id })
      compiled.get(id)?.lease.release()
      compiled.delete(id)
    },
    /** 终止线程并拒绝所有未完成的请求。 */
    dispose() {
      stop(new Error('Script Worker 已销毁'))
    },
  }
}
