/**
 * 指标实例与计算结果的领域模型。
 *
 * 计算结果由执行层按计算身份保存，按实例身份投影到图表。
 * 名词与脚本 API 对齐：`inputs` 是 `input.*` 的取值，`series` 是一次计算的输出。
 */
import { deepFreezeSnapshot } from '@/foundation/utils/deepFreezeSnapshot.js'
import { immutableMap } from '@/foundation/utils/immutableMap.js'

export type IndicatorInstanceId = string
export type IndicatorPaneId = string
export type IndicatorDefinitionId = string
export type CalculationKey = string

/** 递归 JSON-like 输入对象；用 interface 承载以避免类型别名循环引用。 */
export interface IndicatorInputObject {
  readonly [key: string]: IndicatorInputValue
}

export type IndicatorInputValue =
  | null
  | boolean
  | number
  | string
  | readonly IndicatorInputValue[]
  | IndicatorInputObject

export type IndicatorInputs = Readonly<Record<string, IndicatorInputValue>>

/** 影响计算器输出的输入与上下文，绝不包含 pane 或样式。 */
export interface IndicatorCalculationIdentityInput {
  readonly definitionId: IndicatorDefinitionId
  readonly inputs: IndicatorInputs
  /** 标的、周期、数据源字段、复权方式、依赖版本等。 */
  readonly context: IndicatorInputs
}

/** 一个已启用指标实例的纯图表配置。 */
export interface IndicatorInstance {
  readonly instanceId: IndicatorInstanceId
  readonly definitionId: IndicatorDefinitionId
  readonly paneId: IndicatorPaneId
  readonly calculation: IndicatorCalculationIdentityInput
  /** 仅包含 pane 位置和样式，不能影响 calculationKey。 */
  readonly presentation: Readonly<Record<string, unknown>>
}

export interface IndicatorInstanceSnapshot {
  /** 启用集合、指标定义、计算输入或计算上下文变化时递增。 */
  readonly calculationRevision: number
  readonly instances: ReadonlyMap<IndicatorInstanceId, IndicatorInstance>
}

/** 可跨 Worker 传输的计算错误，不携带 Error 原型或堆栈。 */
export interface IndicatorError {
  readonly message: string
  readonly code?: string
  readonly plotId?: string
  readonly barIndex?: number
}

/** 一次计算的已提交结果；身份由结果仓库的键与实例池的键承担。 */
export interface IndicatorResult {
  /** 计算时的时间轴；展示映射在投影边界生成。 */
  readonly timestamps: readonly number[]
  readonly dataRevision: number
  readonly marketRevision: number
  readonly series: unknown
  readonly error?: IndicatorError
}

/** 图表侧的结果快照：按当前计划的实例关系展开。 */
export interface IndicatorSeriesPool {
  readonly results: ReadonlyMap<IndicatorInstanceId, IndicatorResult>
}

/** 判断输入值是否为数组；显式谓词用于对 readonly 数组正确收窄。 */
function isInputArray(
  value: IndicatorInputObject | readonly IndicatorInputValue[],
): value is readonly IndicatorInputValue[] {
  return Array.isArray(value)
}

/** 确定性的身份编码；拒绝不支持的值，不能静默产生碰撞。 */
function canonicalize(value: IndicatorInputValue): string {
  if (value === null) return 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Indicator inputs must be finite')
    return Object.is(value, -0) ? '0' : String(value)
  }
  if (typeof value === 'string') return JSON.stringify(value)
  if (isInputArray(value)) return `[${value.map(canonicalize).join(',')}]`
  return canonicalizeObject(value)
}

/** 按键名排序编码输入对象，保证同一输入集合产生同一字符串。 */
function canonicalizeObject(value: IndicatorInputObject): string {
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key]!)}`)
    .join(',')}}`
}

/**
 * 用于计算去重的稳定内容身份。
 *
 * 刻意排除实例 ID、pane ID 与展示配置，因此相同计算可在一次调度内共享执行，
 * 同时不改变按实例持久化结果的模型。
 */
export function createIndicatorCalculationKey(
  identity: IndicatorCalculationIdentityInput,
): CalculationKey {
  if (!identity.definitionId) throw new TypeError('Indicator definitionId is required')
  return `${identity.definitionId}:${canonicalize(identity.inputs)}:${canonicalize(identity.context)}`
}

export function createIndicatorInstanceSnapshot(
  instances: Iterable<IndicatorInstance> = [],
  calculationRevision = 0,
): IndicatorInstanceSnapshot {
  const byId = new Map<IndicatorInstanceId, IndicatorInstance>()
  for (const instance of instances) {
    if (!instance.instanceId) throw new TypeError('Indicator instanceId is required')
    if (byId.has(instance.instanceId)) {
      throw new TypeError(`Duplicate indicator instance ID: ${instance.instanceId}`)
    }
    if (instance.definitionId !== instance.calculation.definitionId) {
      throw new TypeError(`Indicator definition mismatch: ${instance.instanceId}`)
    }
    byId.set(
      instance.instanceId,
      Object.freeze({
        ...instance,
        calculation: Object.freeze({
          ...instance.calculation,
          inputs: deepFreezeSnapshot(instance.calculation.inputs),
          context: deepFreezeSnapshot(instance.calculation.context),
        }),
        presentation: deepFreezeSnapshot(instance.presentation),
      }),
    )
  }
  return Object.freeze({ calculationRevision, instances: immutableMap(byId) })
}
