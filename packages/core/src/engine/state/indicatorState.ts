// 统一管理主图与副图指标实例的状态模块。
import { batch, computed, createSubState } from '../../foundation/reactivity/signal'
import { deepFreezeSnapshot } from './immutable'
import { getRegisteredIndicatorDefinition } from '../indicators/indicatorDefinitionRegistry'

/** 指标实例所在的图表区域。 */
export type IndicatorInstanceRole = 'main' | 'sub'
export type IndicatorInstanceSource = 'user' | 'mode'

/** 统一的指标实例业务状态；主图固定 paneId 为 main。 */
export interface IndicatorInstanceSpec {
  /** 指标实例唯一身份，不参与 pane 布局或指标能力判断。 */
  readonly instanceId: string
  readonly indicatorId: string
  readonly paneId: string
  readonly role: IndicatorInstanceRole
  /** 同类指标的显示序号，不参与任何身份或能力判断。 */
  readonly ordinal: number
  /** mode 实例由 Kernel 管理，用户指标操作不能删除。 */
  readonly source?: IndicatorInstanceSource
  readonly params: Readonly<Record<string, unknown>>
}

/** 写入指标状态时允许由 State 生成缺省实例身份，供旧 API 迁移使用。 */
export type IndicatorInstanceInput = Omit<IndicatorInstanceSpec, 'instanceId' | 'ordinal'> &
  Partial<Pick<IndicatorInstanceSpec, 'instanceId' | 'ordinal'>>

/** 副图对 pane 投影使用的兼容结构。 */
export interface SubPaneSpec {
  readonly instanceId: string
  readonly paneId: string
  readonly indicatorId: string
  readonly ordinal: number
  readonly params: Readonly<Record<string, unknown>>
}

/** 旧 pane API 的输入结构；显式 paneId 不再承担实例身份。 */
export type SubPaneInput = Omit<SubPaneSpec, 'instanceId' | 'ordinal'> &
  Partial<Pick<SubPaneSpec, 'instanceId' | 'ordinal'>>

/** 解析 mode 请求的实例，优先复用可提供相同能力的用户副图。 */
export function resolveModeIndicatorInstances(
  requested: ReadonlyArray<IndicatorInstanceInput>,
  current: ReadonlyArray<IndicatorInstanceSpec>,
): ReadonlyArray<IndicatorInstanceInput> {
  const canonicalIndicatorId = (indicatorId: string): string =>
    getRegisteredIndicatorDefinition(indicatorId)?.name.toLowerCase() ?? indicatorId.toLowerCase()
  const userSubIndicatorIds = new Set(
    current
      .filter((instance) => instance.role === 'sub' && instance.source !== 'mode')
      .map((instance) => canonicalIndicatorId(instance.indicatorId)),
  )
  return requested.filter(
    (instance) =>
      instance.role !== 'sub' ||
      !userSubIndicatorIds.has(canonicalIndicatorId(instance.indicatorId)),
  )
}

