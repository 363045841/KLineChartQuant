/** 新实例计算链路的 inline 与 Worker 执行器适配。 */
import type { KLineData } from '@/foundation/types/price.js'
import type { TradeSnapshot } from '../../../../data/trades/types.js'
import type { IndicatorCalculationOutput } from '../domain/instanceCalculationPlan.js'
import {
  INSTANCE_WORKER_PROTOCOL_VERSION,
  type InstanceWorkerResponse,
  isInstanceWorkerResponse,
  type SerializedIndicatorCalculationDefinition,
} from '../worker/instanceWorkerProtocol.js'
import type { IndicatorCalculationDefinition } from './instanceCalculationRuntime.js'
import type { IndicatorCalculationExecutor } from './instanceCalculationScheduler.js'
import { diffTradeSnapshot, IndicatorInstanceExecutionRuntime } from './instanceExecutionRuntime.js'

/** 不依赖 Worker 的直接执行器；测试、SSR 和降级路径使用同一执行语义。 */
export function createInlineIndicatorCalculationExecutor(
  definitions: Iterable<IndicatorCalculationDefinition>,
): IndicatorCalculationExecutor {
  const runtime = new IndicatorInstanceExecutionRuntime(definitions)
  const executor: IndicatorCalculationExecutor = {
    async setData(data, dataRevision, trades) {
      // inline 无结构化克隆开销，成交始终按整段替换下发，与 Worker 共享同一运行时合并路径。
      runtime.setData(
        data,
        dataRevision,
        trades === undefined ? undefined : { mode: 'replace', snapshot: trades },
      )
    },
    async execute(plan) {
      return runtime.execute(plan)
    },
  }
  return Object.freeze(executor)
}

/** Worker 执行器；每个请求都以 requestId 严格关联，过期结果由调用方版本门控。 */
export function createWorkerIndicatorCalculationExecutor(input: {
  readonly worker: Worker
  readonly definitions: readonly SerializedIndicatorCalculationDefinition[]
}): IndicatorCalculationExecutor & { dispose(): void } {
  let nextRequestId = 0
  let ready = false
  let disposed = false
  let previousTrades: TradeSnapshot | undefined
  const pending = new Map<
    number,
    {
      resolve: (outputs: readonly IndicatorCalculationOutput[]) => void
      reject: (error: Error) => void
    }
  >()
  let readyResolve: (() => void) | null = null
  let readyReject: ((error: Error) => void) | null = null
  const readyPromise = new Promise<void>((resolve, reject) => {
    readyResolve = resolve
    readyReject = reject
  })

  const fail = (error: Error): void => {
    readyReject?.(error)
    readyReject = null
    for (const request of pending.values()) request.reject(error)
    pending.clear()
  }
  input.worker.onmessage = (event: MessageEvent<unknown>) => {
    if (!isInstanceWorkerResponse(event.data)) return
    const response: InstanceWorkerResponse = event.data
    if (response.type === 'ready') {
      if (response.protocolVersion !== INSTANCE_WORKER_PROTOCOL_VERSION) {
        fail(new Error(`Unsupported indicator Worker protocol: ${response.protocolVersion}`))
        return
      }
      ready = true
      readyResolve?.()
      readyResolve = null
      return
    }
    if (response.type === 'error') {
      const error = new Error(response.message)
      if (response.requestId === undefined) fail(error)
      else {
        const request = pending.get(response.requestId)
        pending.delete(response.requestId)
        request?.reject(error)
      }
      return
    }
    const request = pending.get(response.requestId)
    pending.delete(response.requestId)
    request?.resolve(response.outputs)
  }
  input.worker.onerror = () => fail(new Error('Indicator Worker execution failed'))
  input.worker.postMessage({
    type: 'init',
    protocolVersion: INSTANCE_WORKER_PROTOCOL_VERSION,
    definitions: input.definitions,
  })

  const executor: IndicatorCalculationExecutor & { dispose: () => void } = {
    async setData(data: KLineData[], dataRevision: number, trades?: TradeSnapshot): Promise<void> {
      await readyPromise
      if (disposed) throw new Error('Indicator Worker executor is disposed')
      input.worker.postMessage({
        type: 'setData',
        data,
        dataRevision,
        // 引用前缀扩展时只传新增批次，避免全量成交结构化克隆。
        tradesDiff: trades === undefined ? undefined : diffTradeSnapshot(previousTrades, trades),
      })
      previousTrades = trades
    },
    async execute(plan, dataRevision): Promise<readonly IndicatorCalculationOutput[]> {
      await readyPromise
      if (!ready || disposed) throw new Error('Indicator Worker executor is unavailable')
      const requestId = ++nextRequestId
      return new Promise((resolve, reject) => {
        pending.set(requestId, { resolve, reject })
        input.worker.postMessage({ type: 'execute', requestId, dataRevision, plan })
      })
    },
    dispose(): void {
      if (disposed) return
      disposed = true
      input.worker.postMessage({ type: 'dispose' })
      fail(new Error('Indicator Worker executor is disposed'))
      input.worker.terminate()
    },
  }
  return Object.freeze(executor)
}
