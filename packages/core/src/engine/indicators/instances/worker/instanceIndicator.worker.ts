/** 实例计算 Worker 入口；只执行去重任务计划。 */
import { createWorkerCompute } from '../../indicatorRuntime.js'
import type { IndicatorCalculationDefinition } from '../execution/instanceCalculationRuntime.js'
import { IndicatorInstanceExecutionRuntime } from '../execution/instanceExecutionRuntime.js'
import {
  INSTANCE_WORKER_PROTOCOL_VERSION,
  type InstanceWorkerRequest,
  type InstanceWorkerResponse,
  type SerializedIndicatorCalculationDefinition,
} from './instanceWorkerProtocol.js'

const worker = self as unknown as Worker
let runtime: IndicatorInstanceExecutionRuntime | null = null

function respond(response: InstanceWorkerResponse): void {
  worker.postMessage(response)
}

function createDefinition(
  descriptor: SerializedIndicatorCalculationDefinition,
): IndicatorCalculationDefinition {
  return Object.freeze({
    definitionId: descriptor.definitionId,
    outputAlignment: descriptor.outputAlignment,
    compute: createWorkerCompute(descriptor),
  })
}

worker.onmessage = (event: MessageEvent<InstanceWorkerRequest>): void => {
  const message = event.data
  try {
    switch (message.type) {
      case 'init':
        runtime = new IndicatorInstanceExecutionRuntime(message.definitions.map(createDefinition))
        respond({ type: 'ready', protocolVersion: INSTANCE_WORKER_PROTOCOL_VERSION })
        return
      case 'setData':
        if (!runtime) throw new TypeError('Runtime not initialized')
        runtime.setData(message.data, message.dataRevision)
        return
      case 'execute': {
        if (!runtime) throw new TypeError('Runtime not initialized')
        const start = performance.now()
        const outputs = runtime.execute(message.plan)
        respond({
          type: 'result',
          requestId: message.requestId,
          dataRevision: message.dataRevision,
          calculationRevision: message.plan.calculationRevision,
          outputs,
          metrics: { computeMs: performance.now() - start, taskCount: message.plan.tasks.length },
        })
        return
      }
      case 'dispose':
        runtime = null
        return
    }
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error)
    respond({
      type: 'error',
      requestId: message.type === 'execute' ? message.requestId : undefined,
      stage:
        message.type === 'execute' ? 'execute' : message.type === 'setData' ? 'setData' : 'init',
      message: messageText,
    })
  }
}
