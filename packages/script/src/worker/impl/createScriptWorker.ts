/** Script Worker 端口：按物理线程同步行情增量，转移数值块并关联计算响应。 */

import type { DrawingObject } from '@363045841yyt/klinechart-plot-contracts'
import type { LogEvent } from '../../contracts/output.js'
import { applyDrawingPatch } from '../../execution/session/impl/drawingPatch.js'
import { acquireCompilation } from '../compiler/impl/sharedCompiler.js'
import type { CompilationLease } from '../compiler/types.js'
import { inputTransferList, WorkerInputSender } from '../transport/impl/input.js'
import { unpackPlotCollection } from '../transport/impl/output.js'
import type { ScriptWorker, ScriptWorkerRequest, ScriptWorkerResponse } from '../types.js'

/**
 * 创建独立计算线程；可传入宿主创建的 Worker，销毁客户端时一并终止。
 *
 * @example
 * const worker = createScriptWorker()
 * try {
 *   const definition = await worker.prepare('my-script', source)
 *   const collection = await worker.run('my-script', bars, params)
 * } finally {
 *   worker.dispose()
 * }
 */
export function createScriptWorker(
  worker = new Worker(new URL('./script.worker.js', import.meta.url), { type: 'module' }),
  onOutput?: (id: string, events: readonly LogEvent[]) => void,
): ScriptWorker {
  let nextRequestId = 0
  let failure: Error | undefined
  const input = new WorkerInputSender()
  /** 每个脚本保留上一轮完整绘图；增量只替换变化对象，未变化对象保持引用。 */
  const drawings = new Map<string, readonly DrawingObject[]>()
  const compiled = new Map<string, CompilationLease>()
  const preparing = new Set<CompilationLease>()
  let ready: Promise<void> = Promise.resolve()
  const pending = new Map<
    number,
    {
      resolve: (response: ScriptWorkerResponse) => void
      reject: (error: Error) => void
    }
  >()

  /** 线程失效后拒绝全部请求，并阻止继续向已失效线程发送消息。 */
  function stop(error: Error): void {
    if (failure) return
    Object.assign(error, { workerFailure: true })
    failure = error
    input.clear()
    drawings.clear()
    for (const lease of [...compiled.values(), ...preparing]) lease.release()
    compiled.clear()
    preparing.clear()
    worker.removeEventListener('message', onMessage)
    worker.removeEventListener('error', onError)
    worker.removeEventListener('messageerror', onMessageError)
    worker.terminate()
    for (const request of pending.values()) request.reject(error)
    pending.clear()
  }

  /** 按请求 ID 完成调用，脚本自身错误不影响后续请求。 */
  function onMessage(event: MessageEvent<ScriptWorkerResponse>): void {
    const response = event.data
    if (response.type === 'output') {
      onOutput?.(response.id, response.events)
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
  }

  /** 初始化或线程运行失败时结束客户端。 */
  function onError(event: ErrorEvent): void {
    stop(new Error(event.message))
  }

  /** 无法读取线程消息时结束客户端，避免调用永久等待。 */
  function onMessageError(): void {
    stop(new Error('无法读取 Script Worker 消息'))
  }

  worker.addEventListener('message', onMessage)
  worker.addEventListener('error', onError)
  worker.addEventListener('messageerror', onMessageError)

  /** 登记后转移专用通信块；发送失败销毁端口，禁止继续使用已失配的增量基线。 */
  function request(
    message: ScriptWorkerRequest,
    transfer: ArrayBuffer[] = [],
  ): Promise<ScriptWorkerResponse> {
    if (failure) return Promise.reject(failure)
    return new Promise((resolve, reject) => {
      pending.set(message.requestId, { resolve, reject })
      try {
        worker.postMessage(message, transfer)
      } catch (error) {
        pending.delete(message.requestId)
        reject(error)
        stop(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  return {
    /** 编译线程共用源码产物；安装成功后才替换旧租约，编译失败保留当前执行模块。 */
    prepare(id, source, libraries, trusted = false) {
      const operation = ready.then(async () => {
        if (failure) throw failure
        const lease = acquireCompilation(source, libraries)
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
          })
          if (response.type !== 'prepare') throw new Error('Script Worker 响应类型不匹配')
          compiled.get(id)?.release()
          compiled.set(id, lease)
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
    /** 使用 Worker 内已有编译快照计算行情。 */
    async run(id, bars, params, context) {
      await ready
      if (failure) throw failure
      const inputPatch = input.encode(bars, context)
      const response = await request(
        {
          requestId: ++nextRequestId,
          type: 'run',
          id,
          input: inputPatch,
          params,
        },
        inputTransferList(inputPatch),
      )
      if (response.type !== 'run') throw new Error('Script Worker 响应类型不匹配')
      const collection = unpackPlotCollection(response.collection)
      const patchCollection = unpackPlotCollection(response.drawings.collection)
      const next = applyDrawingPatch(drawings.get(id) ?? [], {
        reset: response.drawings.reset,
        upsert: patchCollection.drawings ?? [],
        remove: response.drawings.remove,
      })
      drawings.set(id, next)
      return { ...collection, drawings: next }
    },
    async requests(id, params, symbol) {
      await ready
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
      compiled.get(id)?.release()
      compiled.delete(id)
    },
    /** 终止线程并拒绝所有尚未完成的请求。 */
    dispose() {
      stop(new Error('Script Worker 已销毁'))
    },
  }
}
