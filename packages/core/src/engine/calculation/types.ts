/**
 * 计算层公共契约：数据身份、计算请求、结果与消费者。
 *
 * 计算层只认识行情数据与脚本定义，不认识图表、Pane 或视口；
 * 图表与警报都只是计算结果的消费者。
 */
import type {
  ComputeChange,
  ComputeDependency,
  ComputeRange,
  IndicatorMarketContext,
  LogEvent,
} from '@363045841yyt/klinechart-plot-contracts'

import type { KLineData } from '@/foundation/types/price.js'

/** 一条行情序列的稳定身份；与图表实例、Pane、视口无关。 */
export interface DataIdentity {
  readonly source: string
  readonly instrument: string
  readonly period: string
  readonly adjustment: string
}

/** 行情序列键；结果仓库与调度都按它隔离不同数据。 */
export type FeedKey = string

/** 消费者内部的计算键；同一 feed 内唯一。 */
export type CalculationKey = string

/** 一次行情更新；修订号是结果是否有效的唯一判据。 */
export interface FeedSnapshot {
  readonly identity: DataIdentity
  readonly dataRevision: number
  /** 行情源（含 request.* 结果）的修订号。 */
  readonly marketRevision: number
  readonly timestamps: readonly number[]
  readonly data: readonly KLineData[]
  /** 本次行情的变化区间；执行器据此推导重算范围。 */
  readonly change: ComputeChange
}

/** 可递归编码为计算身份的输入值。 */
export interface CalculationInputObject {
  readonly [key: string]: CalculationInputValue
}

export type CalculationInputValue =
  | null
  | boolean
  | number
  | string
  | readonly CalculationInputValue[]
  | CalculationInputObject

export type CalculationInputs = Readonly<Record<string, CalculationInputValue>>

/**
 * 一个消费者对某份行情提出的计算请求。
 *
 * `key` 只在消费者内部唯一；Hub 会拼接 feed 身份后作为全局结果键。
 * `viewportKey` 为 undefined 表示该请求完全不依赖视口。
 */
export interface CalculationRequest {
  readonly key: CalculationKey
  readonly definitionId: string
  readonly inputs: CalculationInputs
  readonly context: CalculationInputs
  /** 依赖视口的脚本由消费者提供固定或当前视口的签名。 */
  readonly viewportKey?: string
  /** 等待状态上报的宿主对象身份；与计算身份无关。 */
  readonly owners?: readonly string[]
}

/** 消费者对一份行情的完整计划；空 requests 表示只等待提交事件。 */
export interface FeedPlan {
  readonly feed: FeedKey
  readonly requests: readonly CalculationRequest[]
}

/** 脚本产生的警报事件；由结果携带，消费者决定是否触发。 */
export interface ScriptAlertEvent {
  readonly kind: 'alert'
  readonly message: string
  /** bar 时间，不是墙钟时间。 */
  readonly time: number
  readonly barIndex: number
  /** 触发时的价格，供日志与消息占位符使用。 */
  readonly price: number
  /** 是否由实时 bar 产生；历史与回放必须为 false，消费者不得触发。 */
  readonly live: boolean
  readonly freq?: string
}

/** 脚本一次运行的全部事件；日志与警报共用一条通道。 */
export type ScriptEvent = LogEvent | ScriptAlertEvent

/** 可跨 Worker 传输的计算错误，不携带 Error 原型或堆栈。 */
export interface CalculationFailure {
  readonly message: string
  readonly code?: string
  readonly plotId?: string
  readonly barIndex?: number
}

/** 一次计算的已提交结果；身份由结果仓库的键承担。 */
export interface CalculationResult {
  /** 消费者本地键，与请求一一对应。 */
  readonly key: CalculationKey
  readonly definitionId: string
  readonly dataRevision: number
  readonly marketRevision: number
  /** 计算时的时间轴；展示映射在消费边界生成。 */
  readonly timestamps: readonly number[]
  readonly series: unknown
  /** 警报事件；指标通常为空。 */
  readonly events: readonly ScriptEvent[]
  readonly error?: CalculationFailure
}

/** 一次提交：该消费者在这份行情上的全部结果。 */
export interface CalculationCommit {
  readonly feed: FeedKey
  readonly dataRevision: number
  readonly marketRevision: number
  readonly results: ReadonlyMap<CalculationKey, CalculationResult>
}

/** 计算端口输出；警报事件与序列一起返回，避免第二条通道。 */
export interface CalculationOutput {
  readonly series: unknown
  readonly events?: readonly ScriptEvent[]
}

export type CalculationCompute = (
  data: readonly KLineData[],
  inputs: CalculationInputs,
  market?: IndicatorMarketContext,
  range?: ComputeRange,
) => CalculationOutput | Promise<CalculationOutput>

/** 已注册的可计算定义；由宿主定义仓库提供。 */
export interface CalculationDefinition {
  readonly definitionId: string
  /** 计算对历史的依赖；缺省按有状态处理。 */
  readonly dependency: ComputeDependency
  readonly createCompute?: () => CalculationCompute & { dispose?(): void }
  readonly compute: CalculationCompute
}

/** 图表级行情上下文端口；只供执行器读取，不承载调度状态。 */
export interface CalculationMarketData {
  readonly revision: number
  context(owner: string, bars: readonly KLineData[]): IndicatorMarketContext
  /** 提交当前计划的全部租约；只回收计划自己拥有、本次未声明的 key。 */
  retain(owners: ReadonlySet<string>): void
}

export interface CalculationHubOptions {
  resolveDefinition(definitionId: string): CalculationDefinition | undefined
  marketData?: () => CalculationMarketData
}

/** 消费者回调；同一 feed 的有效结果只提交一次。 */
export interface CalculationClientHandlers {
  onCommit(commit: CalculationCommit): void
  onPending?: (owners: readonly string[], pending: boolean) => void
  onError?: (error: unknown) => void
}

/** 一个消费者句柄；计划变化时整份替换，不做增量补丁。 */
export interface CalculationClient {
  setPlan(plan: readonly FeedPlan[]): void
  dispose(): void
}

export interface CalculationHub {
  createClient(id: string, handlers: CalculationClientHandlers): CalculationClient
  /** 覆盖一份行情；同一 feed 的新修订会淘汰旧结果并重新排队。 */
  updateFeed(snapshot: FeedSnapshot): void
  /** 移除一份行情；该序列的结果、任务与租约一并释放。 */
  removeFeed(feed: FeedKey): void
  /** 预览计算：不进入任何消费者的提交，结果按 LRU 保留。 */
  submit(feed: Feed, request: CalculationRequest, signal: AbortSignal): Promise<CalculationResult>
  /** 读取已提交结果；不触发计算。 */
  get(feed: Feed, key: CalculationKey): CalculationResult | undefined
  /** 定义被替换时丢弃对应结果与计算器，并让消费者重新提交。 */
  invalidateDefinitions(definitionIds: readonly string[]): void
  dispose(): void
}

/** 简写；供实现内部与调用方复用。 */
export type Feed = FeedKey
