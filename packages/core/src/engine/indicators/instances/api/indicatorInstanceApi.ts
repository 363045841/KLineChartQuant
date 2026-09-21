/**
 * 指标实例 CRUD API。
 *
 * 这是实例配置的唯一写入口，不读取或写入计算结果、pane 渲染状态或旧调度器状态。
 */
import {
  createIndicatorInstanceSnapshot,
  reduceIndicatorInstances,
  type CreateIndicatorInstance,
  type IndicatorDefinitionId,
  type IndicatorInstance,
  type IndicatorInstanceId,
  type IndicatorInstanceSnapshot,
  type IndicatorPaneId,
  type UpdateIndicatorInstance,
} from '../domain/instanceModel.js'

/** 创建实例时的 ID 分配器；由宿主提供以适配持久化或协作系统。 */
export type IndicatorInstanceIdFactory = () => IndicatorInstanceId

/** CRUD 服务的构造参数。 */
export interface CreateIndicatorInstanceApiOptions {
  readonly initial?: Iterable<IndicatorInstance>
  readonly createId: IndicatorInstanceIdFactory
  /** 每次成功变更后同步通知调度器、持久化或撤销重做管线。 */
  readonly onChanged?: (snapshot: IndicatorInstanceSnapshot) => void
}

/** 指标实例的受限查询接口。 */
export interface IndicatorInstanceQueryApi {
  snapshot(): IndicatorInstanceSnapshot
  get(instanceId: IndicatorInstanceId): IndicatorInstance | undefined
  list(): readonly IndicatorInstance[]
  listByPane(paneId: IndicatorPaneId): readonly IndicatorInstance[]
  listByDefinition(definitionId: IndicatorDefinitionId): readonly IndicatorInstance[]
}

/** 指标实例的命令接口。 */
export interface IndicatorInstanceCommandApi {
  create(input: CreateIndicatorInstance): IndicatorInstance
  update(instanceId: IndicatorInstanceId, change: UpdateIndicatorInstance): IndicatorInstance
  remove(instanceId: IndicatorInstanceId): boolean
}

export type IndicatorInstanceApi = IndicatorInstanceQueryApi & IndicatorInstanceCommandApi

/**
 * 创建实例 CRUD 服务。
 *
 * `create` 返回新实例；`update` 返回更新后的实例；`remove` 在目标不存在时返回 false。
 * 计算参数变更和 pane/样式变更分别由 `UpdateIndicatorInstance.kind` 表达，调用方不能
 * 通过一个模糊的 patch 同时混入两类语义。
 */
export function createIndicatorInstanceApi(
  options: CreateIndicatorInstanceApiOptions,
): IndicatorInstanceApi {
  let current = createIndicatorInstanceSnapshot(options.initial ?? [])

  const publish = (next: IndicatorInstanceSnapshot): void => {
    if (next === current) return
    current = next
    options.onChanged?.(current)
  }

  const getRequired = (instanceId: IndicatorInstanceId): IndicatorInstance => {
    const instance = current.instances.get(instanceId)
    if (!instance) throw new TypeError(`Unknown indicator instance: ${instanceId}`)
    return instance
  }

  const api: IndicatorInstanceApi = {
    snapshot: () => current,

    get: (instanceId) => current.instances.get(instanceId),

    list: () => Object.freeze([...current.instances.values()]),

    listByPane: (paneId) =>
      Object.freeze([...current.instances.values()].filter((instance) => instance.paneId === paneId)),

    listByDefinition: (definitionId) =>
      Object.freeze(
        [...current.instances.values()].filter((instance) => instance.definitionId === definitionId),
      ),

    create: (input) => {
      const instance: IndicatorInstance = {
        ...input,
        instanceId: input.instanceId ?? options.createId(),
      }
      publish(reduceIndicatorInstances(current, { type: 'create', instance }))
      return getRequired(instance.instanceId)
    },

    update: (instanceId, change) => {
      publish(reduceIndicatorInstances(current, { type: 'update', instanceId, change }))
      return getRequired(instanceId)
    },

    remove: (instanceId) => {
      if (!current.instances.has(instanceId)) return false
      publish(reduceIndicatorInstances(current, { type: 'remove', instanceId }))
      return true
    },
  }
  return Object.freeze(api)
}
