/** Script Worker 客户端；只负责请求关联、错误传递和线程释放。 */
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
): ScriptWorker {
  let nextRequestId = 0
  let failure: Error | undefined
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
    failure = error
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

  /** 登记请求后发送消息；发送失败只拒绝本次调用。 */
  function request(message: ScriptWorkerRequest): Promise<ScriptWorkerResponse> {
    if (failure) return Promise.reject(failure)
    return new Promise((resolve, reject) => {
      pending.set(message.requestId, { resolve, reject })
      try {
        worker.postMessage(message)
      } catch (error) {
        pending.delete(message.requestId)
        reject(error)
      }
    })
  }

  return {
    /** 在 Worker 内编译源码，返回声明元数据。 */
    async prepare(id, source, libraries, trusted = false) {
      const response = await request({
        requestId: ++nextRequestId,
        type: 'prepare',
        id,
        source,
        libraries,
        trusted,
      })
      if (response.type !== 'prepare') throw new Error('Script Worker 响应类型不匹配')
      return response.definition
    },
    /** 使用 Worker 内已有编译快照计算行情。 */
    async run(id, bars, params) {
      const response = await request({ requestId: ++nextRequestId, type: 'run', id, bars, params })
      if (response.type !== 'run') throw new Error('Script Worker 响应类型不匹配')
      return response.collection
    },
    /** 删除指定脚本的编译快照。 */
    async release(id) {
      await request({ requestId: ++nextRequestId, type: 'release', id })
    },
    /** 终止线程并拒绝所有尚未完成的请求。 */
    dispose() {
      stop(new Error('Script Worker 已销毁'))
    },
  }
}
