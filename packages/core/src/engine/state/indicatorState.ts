// 统一管理主图与副图指标实例的状态模块。
import { batch, computed, createSubState } from '../../foundation/reactivity/signal.js'
import { ChartWorkspaceId } from '../../foundation/types/chartView.js'
import {
  getRegisteredIndicatorDefinition,
  resolveIndicatorDefinitionId,
} from '../indicators/pipeline/index.js'
import type { LayoutWorkspaces } from '../layout/index.js'
import { deepFreezeSnapshot } from './immutable.js'

import { INDICATOR_ROLE, type IndicatorInstanceRole } from './indicatorRole.js'

/** 实例归属属于用户配置；无需等待指标定义即可恢复主副图位置。 */
export interface IndicatorInstanceConfig {
  readonly instanceId: string
  readonly indicatorId: string
  readonly paneId: string
  readonly role: IndicatorInstanceRole
  readonly ordinal: number
  readonly hidden?: boolean
  readonly params: Readonly<Record<string, unknown>>
}

/** 统一的指标实例业务状态；主图与副图共用同一份身份与字段。 */
export interface IndicatorInstanceSpec {
  /** 指标实例唯一身份，不参与 pane 布局或指标能力判断。 */
  readonly instanceId: string
  readonly indicatorId: string
  readonly paneId: string
  readonly role: IndicatorInstanceRole
  /** 同一 Pane 内的显示序号，不参与任何身份或能力判断。 */
  readonly ordinal: number
  /** 隐藏只影响图表绘制，图例仍保留并置灰；不参与计算身份。 */
  readonly hidden?: boolean
  readonly params: Readonly<Record<string, unknown>>
}

/** 写入指标状态必须提供已分配的实例身份，序号可由状态入口补齐。 */
export type IndicatorInstanceInput = Omit<IndicatorInstanceSpec, 'ordinal'> &
  Partial<Pick<IndicatorInstanceSpec, 'ordinal'>>

/** 实例可变字段；身份字段 instanceId 永远不通过 patch 修改。 */
export interface IndicatorInstancePatch {
  readonly indicatorId?: string
  readonly ordinal?: number
  readonly hidden?: boolean
  readonly params?: Readonly<Record<string, unknown>>
}

/** 副图投影使用的只读结构。 */
export interface SubPaneSpec {
  readonly instanceId: string
  readonly paneId: string
  readonly indicatorId: string
  readonly ordinal: number
  /** 隐藏的副图指标只保留标题行，不绘制指标内容。 */
  readonly hidden?: boolean
  readonly params: Readonly<Record<string, unknown>>
}

/** 冻结统一指标实例，隔离调用方对参数对象的修改。 */
function snapshotInstance(entry: IndicatorInstanceInput): IndicatorInstanceConfig {
  const snapshot = {
    instanceId: entry.instanceId,
    indicatorId: entry.indicatorId,
    paneId: entry.paneId,
    role: entry.role,
    ordinal: entry.ordinal ?? 0,
    params: deepFreezeSnapshot(entry.params),
    ...(entry.hidden ? { hidden: true as const } : {}),
  }
  return Object.freeze(snapshot)
}

/** 判断实例集合的 calculator 身份与参数是否一致，展示配置不参与 revision。 */
function calculationInstancesEqual(
  left: ReadonlyArray<IndicatorInstanceSpec>,
  right: ReadonlyArray<IndicatorInstanceSpec>,
): boolean {
  if (left.length !== right.length) return false
  return left.every((previous, index) => {
    const next = right[index]
    if (
      !next ||
      previous.instanceId !== next.instanceId ||
      previous.indicatorId !== next.indicatorId ||
      previous.paneId !== next.paneId
    ) {
      return false
    }
    const runtime = getRegisteredIndicatorDefinition(previous.indicatorId)?.runtime
    if (!runtime) {
      const previousKeys = Object.keys(previous.params)
      const nextKeys = Object.keys(next.params)
      return (
        previousKeys.length === nextKeys.length &&
        previousKeys.every((name) => Object.is(previous.params[name], next.params[name]))
      )
    }
    const defaultParams =
      typeof runtime.defaultParams === 'function'
        ? (runtime.defaultParams as () => Record<string, unknown>)()
        : (runtime.defaultParams as Record<string, unknown>)
    return Object.keys(defaultParams).every((name) =>
      Object.is(
        previous.params[name] ?? defaultParams[name],
        next.params[name] ?? defaultParams[name],
      ),
    )
  })
}

