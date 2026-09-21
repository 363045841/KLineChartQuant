/**
 * 实例优先的指标领域模型。
 *
 * 本模块刻意独立于旧调度器、renderer stateKey 和按类型索引的结果包。
 * 唯一可持久化的计算事实是实例结果；pane 仅拥有渲染投影，绝不拥有计算结果。
 */
import { deepFreezeSnapshot, immutableMap } from '../../../state/immutable.js'

export type IndicatorInstanceId = string
export type IndicatorPaneId = string
export type IndicatorDefinitionId = string
export type IndicatorCalculationKey = string

/** 递归 JSON-like 参数对象；用 interface 承载以避免类型别名循环引用。 */
export interface IndicatorParameterObject {
  readonly [key: string]: IndicatorParameterValue
}

export type IndicatorParameterValue =
  | null
  | boolean
  | number
  | string
  | readonly IndicatorParameterValue[]
  | IndicatorParameterObject

export type IndicatorParameters = Readonly<Record<string, IndicatorParameterValue>>

/** 影响计算器输出的参数与上下文，绝不包含 pane 或样式。 */
export interface IndicatorCalculationIdentityInput {
  readonly definitionId: IndicatorDefinitionId
  readonly params: IndicatorParameters
  /** 标的、周期、数据源字段、复权方式、依赖版本等。 */
  readonly context: IndicatorParameters
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

export type CreateIndicatorInstance = Omit<IndicatorInstance, 'instanceId'> & {
  readonly instanceId?: IndicatorInstanceId
}

/** 计算更新与展示更新刻意使用不可混淆的命令类型。 */
export type UpdateIndicatorInstance =
  | {
      readonly kind: 'calculation'
      readonly params?: IndicatorParameters
      readonly context?: IndicatorParameters
    }
  | {
      readonly kind: 'presentation'
      readonly paneId?: IndicatorPaneId
      readonly presentation?: Readonly<Record<string, unknown>>
    }

export interface IndicatorInstanceSnapshot {
  /** 启用集合、指标定义、计算参数或计算上下文变化时递增。 */
  readonly calculationRevision: number
  /** pane 或展示配置变化时递增；不得触发 Worker 计算。 */
  readonly presentationRevision: number
  readonly instances: ReadonlyMap<IndicatorInstanceId, IndicatorInstance>
}

export type IndicatorInstanceCommand =
  | { readonly type: 'create'; readonly instance: IndicatorInstance }
  | {
      readonly type: 'update'
      readonly instanceId: IndicatorInstanceId
      readonly change: UpdateIndicatorInstance
    }
  | { readonly type: 'remove'; readonly instanceId: IndicatorInstanceId }

export interface IndicatorSeriesResult {
  readonly instanceId: IndicatorInstanceId
  readonly calculationKey: IndicatorCalculationKey
  readonly dataRevision: number
  readonly params: IndicatorParameters
  readonly series: unknown
  readonly firstReadyIndex: number | null
}

/** 唯一可持久化的计算结果来源：每个实例 ID 对应一项结果。 */
export interface IndicatorResultPool {
  readonly dataRevision: number
  readonly instanceRevision: number
  readonly timestamps: readonly number[]
  readonly results: ReadonlyMap<IndicatorInstanceId, IndicatorSeriesResult>
}

/** pane 仅拥有其显示实例的、可随时重建的渲染投影。 */
export interface IndicatorPaneProjection<RenderState = unknown> {
  readonly resultRevision: number
  readonly viewportRevision: number
  readonly panes: ReadonlyMap<IndicatorPaneId, ReadonlyMap<IndicatorInstanceId, RenderState>>
}

/** 判断参数值是否为数组；显式谓词用于对 readonly 数组正确收窄。 */
function isParameterArray(
  value: IndicatorParameterObject | readonly IndicatorParameterValue[],
): value is readonly IndicatorParameterValue[] {
  return Array.isArray(value)
}

/** 确定性的身份编码；拒绝不支持的值，不能静默产生碰撞。 */
function canonicalize(value: IndicatorParameterValue): string {
  if (value === null) return 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('Indicator calculation parameters must be finite')
    }
    return Object.is(value, -0) ? '0' : String(value)
  }
  if (typeof value === 'string') return JSON.stringify(value)
  if (isParameterArray(value)) return `[${value.map(canonicalize).join(',')}]`
  return canonicalizeObject(value)
}

