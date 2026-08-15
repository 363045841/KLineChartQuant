// 统一管理主图与副图指标实例的状态模块。
import { batch, computed, createSubState } from '../../foundation/reactivity/signal'
import { deepFreezeSnapshot } from './immutable'

/** 指标实例所在的图表区域。 */
export type IndicatorInstanceRole = 'main' | 'sub'

/** 统一的指标实例业务状态；主图固定 paneId 为 main。 */
export interface IndicatorInstanceSpec {
  readonly indicatorId: string
  readonly paneId: string
  readonly role: IndicatorInstanceRole
  readonly params: Readonly<Record<string, unknown>>
}

/** 副图对 pane 投影使用的兼容结构。 */
export interface SubPaneSpec {
  readonly paneId: string
  readonly indicatorId: string
  readonly params: Readonly<Record<string, unknown>>
}

/** 冻结统一指标实例，隔离调用方对参数对象的修改。 */
function snapshotInstance(entry: IndicatorInstanceSpec): IndicatorInstanceSpec {
  return Object.freeze({
    indicatorId: entry.indicatorId,
    paneId: entry.paneId,
    role: entry.role,
    params: deepFreezeSnapshot(entry.params),
  })
}

/** 判断副图 upsert 是否与当前实例完全相同，避免无效通知。 */
function subInstanceEqual(left: IndicatorInstanceSpec, right: IndicatorInstanceSpec): boolean {
  if (left.indicatorId !== right.indicatorId || left.paneId !== right.paneId) return false
  const leftKeys = Object.keys(left.params)
  const rightKeys = Object.keys(right.params)
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => Object.is(left.params[key], right.params[key]))
  )
}

/** 创建指标实例状态，主图和副图共享 instances 这一唯一数据源。 */
export function createIndicatorState() {
  const { signals, readonly } = createSubState({
    instances: Object.freeze([]) as ReadonlyArray<IndicatorInstanceSpec>,
  })

  /** 写入不可变实例快照。 */
  const write = (instances: ReadonlyArray<IndicatorInstanceSpec>) => {
    signals.instances.set(Object.freeze(instances.map(snapshotInstance)))
  }

  /** 从统一实例集合派生副图读取接口。 */
  const subPanes = computed<ReadonlyArray<SubPaneSpec>>(() =>
    Object.freeze(
      readonly.instances()
        .filter((instance) => instance.role === 'sub')
        .map((instance) =>
          Object.freeze({
            paneId: instance.paneId,
            indicatorId: instance.indicatorId,
            params: instance.params,
          }),
        ),
    ),
  )

  /** 查找指定主图指标实例的数组下标。 */
  const findMainIndex = (instances: ReadonlyArray<IndicatorInstanceSpec>, indicatorId: string): number =>
    instances.findIndex(
      (instance) => instance.role === 'main' && instance.indicatorId === indicatorId,
    )

  /** 查找指定副图 pane 实例的数组下标。 */
  const findSubIndex = (instances: ReadonlyArray<IndicatorInstanceSpec>, paneId: string): number =>
    instances.findIndex((instance) => instance.role === 'sub' && instance.paneId === paneId)

  /** 写入或更新主图实例，新实例始终位于副图实例之前。 */
  const upsertMain = (id: string, params: Record<string, number | boolean | string>) => {
    const indicatorId = id.toUpperCase()
    const prev = readonly.instances.peek()
    const index = findMainIndex(prev, indicatorId)
    const existing = index < 0 ? undefined : prev[index]
    const next = [...prev]
    const entry = snapshotInstance({
      indicatorId,
      paneId: 'main',
      role: 'main',
      params: { ...(existing?.params ?? {}), ...params },
    })
    if (index >= 0) next[index] = entry
    else {
      const firstSubIndex = next.findIndex((instance) => instance.role === 'sub')
      if (firstSubIndex < 0) next.push(entry)
      else next.splice(firstSubIndex, 0, entry)
    }
    write(next)
  }

  return {
    readonly: { ...readonly, subPanes },
    actions: {
      /** 按 indicatorId 写入或合并主图实例参数。 */
      upsertMain(id: string, params: Record<string, number | boolean | string>) {
        upsertMain(id, params)
      },
      /** 按 indicatorId 删除主图实例。 */
      removeMain(id: string) {
        const indicatorId = id.toUpperCase()
        const prev = readonly.instances.peek()
        if (findMainIndex(prev, indicatorId) < 0) return
        write(prev.filter((instance) => !(instance.role === 'main' && instance.indicatorId === indicatorId)))
      },
      /** 仅更新已存在主图实例的参数。 */
      setMainParams(id: string, params: Record<string, number | boolean | string>) {
        const indicatorId = id.toUpperCase()
        if (findMainIndex(readonly.instances.peek(), indicatorId) < 0) return
        upsertMain(indicatorId, params)
      },
      /** 整体替换主图实例，保留副图实例。 */
      replaceAllMain(instances: ReadonlyArray<IndicatorInstanceSpec>) {
        const subInstances = readonly.instances.peek().filter((instance) => instance.role === 'sub')
        write([
          ...instances.map((entry) => ({ ...entry, role: 'main' as const, paneId: 'main' })),
          ...subInstances,
        ])
      },
      /** 清空全部主图实例。 */
      clearMain() {
        write(readonly.instances.peek().filter((instance) => instance.role === 'sub'))
      },
      /** 按 paneId 新增或替换副图实例。 */
      upsertSub(entry: SubPaneSpec) {
        const prev = readonly.instances.peek()
        const index = findSubIndex(prev, entry.paneId)
        const nextEntry = snapshotInstance({ ...entry, role: 'sub' })
        if (index < 0) write([...prev, nextEntry])
        else if (subInstanceEqual(prev[index]!, nextEntry)) return
        else {
          const next = [...prev]
          next[index] = nextEntry
          write(next)
        }
      },
      /** 按 paneId 删除副图实例。 */
      removeSub(paneId: string) {
        const prev = readonly.instances.peek()
        if (findSubIndex(prev, paneId) < 0) return
        write(prev.filter((instance) => !(instance.role === 'sub' && instance.paneId === paneId)))
      },
      /** 替换已存在副图实例绑定的指标和参数。 */
      replaceSub(entry: SubPaneSpec) {
        const prev = readonly.instances.peek()
        const index = findSubIndex(prev, entry.paneId)
        if (index < 0) return
        const next = [...prev]
        next[index] = snapshotInstance({ ...entry, role: 'sub' })
        write(next)
      },
      /** 替换已存在副图实例的完整参数。 */
      setSubParams(paneId: string, params: Readonly<Record<string, unknown>>) {
        const prev = readonly.instances.peek()
        const index = findSubIndex(prev, paneId)
        if (index < 0) return
        const current = prev[index]!
        const next = [...prev]
        next[index] = snapshotInstance({ ...current, params })
        write(next)
      },
      /** 清空全部副图实例。 */
      clearSub() {
        write(readonly.instances.peek().filter((instance) => instance.role === 'main'))
      },
    },
    dispose() {
      batch(() => {
        signals.instances.set(Object.freeze([]))
      })
    },
  }
}

export type IndicatorStateModule = ReturnType<typeof createIndicatorState>
