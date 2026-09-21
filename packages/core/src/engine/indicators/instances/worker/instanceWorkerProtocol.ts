/**
 * 实例计算 Worker 协议。
 *
 * 协议只表达行情快照、去重计算任务与任务输出；实例到 pane 的关系留在主线程投影层。
 */
import type { KLineData } from '../../../../foundation/types/price.js'
import type {
  IndicatorCalculationOutput,
  IndicatorCalculationPlan,
} from '../domain/instanceCalculationPlan.js'

/** Worker 可执行的指标定义描述。 */
export interface SerializedIndicatorCalculationDefinition {
  readonly definitionId: string
  readonly computeKey: string
  readonly outputAlignment?: 'bar' | 'aggregate'
}

export type InstanceWorkerRequest =
  | {
      readonly type: 'init'
      readonly protocolVersion: number
      readonly definitions: readonly SerializedIndicatorCalculationDefinition[]
    }
  | {
      readonly type: 'setData'
      readonly dataRevision: number
      readonly data: KLineData[]
    }
  | {
      readonly type: 'execute'
      readonly requestId: number
      readonly dataRevision: number
      readonly plan: IndicatorCalculationPlan
    }
  | { readonly type: 'dispose' }

export type InstanceWorkerResponse =
  | { readonly type: 'ready'; readonly protocolVersion: number }
  | {
      readonly type: 'result'
      readonly requestId: number
      readonly dataRevision: number
      readonly calculationRevision: number
      readonly outputs: readonly IndicatorCalculationOutput[]
      readonly metrics: { readonly computeMs: number; readonly taskCount: number }
    }
  | {
      readonly type: 'error'
      readonly requestId?: number
      readonly stage: 'init' | 'setData' | 'execute'
      readonly message: string
    }

export const INSTANCE_WORKER_PROTOCOL_VERSION = 1

export function isInstanceWorkerResponse(value: unknown): value is InstanceWorkerResponse {
  if (!value || typeof value !== 'object') return false
  const type = (value as { type?: unknown }).type
  return type === 'ready' || type === 'result' || type === 'error'
}
