/**
 * Indicator Worker 消息协议。
 * Worker 只传输计算所需数据和纯计算结果，不包含结果池所属方等主线程业务身份。
 */

import type { KLineData } from '../../foundation/types/price.js'

/** 单个指标的计算参数。 */
export type IndicatorConfig = Readonly<Record<string, unknown>>

/** 可跨 Worker 传输的指标运行时描述符。 */
export interface SerializedRuntimeDescriptor {
  readonly configKey: string
  readonly paneIdKey?: string
  readonly defaultParams: unknown
  readonly computeKey: string
  readonly outputAlignment?: 'bar' | 'aggregate'
}

/** 单个图表指标实例的计算输入。 */
export interface IndicatorInstanceCalculationInput {
  readonly instanceId: string
  readonly definitionId: string
  readonly configKey: string
  readonly paneId: string
  readonly params: IndicatorConfig
}

/** Worker 返回的单个指标实例纯计算结果。 */
export interface IndicatorInstanceCalculationResult {
  readonly instanceId: string
  readonly definitionId: string
  readonly paneId: string
  readonly params: IndicatorConfig
  readonly series: unknown
  readonly firstReadyIndex: number | null
}

/** 初始化 Worker。 */
export interface InitRequest {
  readonly type: 'init'
  readonly protocolVersion: number
  readonly descriptors?: ReadonlyArray<SerializedRuntimeDescriptor>
}

/** 向 Worker 动态添加指标描述符。 */
export interface AddDescriptorRequest {
  readonly type: 'addDescriptor'
  readonly descriptor: SerializedRuntimeDescriptor
}

/** 更新 Worker 使用的行情数据。 */
export interface SetDataRequest {
  readonly type: 'setData'
  readonly dataVersion: number
  readonly format: 'aos' | 'soa'
  readonly data: KLineData[]
}

/** 请求 Worker 计算当前启用指标实例。 */
export interface ComputeSeriesRequest {
  readonly type: 'computeSeries'
  readonly requestId: number
  readonly dataVersion: number
  readonly configVersion: number
  readonly instances: ReadonlyArray<IndicatorInstanceCalculationInput>
}

/** 销毁 Worker 运行时。 */
export interface DisposeRequest {
  readonly type: 'dispose'
}

/** 主线程发送给 Indicator Worker 的消息。 */
export type IndicatorWorkerRequest =
  | InitRequest
  | AddDescriptorRequest
  | SetDataRequest
  | ComputeSeriesRequest
  | DisposeRequest

/** Worker 初始化完成响应。 */
export interface ReadyResponse {
  readonly type: 'ready'
  readonly protocolVersion: number
}

/** Worker 指标计算成功响应。 */
export interface SeriesResultResponse {
  readonly type: 'seriesResult'
  readonly requestId: number
  readonly dataVersion: number
  readonly configVersion: number
  readonly instanceResults: ReadonlyArray<IndicatorInstanceCalculationResult>
  readonly metrics?: {
    readonly computeMs: number
    readonly dataLength: number
  }
}

/** Worker 执行失败响应。 */
export interface ErrorResponse {
  readonly type: 'error'
  readonly requestId?: number
  readonly stage: 'init' | 'setData' | 'setConfig' | 'computeSeries'
  readonly message: string
}

/** Indicator Worker 返回给主线程的消息。 */
export type IndicatorWorkerResponse = ReadyResponse | SeriesResultResponse | ErrorResponse

/** 当前 Indicator Worker 协议版本。 */
export const PROTOCOL_VERSION = 5

/** 判断未知消息是否具有 Worker 响应的基础结构。 */
export function isWorkerResponse(msg: unknown): msg is IndicatorWorkerResponse {
  if (typeof msg !== 'object' || msg === null) return false
  const message = msg as Record<string, unknown>
  if (typeof message.type !== 'string') return false
  return ['ready', 'seriesResult', 'error'].includes(message.type)
}
