// 统一管理主图与副图指标实例的状态模块。
import { batch, computed, createSubState } from '../../foundation/reactivity/signal.js'
import { ChartWorkspaceId } from '../../foundation/types/chartView.js'
import {
  getRegisteredIndicatorDefinition,
  resolveIndicatorDefinitionId,
} from '../indicators/indicatorDefinitionRegistry.js'
import { createIndicatorInstanceId } from '../indicators/instances/api/instanceIdentity.js'
import type { LayoutWorkspaces } from '../layout/index.js'
import { deepFreezeSnapshot } from './immutable.js'

/** 指标实例所在的图表区域。 */
export type IndicatorInstanceRole = 'main' | 'sub'

/** 实例归属属于用户配置；无需等待指标定义即可恢复主副图位置。 */
export interface IndicatorInstanceConfig {
  /** 用户持久化配置不携带模式实例的运行时来源。 */
  readonly source?: never
  readonly instanceId: string
  readonly indicatorId: string
  readonly paneId: string
  readonly role: IndicatorInstanceRole
  readonly ordinal: number
  readonly hidden?: boolean
  readonly params: Readonly<Record<string, unknown>>
}

/** 系统实例由图表模式拥有，不进入用户布局文档。 */
type StoredIndicatorInstance =
  | IndicatorInstanceConfig
  | (IndicatorInstanceSpec & { readonly source: 'mode' })

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
  /** 隐藏只影响图表绘制，图例仍保留并置灰；不参与计算身份。 */
  readonly hidden?: boolean
  readonly params: Readonly<Record<string, unknown>>
}

/** 写入指标状态必须提供已分配的实例身份，序号可由状态入口补齐。 */
export type IndicatorInstanceInput = Omit<IndicatorInstanceSpec, 'ordinal'> &
  Partial<Pick<IndicatorInstanceSpec, 'ordinal'>>

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

/** 副图状态写入输入；PaneManager 负责为用户 pane 生成实例身份。 */
export type SubPaneInput = Omit<SubPaneSpec, 'instanceId' | 'ordinal'> &
  Partial<Pick<SubPaneSpec, 'instanceId' | 'ordinal'>>