/** 冻结统一指标实例，隔离调用方对参数对象的修改。 */
function snapshotInstance(entry: IndicatorInstanceInput): IndicatorInstanceSpec {
  const snapshot = {
    instanceId: entry.instanceId ?? `legacy:${entry.paneId}`,
    indicatorId: entry.indicatorId,
    paneId: entry.paneId,
    role: entry.role,
    ordinal: entry.ordinal ?? 0,
    params: deepFreezeSnapshot(entry.params),
  }
  return Object.freeze(
    entry.source === 'mode' ? { ...snapshot, source: 'mode' as const } : snapshot,
  )
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
    configRevision: 0,
  })

  /** 写入不可变实例快照。 */
  const write = (instances: ReadonlyArray<IndicatorInstanceInput>) => {
    batch(() => {
      signals.instances.set(Object.freeze(instances.map(snapshotInstance)))
      signals.configRevision.set(signals.configRevision.peek() + 1)
    })
  }

  /** 从统一实例集合派生副图读取接口。 */
  const subPanes = computed<ReadonlyArray<SubPaneSpec>>(() =>
    Object.freeze(
      readonly
        .instances()
        .filter((instance) => instance.role === 'sub')
        .map((instance) =>
          Object.freeze({
            instanceId: instance.instanceId,
            paneId: instance.paneId,
            indicatorId: instance.indicatorId,
            ordinal: instance.ordinal,
            params: instance.params,
          }),
        ),
    ),
  )

  /** 查找指定主图指标实例的数组下标。 */
  const findMainIndex = (
    instances: ReadonlyArray<IndicatorInstanceSpec>,
    indicatorId: string,
  ): number =>
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
      instanceId: `main:${indicatorId}`,
      indicatorId,
      paneId: 'main',
      role: 'main',
      ordinal: 0,
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
        write(
          prev.filter(
            (instance) =>
              instance.source === 'mode' ||
              !(instance.role === 'main' && instance.indicatorId === indicatorId),
          ),
        )
      },
      /** 仅更新已存在主图实例的参数。 */
      setMainParams(id: string, params: Record<string, number | boolean | string>) {
        const indicatorId = id.toUpperCase()
        if (findMainIndex(readonly.instances.peek(), indicatorId) < 0) return
        upsertMain(indicatorId, params)
      },
      /** 整体替换主图实例，保留副图实例。 */
      replaceAllMain(instances: ReadonlyArray<IndicatorInstanceSpec>) {
        const retained = readonly.instances
          .peek()
          .filter((instance) => instance.role === 'sub' || instance.source === 'mode')
        write([
          ...retained.filter((instance) => instance.role === 'main'),
          ...instances.map((entry) => ({ ...entry, role: 'main' as const, paneId: 'main' })),
          ...retained.filter((instance) => instance.role === 'sub'),
        ])
      },
      /** 清空全部主图实例。 */
      clearMain() {
        write(
          readonly.instances
            .peek()
            .filter((instance) => instance.role === 'sub' || instance.source === 'mode'),
        )
      },
      /** 整体替换当前 mode 所需的系统实例，保留用户指标实例。 */
      replaceModeInstances(instances: ReadonlyArray<IndicatorInstanceInput>) {
        const current = readonly.instances.peek()
        const userInstances = current.filter((instance) => instance.source !== 'mode')
        const resolvedModeInstances = resolveModeIndicatorInstances(instances, current)
        write([
          ...resolvedModeInstances.map((entry) => ({ ...entry, source: 'mode' as const })),
          ...userInstances,
        ])
      },
      /** 按 paneId 新增或替换副图实例。 */
      upsertSub(entry: SubPaneInput) {
        const prev = readonly.instances.peek()
        const index = findSubIndex(prev, entry.paneId)
        if (index >= 0 && prev[index]!.source === 'mode') return
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
        const entry = prev.find((instance) => instance.role === 'sub' && instance.paneId === paneId)
        if (!entry || entry.source === 'mode') return
        write(prev.filter((instance) => !(instance.role === 'sub' && instance.paneId === paneId)))
      },
      /** 替换已存在副图实例绑定的指标和参数。 */
      replaceSub(entry: SubPaneInput) {
        const prev = readonly.instances.peek()
        const index = findSubIndex(prev, entry.paneId)
        if (index < 0 || prev[index]!.source === 'mode') return
        const next = [...prev]
        next[index] = snapshotInstance({
          ...entry,
          instanceId: entry.instanceId ?? prev[index]!.instanceId,
          ordinal: entry.ordinal ?? prev[index]!.ordinal,
          role: 'sub',
        })
        write(next)
      },
      /** 替换已存在副图实例的完整参数。 */
      setSubParams(paneId: string, params: Readonly<Record<string, unknown>>) {
        const prev = readonly.instances.peek()
        const index = findSubIndex(prev, paneId)
        if (index < 0 || prev[index]!.source === 'mode') return
        const current = prev[index]!
        const next = [...prev]
        next[index] = snapshotInstance({ ...current, params })
        write(next)
      },
      /** 清空全部副图实例。 */
      clearSub() {
        write(
          readonly.instances
            .peek()
            .filter((instance) => instance.role === 'main' || instance.source === 'mode'),
        )
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