/** 创建指标实例状态，主图和副图共享 instances 这一唯一数据源。 */
export function createIndicatorState() {
  const { signals, readonly: stored } = createSubState({
    activeWorkspace: ChartWorkspaceId.KLine as ChartWorkspaceId,
    workspaces: Object.freeze({
      kline: Object.freeze([]) as ReadonlyArray<IndicatorInstanceConfig>,
      timeshare: Object.freeze([]) as ReadonlyArray<IndicatorInstanceConfig>,
    }) as Readonly<Record<ChartWorkspaceId, ReadonlyArray<IndicatorInstanceConfig>>>,
    configRevision: 0,
    favoriteIndicatorIds: Object.freeze<string[]>([]),
  })
  const workspaces = stored.workspaces
  const instances = computed(() => workspaces()[stored.activeWorkspace()])
  const configurations = workspaces
  const readonly = { ...stored, workspaces, instances, configurations }
  /** Action 在 batch 内直接读取原始配置，不读取尚未重算的派生快照。 */
  const currentInstances = () => stored.workspaces.peek()[stored.activeWorkspace.peek()]

  /** 写入不可变实例快照。 */
  const write = (instances: ReadonlyArray<IndicatorInstanceInput>) => {
    const previous = currentInstances()
    const next = Object.freeze(instances.map(snapshotInstance))
    batch(() => {
      const workspaceId = readonly.activeWorkspace.peek()
      signals.workspaces.set(Object.freeze({ ...stored.workspaces.peek(), [workspaceId]: next }))
      if (!calculationInstancesEqual(previous, next)) {
        signals.configRevision.set(signals.configRevision.peek() + 1)
      }
    })
  }

  /** 从统一实例集合派生副图读取接口。 */
  const subPanes = computed<ReadonlyArray<SubPaneSpec>>(() =>
    Object.freeze(
      readonly
        .instances()
        .filter((instance) => instance.role === INDICATOR_ROLE.SUB)
        .map((instance) =>
          Object.freeze({
            instanceId: instance.instanceId,
            paneId: instance.paneId,
            indicatorId: instance.indicatorId,
            ordinal: instance.ordinal,
            ...(instance.hidden ? { hidden: true as const } : {}),
            params: instance.params,
          }),
        ),
    ),
  )

  /** 按实例身份定位；所有写操作都从这里开始，不存在定义身份旁路。 */
  const findInstance = (
    instances: ReadonlyArray<IndicatorInstanceSpec>,
    instanceId: string,
  ): IndicatorInstanceSpec | undefined => instances.find((item) => item.instanceId === instanceId)

  return {
    readonly: { ...readonly, subPanes },
    actions: {
      /** 按规范定义身份收藏或取消收藏，不修改指标实例与计算 revision。 */
      setFavorite(indicatorId: string, favorite: boolean): void {
        const id = resolveIndicatorDefinitionId(indicatorId)
        if (!id) return
        const previous = readonly.favoriteIndicatorIds.peek()
        if (previous.includes(id) === favorite) return
        signals.favoriteIndicatorIds.set(
          Object.freeze(favorite ? [...previous, id] : previous.filter((entry) => entry !== id)),
        )
      },
      /** 恢复布局收藏，规范化旧身份并去重；未知定义保留以支持稍后注册的插件。 */
      restoreFavorites(ids: ReadonlyArray<string>): void {
        signals.favoriteIndicatorIds.set(
          Object.freeze([...new Set(ids.map((id) => resolveIndicatorDefinitionId(id) ?? id))]),
        )
      },
      /** 切换视图工作区；实例、参数和排序均不跨工作区同步。 */
      setActiveWorkspace(workspaceId: ChartWorkspaceId) {
        if (signals.activeWorkspace.peek() === workspaceId) return
        batch(() => {
          signals.activeWorkspace.set(workspaceId)
          signals.configRevision.set(signals.configRevision.peek() + 1)
        })
      },
      /** 用已校验的持久快照恢复两个工作区的用户指标。 */
      restoreWorkspaces(workspaces: LayoutWorkspaces) {
        const restore = (workspaceId: ChartWorkspaceId) =>
          Object.freeze(workspaces[workspaceId].instances.map(snapshotInstance))
        const next = Object.freeze({
          kline: restore(ChartWorkspaceId.KLine),
          timeshare: restore(ChartWorkspaceId.TimeShare),
        })
        batch(() => {
          signals.workspaces.set(next)
          signals.configRevision.set(signals.configRevision.peek() + 1)
        })
      },
      /** 新增一个实例并返回其稳定身份；调用方必须先分配 instanceId。 */
      addInstance(entry: IndicatorInstanceInput): string {
        const ordinal =
          entry.ordinal ??
          currentInstances()
            .filter((instance) => instance.paneId === entry.paneId)
            .reduce((maximum, instance) => Math.max(maximum, instance.ordinal), -1) + 1
        write([...currentInstances(), { ...entry, ordinal }])
        return entry.instanceId
      },
      /** 按实例身份更新可变字段；定义变化时由调用方同时给出新参数。 */
      updateInstance(instanceId: string, patch: IndicatorInstancePatch): boolean {
        const previous = currentInstances()
        const current = findInstance(previous, instanceId)
        if (!current) return false
        const next = previous.map((instance) =>
          instance.instanceId === instanceId
            ? snapshotInstance({
                ...current,
                ...patch,
                instanceId,
                params: patch.params ?? current.params,
              })
            : instance,
        )
        write(next)
        return true
      },
      /** 迁移实例归属；角色随 pane 派生，不允许只改 role 不改 paneId。 */
      moveInstance(
        instanceId: string,
        paneId: string,
        role: IndicatorInstanceRole,
        ordinal: number,
      ): boolean {
        const previous = currentInstances()
        const current = findInstance(previous, instanceId)
        if (!current) return false
        write(
          previous.map((instance) =>
            instance.instanceId === instanceId
              ? snapshotInstance({ ...current, paneId, role, ordinal })
              : instance,
          ),
        )
        return true
      },
      /** 按身份删除一个指标实例。 */
      removeInstance(instanceId: string): boolean {
        const previous = currentInstances()
        const current = findInstance(previous, instanceId)
        if (!current) return false
        write(previous.filter((instance) => instance.instanceId !== instanceId))
        return true
      },
      /** 按调用方给定的完整顺序写回 ordinal；顺序由调用方决定，只改序号。 */
      applyInstanceOrder(orderedInstanceIds: ReadonlyArray<string>): boolean {
        const previous = currentInstances()
        const byId = new Map(previous.map((instance) => [instance.instanceId, instance]))
        if (orderedInstanceIds.some((id) => !byId.has(id))) return false
        const ordinals = new Map(orderedInstanceIds.map((id, index) => [id, index]))
        write(
          previous.map((instance) => {
            const ordinal = ordinals.get(instance.instanceId)
            return ordinal === undefined ? instance : snapshotInstance({ ...instance, ordinal })
          }),
        )
        return true
      },
      /**
       * 按调用方给定的完整顺序写回指定 Pane 的 ordinal，其他 Pane 不受影响。
       *
       * 排序决策不在这里：调用方已经算好位置；本方法只校验集合一致并整批写入，
       * 不匹配时拒绝，避免出现半重排。
       */
      applyPaneInstanceOrder(paneId: string, orderedInstanceIds: ReadonlyArray<string>): boolean {
        const previous = currentInstances()
        const paneInstances = previous.filter((instance) => instance.paneId === paneId)
        if (paneInstances.length !== orderedInstanceIds.length) return false
        const byId = new Map(paneInstances.map((instance) => [instance.instanceId, instance]))
        if (orderedInstanceIds.some((id) => !byId.has(id))) return false
        const ordinals = new Map(orderedInstanceIds.map((id, index) => [id, index]))
        // 顺序未变化时不写状态，避免无意义地重建指标图层。
        if (
          paneInstances.every((instance) => instance.ordinal === ordinals.get(instance.instanceId))
        )
          return true
        write(
          previous.map((instance) => {
            const ordinal = ordinals.get(instance.instanceId)
            return ordinal === undefined ? instance : snapshotInstance({ ...instance, ordinal })
          }),
        )
        return true
      },
    },
    dispose() {
      batch(() => {
        signals.activeWorkspace.set(ChartWorkspaceId.KLine)
        signals.workspaces.set(
          Object.freeze({
            kline: Object.freeze([]) as ReadonlyArray<IndicatorInstanceConfig>,
            timeshare: Object.freeze([]) as ReadonlyArray<IndicatorInstanceConfig>,
          }),
        )
        signals.favoriteIndicatorIds.set(Object.freeze([]))
      })
    },
  }
}

export type IndicatorStateModule = ReturnType<typeof createIndicatorState>