/** 按键名排序编码参数对象，保证同一参数集合产生同一字符串。 */
function canonicalizeObject(value: IndicatorParameterObject): string {
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key]!)}`)
    .join(',')}}`
}

/**
 * 用于计算去重的稳定内容身份。
 * 它刻意排除实例 ID、pane ID 与展示配置，因此相同计算可在一次调度请求内共享执行，
 * 同时不改变按实例持久化结果的模型。
 */
export function createIndicatorCalculationKey(
  identity: IndicatorCalculationIdentityInput,
): IndicatorCalculationKey {
  if (!identity.definitionId) throw new TypeError('Indicator definitionId is required')
  return `${identity.definitionId}:${canonicalize(identity.params)}:${canonicalize(identity.context)}`
}

export function createIndicatorInstanceSnapshot(
  instances: Iterable<IndicatorInstance> = [],
  revisions: Readonly<{ calculationRevision: number; presentationRevision: number }> = {
    calculationRevision: 0,
    presentationRevision: 0,
  },
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
          params: deepFreezeSnapshot(instance.calculation.params),
          context: deepFreezeSnapshot(instance.calculation.context),
        }),
        presentation: deepFreezeSnapshot(instance.presentation),
      }),
    )
  }
  return Object.freeze({ ...revisions, instances: immutableMap(byId) })
}

/** 纯 CRUD reducer；接入层可将其包装为 signal、撤销重做、持久化或 RPC。 */
export function reduceIndicatorInstances(
  snapshot: IndicatorInstanceSnapshot,
  command: IndicatorInstanceCommand,
): IndicatorInstanceSnapshot {
  const next = new Map(snapshot.instances)
  let calculationChanged = false
  let presentationChanged = false
  switch (command.type) {
    case 'create':
      if (next.has(command.instance.instanceId)) {
        throw new TypeError(`Indicator instance already exists: ${command.instance.instanceId}`)
      }
      next.set(command.instance.instanceId, command.instance)
      calculationChanged = true
      presentationChanged = true
      break
    case 'remove':
      if (!next.delete(command.instanceId)) return snapshot
      calculationChanged = true
      presentationChanged = true
      break
    case 'update': {
      const current = next.get(command.instanceId)
      if (!current) throw new TypeError(`Unknown indicator instance: ${command.instanceId}`)
      const instance =
        command.change.kind === 'calculation'
          ? {
              ...current,
              calculation: {
                ...current.calculation,
                params: command.change.params ?? current.calculation.params,
                context: command.change.context ?? current.calculation.context,
              },
            }
          : {
              ...current,
              paneId: command.change.paneId ?? current.paneId,
              presentation: command.change.presentation ?? current.presentation,
            }
      calculationChanged = command.change.kind === 'calculation'
      presentationChanged = command.change.kind === 'presentation'
      next.set(command.instanceId, instance)
      break
    }
  }
  return createIndicatorInstanceSnapshot(next.values(), {
    calculationRevision: snapshot.calculationRevision + Number(calculationChanged),
    presentationRevision: snapshot.presentationRevision + Number(presentationChanged),
  })
}

/** 构造 pane 投影，并保护同一 pane 内的实例 ID 不重复。 */
export function createIndicatorPaneProjection<RenderState>(
  entries: Iterable<readonly [IndicatorPaneId, IndicatorInstanceId, RenderState]>,
  resultRevision: number,
  viewportRevision: number,
): IndicatorPaneProjection<RenderState> {
  const panes = new Map<IndicatorPaneId, Map<IndicatorInstanceId, RenderState>>()
  for (const [paneId, instanceId, state] of entries) {
    const pane = panes.get(paneId) ?? new Map<IndicatorInstanceId, RenderState>()
    if (pane.has(instanceId))
      throw new TypeError(`Duplicate pane projection: ${paneId}/${instanceId}`)
    pane.set(instanceId, state)
    panes.set(paneId, pane)
  }
  return Object.freeze({
    resultRevision,
    viewportRevision,
    panes: immutableMap(
      new Map([...panes].map(([paneId, states]) => [paneId, immutableMap(states)])),
    ),
  })
}