/** 冻结统一指标实例，隔离调用方对参数对象的修改。 */
function snapshotInstance(entry: IndicatorInstanceInput): StoredIndicatorInstance {
  const snapshot = {
    instanceId: entry.instanceId,
    indicatorId: entry.indicatorId,
    paneId: entry.paneId,
    role: entry.role,
    ordinal: entry.ordinal ?? 0,
    params: deepFreezeSnapshot(entry.params),
    ...(entry.hidden ? { hidden: true as const } : {}),
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
      kline: Object.freeze([]) as ReadonlyArray<StoredIndicatorInstance>,
      timeshare: Object.freeze([]) as ReadonlyArray<StoredIndicatorInstance>,
    }) as Readonly<Record<ChartWorkspaceId, ReadonlyArray<StoredIndicatorInstance>>>,
    configRevision: 0,
    favoriteIndicatorIds: Object.freeze<string[]>([]),
  })
  const workspaces = stored.workspaces
  const instances = computed(() => workspaces()[stored.activeWorkspace()])
  const configurations = computed(() =>
    Object.freeze({
      kline: Object.freeze(
        stored
          .workspaces()
          .kline.filter((entry): entry is IndicatorInstanceConfig => !('source' in entry)),
      ),
      timeshare: Object.freeze(
        stored
          .workspaces()
          .timeshare.filter((entry): entry is IndicatorInstanceConfig => !('source' in entry)),
      ),
    }),
  )
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
        .filter((instance) => instance.role === 'sub')
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

  /** 查找指定副图 pane 实例的数组下标。 */
  const findSubIndex = (instances: ReadonlyArray<IndicatorInstanceSpec>, paneId: string): number =>
    instances.findIndex((instance) => instance.role === 'sub' && instance.paneId === paneId)

  /**
   * 追加一个主图实例，返回新实例身份。
   *
   * 主图实例一律使用独立身份：允许同一指标多次添加后，实例之间只能靠身份区分，
   * 不能再由定义派生（派生会让第二个实例覆盖第一个）。
   */
  const addMainInstance = (
    definitionId: string,
    params: Readonly<Record<string, unknown>>,
  ): string => {
    const prev = currentInstances()
    const entry = snapshotInstance({
      instanceId: createIndicatorInstanceId(),
      indicatorId: definitionId,
      paneId: 'main',
      role: 'main',
      ordinal: 0,
      params: { ...params },
    })
    const next = [...prev]
    const firstSubIndex = next.findIndex((instance) => instance.role === 'sub')
    if (firstSubIndex < 0) next.push(entry)
    else next.splice(firstSubIndex, 0, entry)
    write(next)
    return entry.instanceId
  }

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
        // 系统实例由模式拥有，替换用户配置时不能顺带删除。
        const restore = (workspaceId: ChartWorkspaceId) =>
          Object.freeze([
            ...stored.workspaces.peek()[workspaceId].filter((entry) => 'source' in entry),
            ...workspaces[workspaceId].instances.map(snapshotInstance),
          ])
        const next = Object.freeze({
          kline: restore(ChartWorkspaceId.KLine),
          timeshare: restore(ChartWorkspaceId.TimeShare),
        })
        batch(() => {
          signals.workspaces.set(next)
          signals.configRevision.set(signals.configRevision.peek() + 1)
        })
      },
      /** 追加一个主图实例并返回实例身份；是否允许重复由调用方的定义声明决定。 */
      addMain(definitionId: string, params: Record<string, number | boolean | string>): string {
        return addMainInstance(definitionId, params)
      },
      /** 按实例身份删除主图实例。 */
      removeMain(instanceId: string) {
        const prev = currentInstances()
        const index = prev.findIndex((instance) => instance.instanceId === instanceId)
        const target = index < 0 ? undefined : prev[index]
        if (!target || target.role !== 'main' || target.source === 'mode') return
        write(prev.filter((instance) => instance !== target))
      },
      /** 删除某定义的全部主图实例；用于定义被移除或整体关闭指标。 */
      removeMainByDefinition(definitionId: string) {
        const prev = currentInstances()
        const next = prev.filter(
          (instance) =>
            instance.source === 'mode' ||
            !(instance.role === 'main' && instance.indicatorId === definitionId),
        )
        if (next.length !== prev.length) write(next)
      },
      /** 按实例身份合并主图实例参数。 */
      setMainParams(instanceId: string, params: Record<string, number | boolean | string>) {
        const prev = currentInstances()
        const index = prev.findIndex((instance) => instance.instanceId === instanceId)
        const target = index < 0 ? undefined : prev[index]
        if (!target || target.role !== 'main') return
        const next = [...prev]
        next[index] = snapshotInstance({ ...target, params: { ...target.params, ...params } })
        write(next)
      },
      /** 隐藏或显示指标实例；隐藏只影响绘制，图例保留并置灰，不参与计算与参数比较。 */
      setIndicatorHidden(instanceId: string, hidden: boolean) {
        const prev = currentInstances()
        const index = prev.findIndex((instance) => instance.instanceId === instanceId)
        const current = index < 0 ? undefined : prev[index]
        if (!current || current.source === 'mode' || Boolean(current.hidden) === hidden) return
        const next = [...prev]
        next[index] = snapshotInstance({ ...current, hidden })
        write(next)
      },
      /** 整体替换主图实例，保留副图实例。 */
      replaceAllMain(instances: ReadonlyArray<IndicatorInstanceSpec>) {
        const retained = currentInstances().filter(
          (instance) => instance.role === 'sub' || instance.source === 'mode',
        )
        write([
          ...retained.filter((instance) => instance.role === 'main'),
          ...instances.map((entry) => ({ ...entry, role: 'main' as const, paneId: 'main' })),
          ...retained.filter((instance) => instance.role === 'sub'),
        ])
      },
      /** 清空全部主图实例。 */
      clearMain() {
        write(
          currentInstances().filter(
            (instance) => instance.role === 'sub' || instance.source === 'mode',
          ),
        )
      },
      /** 整体替换当前 mode 所需的系统实例，保留用户指标实例。 */
      replaceModeInstances(instances: ReadonlyArray<IndicatorInstanceInput>) {
        const current = currentInstances()
        const userInstances = current.filter((instance) => instance.source !== 'mode')
        write([
          ...instances.map((entry) => ({ ...entry, source: 'mode' as const })),
          ...userInstances,
        ])
      },
      /** 按 paneId 新增或替换副图实例。 */
      upsertSub(entry: SubPaneInput) {
        const prev = currentInstances()
        const index = findSubIndex(prev, entry.paneId)
        if (index >= 0 && prev[index]!.source === 'mode') return
        const instanceId =
          entry.instanceId === undefined
            ? index < 0
              ? createIndicatorInstanceId()
              : prev[index]!.instanceId
            : entry.instanceId
        const nextEntry = snapshotInstance({ ...entry, instanceId, role: 'sub' })
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
        const prev = currentInstances()
        const entry = prev.find((instance) => instance.role === 'sub' && instance.paneId === paneId)
        if (!entry || entry.source === 'mode') return
        write(prev.filter((instance) => !(instance.role === 'sub' && instance.paneId === paneId)))
      },
      /** 替换已存在副图实例绑定的指标和参数。 */
      replaceSub(entry: SubPaneInput) {
        const prev = currentInstances()
        const index = findSubIndex(prev, entry.paneId)
        if (index < 0 || prev[index]!.source === 'mode') return
        const next = [...prev]
        next[index] = snapshotInstance({
          ...entry,
          instanceId: prev[index]!.instanceId,
          ordinal: entry.ordinal ?? prev[index]!.ordinal,
          role: 'sub',
          hidden: entry.hidden ?? prev[index]!.hidden,
        })
        write(next)
      },
      /** 替换已存在副图实例的完整参数。 */
      setSubParams(paneId: string, params: Readonly<Record<string, unknown>>) {
        const prev = currentInstances()
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
          currentInstances().filter(
            (instance) => instance.role === 'main' || instance.source === 'mode',
          ),
        )
      },
    },
    dispose() {
      batch(() => {
        signals.activeWorkspace.set(ChartWorkspaceId.KLine)
        signals.workspaces.set(
          Object.freeze({
            kline: Object.freeze([]) as ReadonlyArray<StoredIndicatorInstance>,
            timeshare: Object.freeze([]) as ReadonlyArray<StoredIndicatorInstance>,
          }),
        )
        signals.favoriteIndicatorIds.set(Object.freeze([]))
      })
    },
  }
}

export type IndicatorStateModule = ReturnType<typeof createIndicatorState>
