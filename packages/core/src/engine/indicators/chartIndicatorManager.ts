/**
 * ChartIndicatorManager —— 指标实例链路的宿主接线。
 *
 * 职责：
 * 1. 把 Kernel 的指标实例状态投影为 instances/ 链路的实例快照与计算计划；
 * 2. 执行计划并提交按 instanceId 索引的结果池；
 * 3. 逐实例生成渲染投影，主图与副图共用同一套实例身份；
 * 4. 消费协调者提交的轴绑定，维护对应指标图层，不自行调度结构投影。
 */

import { GENERIC_ERROR_CODES, KLineChartError } from '@/errors.js'
import type { ObjectAxisBinding } from '@/foundation/geometry/axisBinding.js'
import type {
  IndicatorAvailabilityReader,
  IndicatorRenderStateReader,
  PluginHostImpl,
  RenderContext,
} from '../../foundation/plugin/index.js'
import {
  type Computed,
  computed,
  effect,
  type ReadonlySignal,
} from '../../foundation/reactivity/signal.js'
import type { ColorTokens } from '../../foundation/tokens/index.js'
import type { KLineData } from '../../foundation/types/price.js'
import type {
  Layer,
  RenderObjectCommands,
  RenderObjectDescriptor,
} from '../../rendering/scene/types.js'
import type { ChartOptions, IndicatorInstance, SubPaneInfo } from '../chart/index.js'
import { type PaneAxisSpec, resolveObjectAxisMap } from '../pane/axisResolver.js'
import { UpdateLevel } from '../pane/index.js'
import type { PaneSpec } from '../pane/types.js'
import { updatePlotRange } from '../plots/impl/projectPlots.js'
import { isPlotRenderState } from '../plots/impl/readPlotState.js'
import type { PlotRenderState } from '../plots/types.js'
import { createIndicatorLayer } from '../renderers/Indicator/factory.js'
import type { IndicatorInstanceSpec, IndicatorStateModule } from '../state/indicatorState.js'
import type { VisibleRange } from '../viewport/viewport.js'
import type { IndicatorMetadata } from './indicatorMetadata.js'
import {
  INDICATOR_AVAILABILITY_SERVICE,
  INDICATOR_AVAILABILITY_SOURCE,
  INDICATOR_INSTANCE_CATALOG_SERVICE,
  INDICATOR_INSTANCE_STATE_SERVICE,
  type IndicatorAvailabilityRegistry,
  type IndicatorInstanceCatalog,
  type IndicatorInstanceDescriptor,
} from './instances/api/indicatorRenderBinding.js'
import { createIndicatorInstanceId } from './instances/api/instanceIdentity.js'
import {
  createIndicatorInstancePipeline,
  type IndicatorInstancePipeline,
} from './instances/assembly/indicatorInstancePipeline.js'
import { createInstanceCalculationDefinitions } from './instances/assembly/instanceDefinitionCatalog.js'
import {
  createIndicatorCalculationKey,
  type IndicatorParameterValue,
  type IndicatorInstance as IndicatorPipelineInstance,
  type IndicatorResultPool,
  type IndicatorSeriesResult,
} from './instances/domain/instanceModel.js'
import {
  createInlineIndicatorCalculationExecutor,
  type InlineIndicatorCalculationExecutor,
} from './instances/execution/instanceCalculationExecutors.js'
import { createInstanceCalculationScheduler } from './instances/execution/instanceCalculationScheduler.js'
import {
  getIndicatorDescriptor,
  getRegisteredIndicatorDefinition,
  type IndicatorCatalogCommit,
  indicatorCommits,
  readRegisteredDefinitions,
  resolveCanonicalIndicatorId,
} from './pipeline/index.js'
import {
  createIndicatorTimelineProjection,
  projectIndicatorCollection,
} from './projection/impl/indicatorTimelineProjection.js'
import type { IndicatorTimelineProjection } from './projection/types.js'
import { composeInstanceRenderState } from './stateComposer.js'

type ResolvedChartOptions = ChartOptions & {
  kWidth: number
  kGap: number
}

/** 把 Kernel 参数值规范化为计算身份可编码的 JSON 值；拒绝非 JSON 结构。 */
function toIndicatorParameterValue(value: unknown): IndicatorParameterValue {
  if (value === null) return null
  if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return value
  }
  if (Array.isArray(value)) return value.map(toIndicatorParameterValue)
  if (typeof value === 'object') {
    const result: Record<string, IndicatorParameterValue> = {}
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      result[key] = toIndicatorParameterValue(nested)
    }
    return result
  }
  throw new TypeError(`Unsupported indicator parameter value: ${String(value)}`)
}

/**
 * 指标实例的渲染对象身份。
 *
 * 能力按对象事实声明：可删除、可显隐、可排序、可跨 pane；指标不参与锁定。
 * 命令由图表注入，管理器不直接写 kernel。
 */
function createIndicatorObjectDescriptor(
  instanceId: string,
  definition: IndicatorMetadata,
  commands: RenderObjectCommands,
): RenderObjectDescriptor {
  return {
    kind: 'indicator',
    domainId: instanceId,
    // 对象树显示指标 Name（displayName），不使用选择器里的长标题 title。
    label: definition.displayName,
    capabilities: {
      removable: true,
      hideable: true,
      orderable: true,
      movable: true,
      lockable: false,
    },
    commands,
  }
}

export interface IndicatorDependencies {
  getMarketData?: () => import('./instances/execution/marketDataTypes.js').IndicatorMarketData
  plotColors$: ReadonlySignal<ColorTokens>
  getOption: () => ResolvedChartOptions
  getPluginHost: () => PluginHostImpl
  getRenderer: (id: string) => Layer<RenderContext> | undefined
  useRenderer: (layer: Layer<RenderContext>) => void
  removeRenderer: (id: string) => void
  /** 对象的领域命令；由图表按实例闭包到 Pane 命令面。 */
  objectCommands: (instanceId: string) => RenderObjectCommands
  /** pane ratios SSOT */
  paneRatios$: ReadonlySignal<Readonly<Record<string, number>>>
  paneSpecs$: ReadonlySignal<ReadonlyArray<PaneSpec>>
  getLastVisibleRange: () => VisibleRange
  getCrosshairPos: () => { x: number; y: number } | null
  getCrosshairPrice: () => number | null
  getActivePaneId: () => string | null
  scheduleDraw: (level?: UpdateLevel) => void
  getLayer: (id: string) => Layer | null
  /** 主图/副图统一的指标实例配置状态 */
  indicator: IndicatorStateModule
  /** 定义注销时统一走 Pane 命令，避免绕过布局与轴偏好清理。 */
  removeInstancesByDefinition: (definitionId: string) => void
}

/** 协调者一次捕获的指标资源输入；与行情计算结果分离。 */
export interface IndicatorRuntimeInputs {
  readonly instances: readonly IndicatorInstanceSpec[]
  readonly colors: ColorTokens
  readonly definitionRevision: number
}

export class ChartIndicatorManager {
  private deps: IndicatorDependencies
  private readonly pipeline: IndicatorInstancePipeline
  private readonly inlineExecutor: InlineIndicatorCalculationExecutor
  /** 取消订阅按需装配事件。 */
  private readonly disposeDefinitionSubscription: () => void
  /** 已消费的提交修订号；构造时以当前快照为基线，避免重复装配。 */
  private appliedCommitRevision: number
  private readonly calculationScheduler: ReturnType<typeof createInstanceCalculationScheduler>
  private _indicatorsComputed: Computed<ReadonlyArray<IndicatorInstance>>
  private _subPanesComputed: Computed<ReadonlyArray<SubPaneInfo>>
  /** 只记录实际拥有的图层资源，不承载实例归属、参数或更新判断。 */
  private readonly layerResources = new Set<string>()
  /** 已安装到 Pane 的轴声明；帧消费者不重新派生尚未安装的轴。 */
  private paneAxes: ReadonlyMap<string, ReadonlyArray<PaneAxisSpec>> = new Map()
  /** destroy 后不再发起计算，也不把 Worker 的拆除错误当作运行期失败。 */
  private destroyed = false

  // ========== 计算与投影运行时 ==========
  private currentData: readonly KLineData[] = []
  private currentChange: import('@363045841yyt/klinechart-plot-contracts').ComputeChange = {
    start: 0,
    end: 0,
  }
  private currentTimestamps: readonly number[] = []
  private visibleRange: VisibleRange = { start: 0, end: 0 }
  /** 非空时，计算结果需投影到该展示序列的时间戳。 */
  private displayTimestamps: readonly number[] | null = null
  private dataRevision = 0
  private hasData = false
  private resultPool: IndicatorResultPool | null = null
  private renderStates: ReadonlyMap<string, unknown> = new Map()
  /** 映射只随计算或行情时间轴变化重建，滚动和缩放复用整列投影。 */
  private timelineProjection: {
    source: readonly number[]
    target: readonly number[]
    byMinute: boolean
    projection: IndicatorTimelineProjection
  } | null = null
  /** 实例展示状态与计算投影共同决定可见输出，缓存引用供帧版本检测使用。 */
  private visibleRenderStatesCache: {
    states: ReadonlyMap<string, unknown>
    instances: readonly IndicatorInstanceSpec[]
    visible: ReadonlyMap<string, unknown>
  } | null = null
  /** 绘图点由结果和展示配置派生；可见区间变化只重算范围。 */
  private readonly plotProjections = new WeakMap<
    IndicatorSeriesResult,
    {
      presentation: Readonly<Record<string, unknown>>
      colors: ColorTokens
      state: PlotRenderState
      timeline: IndicatorTimelineProjection
    }
  >()
  /** 每个实例尚未完成的异步来源集合；集合非空即视为加载中。 */
  private readonly availabilitySources = new Map<string, Set<string>>()

  /** 按指标实例身份提供整份可见输出；隐藏不删除计算结果。 */
  getRenderStatesSnapshot(): ReadonlyMap<string, unknown> {
    const instances = this.deps.indicator.readonly.instances.peek()
    const cached = this.visibleRenderStatesCache
    if (cached?.states === this.renderStates && cached.instances === instances) {
      return cached.visible
    }
    const visible = new Map<string, unknown>()
    for (const instance of instances) {
      if (instance.hidden === true || !this.renderStates.has(instance.instanceId)) continue
      visible.set(instance.instanceId, this.renderStates.get(instance.instanceId))
    }
    this.visibleRenderStatesCache = { states: this.renderStates, instances, visible }
    return visible
  }
  private onResultsAppliedCallback: (() => void) | null = null

  /** 消费一次注册提交：先移除，再新增，最后替换。 */
  private applyDefinitionCommit(commit: IndicatorCatalogCommit): void {
    this.removeCommittedDefinitions(commit.removed)
    if (commit.added.length > 0) {
      this.inlineExecutor.addDefinitions(createInstanceCalculationDefinitions(commit.added))
    }
    if (commit.updated.length > 0) this.replaceCommittedDefinitions(commit.updated)
  }

  /** 移除已删除定义对应的实例与计算缓存。 */
  private removeCommittedDefinitions(definitions: readonly IndicatorMetadata[]): void {
    for (const definition of definitions) {
      const canonical = resolveCanonicalIndicatorId(definition)
      this.deps.removeInstancesByDefinition(canonical)
      this.inlineExecutor.removeDefinitions([definition.name])
    }
  }

  /** 替换定义：丢弃旧计算缓存、重挂实例并重算。 */
  private replaceCommittedDefinitions(definitions: readonly IndicatorMetadata[]): void {
    this.calculationScheduler.invalidateDefinitions(definitions.map((item) => item.name))
    this.inlineExecutor.updateDefinitions(createInstanceCalculationDefinitions(definitions))
    const revision = this.pipeline.snapshot().calculationRevision
    this.syncPipeline(this.deps.indicator.readonly.instances.peek())
    if (revision === this.pipeline.snapshot().calculationRevision) this.requestCompute()
  }

  constructor(deps: IndicatorDependencies) {
    this.deps = deps
    // 实例链路：Kernel 实例配置为输入，计算计划与结果池为输出。
    this.pipeline = createIndicatorInstancePipeline({
      createId: createIndicatorInstanceId,
      initial: this.toPipelineInstances(deps.indicator.readonly.instances.peek()),
      onCalculationPlanChanged: () => this.requestCompute(),
    })

    // 计算经注册定义委派；Script 服务管理自己的 Worker，不创建平行执行链路。
    this.inlineExecutor = createInlineIndicatorCalculationExecutor(
      createInstanceCalculationDefinitions(readRegisteredDefinitions()),
      deps.getMarketData,
    )
    // 注册表只发一次提交摘要：新增装配计算定义，替换丢弃旧缓存并重算，移除卸载实例。
    this.appliedCommitRevision = indicatorCommits.peek()?.revision ?? 0
    this.disposeDefinitionSubscription = effect(() => {
      const commit = indicatorCommits()
      if (commit === null || commit.revision <= this.appliedCommitRevision) return
      this.appliedCommitRevision = commit.revision
      this.applyDefinitionCommit(commit)
    })

    this.calculationScheduler = createInstanceCalculationScheduler({
      pipeline: this.pipeline,
      executor: this.inlineExecutor,
      onCommit: ({ pool }) => this.applyCommittedPool(pool),
      onPending: (instanceIds, pending) => {
        for (const id of instanceIds)
          this.reportAvailability(id, INDICATOR_AVAILABILITY_SOURCE.compute, pending)
      },
      onError: (error) => this.handleCalculationError(error),
    })

    this.registerPluginServices()

    // 派生信号
    this._indicatorsComputed = computed<ReadonlyArray<IndicatorInstance>>(() =>
      this.deps.indicator.readonly.instances().map((instance) => {
        const label =
          getIndicatorDescriptor(instance.indicatorId)?.displayName ?? instance.indicatorId
        return {
          id: instance.instanceId,
          definitionId: instance.indicatorId,
          label,
          name: label,
          paneId: instance.paneId,
          ordinal: instance.ordinal,
          params: { ...instance.params },
        }
      }),
    )
    this._subPanesComputed = computed<ReadonlyArray<SubPaneInfo>>(() => {
      const ratios = deps.paneRatios$()
      const paneOrder = new Map(deps.paneSpecs$().map((pane, index) => [pane.id, index]))
      return this.deps.indicator.readonly
        .subPanes()
        .map((entry) => ({
          instanceId: entry.instanceId,
          paneId: entry.paneId,
          indicatorId: entry.indicatorId,
          ordinal: entry.ordinal,
          params: { ...entry.params },
          ratio: ratios[entry.paneId] ?? 1,
        }))
        .sort(
          (left, right) =>
            (paneOrder.get(left.paneId) ?? Number.MAX_SAFE_INTEGER) -
            (paneOrder.get(right.paneId) ?? Number.MAX_SAFE_INTEGER),
        )
    })
  }

  /** 仅捕获资源输入，追踪依赖由协调者的唯一订阅负责。 */
  readRuntimeInputs(): IndicatorRuntimeInputs {
    return {
      instances: this.deps.indicator.readonly.instances(),
      colors: this.deps.plotColors$(),
      definitionRevision: indicatorCommits()?.revision ?? 0,
    }
  }

  /** 轴安装阶段发布绑定，后续范围、图层和标签读取同一份声明。 */
  acceptPaneAxes(axes: ReadonlyMap<string, ReadonlyArray<PaneAxisSpec>>): void {
    this.paneAxes = axes
  }

  /** 目标行情更新复用现有调度器，旧任务结果由请求版本屏障丢弃。 */
  invalidateMarketData(): void {
    this.requestCompute()
  }

  /** 消费协调者快照和已安装绑定，只同步指标实例、输出与图层。 */
  projectLayers(inputs: IndicatorRuntimeInputs): void {
    const instances = inputs.instances
    const readyInstances = instances.filter((instance) =>
      getRegisteredIndicatorDefinition(instance.indicatorId),
    )
    const activeInstanceIds = new Set(instances.map((instance) => instance.instanceId))
    for (const instanceId of [...this.availabilitySources.keys()]) {
      if (!activeInstanceIds.has(instanceId)) this.availabilitySources.delete(instanceId)
    }

    const axesByPane = this.paneAxes
    const instanceAxes = resolveObjectAxisMap(axesByPane)
    // 协调者已经判断资源输入变化，这里完整应用同一份输入。
    this.releaseLayerResources()
    this.syncPipeline(readyInstances)
    this.reprojectRenderStates(inputs.colors)
    for (const instance of readyInstances) {
      const definition = getRegisteredIndicatorDefinition(instance.indicatorId)!
      const layer = createIndicatorLayer({
        definition,
        paneId: instance.paneId,
        indicatorId: instance.indicatorId,
        instanceId: instance.instanceId,
        axisId: instanceAxes.get(instance.instanceId)!,
        params: { ...instance.params },
        object: createIndicatorObjectDescriptor(
          instance.instanceId,
          definition,
          this.deps.objectCommands(instance.instanceId),
        ),
      })
      // 隐藏只切换可见性：对象与命令常驻，对象树才能重新显示它。
      layer.visible = instance.hidden !== true
      // 同 pane 的实例按 ordinal 叠加：z 是层带内唯一排序键，对象树顺序与绘制顺序一致。
      layer.z += instance.ordinal
      this.mountLayerResource(layer)
    }
    this.deps.scheduleDraw()
  }

  /** 把 Kernel 的实例配置单向投影为实例链路的计算实例。 */
  private syncPipeline(desired: ReadonlyArray<IndicatorInstanceSpec>): void {
    const desiredInstances = this.toPipelineInstances(desired)
    const existing = this.pipeline.snapshot().instances
    const desiredIds = new Set(desiredInstances.map((instance) => instance.instanceId))
    for (const instanceId of [...existing.keys()]) {
      if (!desiredIds.has(instanceId)) this.pipeline.instances.remove(instanceId)
    }
    for (const next of desiredInstances) {
      const current = this.pipeline.instances.get(next.instanceId)
      if (!current) {
        this.pipeline.instances.create(next)
        continue
      }
      if (current.definitionId !== next.definitionId) {
        this.pipeline.instances.remove(next.instanceId)
        this.pipeline.instances.create(next)
        continue
      }
      if (
        createIndicatorCalculationKey(current.calculation) !==
        createIndicatorCalculationKey(next.calculation)
      ) {
        this.pipeline.instances.update(next.instanceId, {
          kind: 'calculation',
          params: next.calculation.params,
          context: next.calculation.context,
        })
      }
      if (
        current.paneId !== next.paneId ||
        !ChartIndicatorManager.samePresentation(current.presentation, next.presentation)
      ) {
        this.pipeline.instances.update(next.instanceId, {
          kind: 'presentation',
          paneId: next.paneId,
          presentation: next.presentation,
        })
      }
    }
  }

  /** 展示配置是扁平原始值记录，逐键比较即可判定是否变化。 */
  private static samePresentation(
    left: Readonly<Record<string, unknown>>,
    right: Readonly<Record<string, unknown>>,
  ): boolean {
    const leftKeys = Object.keys(left)
    if (leftKeys.length !== Object.keys(right).length) return false
    return leftKeys.every((key) => Object.is(left[key], right[key]))
  }

  /** 将 Kernel 实例规格转换为实例领域模型。 */
  private toPipelineInstance(spec: IndicatorInstanceSpec): IndicatorPipelineInstance | null {
    const metadata = getRegisteredIndicatorDefinition(spec.indicatorId)
    if (!metadata?.runtime) return null
    const definitionId = metadata.name
    const defaults = ChartIndicatorManager.resolveDefaultParams(metadata.runtime.defaultParams)
    const params: Record<string, IndicatorParameterValue> = {}
    for (const name of Object.keys(defaults)) {
      const value = spec.params[name] ?? defaults[name]
      if (value === undefined) continue
      params[name] = toIndicatorParameterValue(value)
    }
    return {
      instanceId: spec.instanceId,
      definitionId,
      paneId: spec.paneId,
      calculation: {
        definitionId,
        params,
        context: { definitionRevision: metadata.runtime.revision ?? 0 },
      },
      presentation: ChartIndicatorManager.resolvePresentation(metadata, spec.params),
    }
  }

  /** 一次性批量转换 Kernel 实例集合，过滤掉不可计算的展示型指标。 */
  private toPipelineInstances(
    specs: ReadonlyArray<IndicatorInstanceSpec>,
  ): ReadonlyArray<IndicatorPipelineInstance> {
    const instances: IndicatorPipelineInstance[] = []
    for (const spec of specs) {
      const instance = this.toPipelineInstance(spec)
      if (instance) instances.push(instance)
    }
    return instances
  }

  /** 解析 runtime.defaultParams，支持函数与常量两种声明。 */
  private static resolveDefaultParams(value: unknown): Record<string, unknown> {
    if (typeof value === 'function') return (value as () => Record<string, unknown>)()
    if (value && typeof value === 'object') return value as Record<string, unknown>
    return {}
  }

  /** 从 Kernel 实例参数中提取展示配置。 */
  private static resolvePresentation(
    metadata: IndicatorMetadata,
    params: Readonly<Record<string, unknown>>,
  ): Readonly<Record<string, unknown>> {
    const defaults = metadata.presentation?.defaultOptions
    if (!defaults) return {}
    const presentation: Record<string, unknown> = {}
    for (const name of Object.keys(defaults)) {
      const value = params[name] ?? defaults[name]
      if (value === undefined) continue
      presentation[name] = value
    }
    return presentation
  }

  /** 注册实例状态读取与实例目录服务，供 renderer / 图例消费。 */
  private registerPluginServices(): void {
    const host = this.deps.getPluginHost()
    host.registerService(INDICATOR_INSTANCE_STATE_SERVICE, this.createRenderStateReader())
    host.registerService(INDICATOR_INSTANCE_CATALOG_SERVICE, this.createInstanceCatalog())
    host.registerService(INDICATOR_AVAILABILITY_SERVICE, this.createAvailabilityRegistry())
  }

  /**
   * 上报某异步来源在实例上的等待状态。
   * 多来源以集合叠加，任一来源未完成即视为加载中。
   */
  reportAvailability(instanceId: string, source: string, pending: boolean): void {
    const sources = this.availabilitySources.get(instanceId)
    if (pending) {
      if (sources?.has(source)) return
      const next = sources ?? new Set<string>()
      next.add(source)
      this.availabilitySources.set(instanceId, next)
    } else {
      if (!sources?.delete(source)) return
      if (sources.size === 0) this.availabilitySources.delete(instanceId)
    }
    this.deps.scheduleDraw()
  }

  /** 指定实例是否仍在等待任一异步来源完成。 */
  private isInstanceLoading(instanceId: string): boolean {
    return (this.availabilitySources.get(instanceId)?.size ?? 0) > 0
  }

  /** 供帧上下文读取实例异步可用性的只读视图。 */
  createAvailabilityReader(): IndicatorAvailabilityReader {
    return { isLoading: (instanceId) => this.isInstanceLoading(instanceId) }
  }

  /** 供宿主注册的实例可用性注册表：第三方异步来源经此上报。 */
  private createAvailabilityRegistry(): IndicatorAvailabilityRegistry {
    return Object.freeze({
      report: (instanceId: string, source: string, pending: boolean) =>
        this.reportAvailability(instanceId, source, pending),
      isLoading: (instanceId: string) => this.isInstanceLoading(instanceId),
    })
  }

  /** 当前启用实例目录；主图与副图按同一实例身份枚举。 */
  private createInstanceCatalog(): IndicatorInstanceCatalog {
    const descriptors = (
      filter: (instance: IndicatorInstanceSpec) => boolean,
    ): ReadonlyArray<IndicatorInstanceDescriptor> =>
      this.deps.indicator.readonly.instances
        .peek()
        .filter(filter)
        .map((instance) => ({
          instanceId: instance.instanceId,
          definitionId: instance.indicatorId,
          paneId: instance.paneId,
          ordinal: instance.ordinal,
          hidden: instance.hidden === true,
          params: instance.params,
        }))
    return Object.freeze({
      listInstances: () =>
        descriptors(() => true)
          .slice()
          .sort((left, right) => left.ordinal - right.ordinal),
      listPaneInstances: (paneId: string) =>
        descriptors((instance) => instance.paneId === paneId)
          .slice()
          .sort((left, right) => left.ordinal - right.ordinal),
    })
  }

  /** 数据更新入口：K 线计算，可选把结果投影到展示时间戳序列。 */
  updateIndicatorData(
    data: readonly KLineData[],
    change: import('@363045841yyt/klinechart-plot-contracts').ComputeChange,
    visibleRange: VisibleRange,
    dataRevision?: number,
    displayTimestamps: readonly number[] | null = null,
  ): void {
    this.currentData = data
    this.currentChange = change
    this.currentTimestamps = data.map((item) => item.timestamp)
    this.visibleRange = visibleRange
    this.displayTimestamps = displayTimestamps
    this.dataRevision = dataRevision ?? this.dataRevision + 1
    this.hasData = data.length > 0
    if (this.reprojectRenderStates()) this.deps.scheduleDraw()
    this.requestCompute()
  }

  /** 计算计划或数据变化后请求一次调度；无数据时不触发。 */
  private requestCompute(): void {
    if (this.destroyed) return
    if (!this.hasData) {
      this.calculationScheduler.invalidate()
      return
    }
    void this.calculationScheduler.compute({
      dataRevision: this.dataRevision,
      timestamps: this.currentTimestamps,
      data: this.currentData,
      change: this.currentChange,
    })
  }

  /** 结果池始终保留计算时的时间轴；展示映射在投影边界生成。 */
  private applyCommittedPool(pool: IndicatorResultPool): void {
    this.resultPool = pool
    this.renderStates = this.composeRenderStates(pool)
    this.deps.scheduleDraw()
    this.onResultsAppliedCallback?.()
  }

  /** 调度错误直接报告，不切换执行链路或重试另一份实现。 */
  private handleCalculationError(error: unknown): void {
    if (this.destroyed) return
    console.error('[ChartIndicatorManager] Indicator calculation failed:', error)
  }

  /** 设置计算结果应用完毕回调，用于串联 Alert 等管线。 */
  setOnResultsApplied(callback: () => void): void {
    this.onResultsAppliedCallback = callback
  }

  /** 按 instanceId 读取已提交结果；同帧 renderer 看到同一份投影。 */
  createRenderStateReader(): IndicatorRenderStateReader {
    return {
      get: <T = unknown>(instanceId: string): T | undefined =>
        this.getRenderStatesSnapshot().get(instanceId) as T | undefined,
    }
  }

  /** 在活动帧内更新可见区间投影，不单独请求下一帧。 */
  updateVisibleRangeForFrame(visibleRange: VisibleRange): boolean {
    if (
      this.visibleRange.start === visibleRange.start &&
      this.visibleRange.end === visibleRange.end
    ) {
      return false
    }
    this.visibleRange = visibleRange
    return this.reprojectRenderStates()
  }

  /** 用当前结果池重算渲染投影，不触发计算。 */
  private reprojectRenderStates(colors: ColorTokens = this.deps.plotColors$.peek()): boolean {
    if (!this.resultPool) return false
    this.renderStates = this.composeRenderStates(this.resultPool, colors)
    return true
  }

  /** 逐实例生成渲染投影；结果池是唯一事实来源。 */
  private composeRenderStates(
    pool: IndicatorResultPool,
    colors: ColorTokens = this.deps.plotColors$.peek(),
  ): ReadonlyMap<string, unknown> {
    const timestamp = Date.now()
    const renderStates = new Map<string, unknown>()
    for (const instance of this.pipeline.snapshot().instances.values()) {
      const metadata = getRegisteredIndicatorDefinition(instance.definitionId)
      const result = pool.results.get(instance.instanceId)
      if (!metadata || !result) continue
      const timeline = this.getTimelineProjection(result.timestamps ?? pool.timestamps)
      const previous = this.plotProjections.get(result)
      if (
        metadata.plots &&
        previous &&
        this.canReusePlotProjection(previous, timeline, instance.presentation, colors)
      ) {
        renderStates.set(
          instance.instanceId,
          updatePlotRange(previous.state, metadata.plots, this.visibleRange, timestamp),
        )
        continue
      }
      const state = composeInstanceRenderState(
        metadata,
        result,
        instance.presentation,
        this.visibleRange,
        timestamp,
        colors,
      )
      if (state === undefined) continue
      this.storeComposedState(
        instance,
        result,
        metadata,
        timeline,
        timestamp,
        colors,
        state,
        renderStates,
      )
    }
    return renderStates
  }

  /** 写入单实例渲染状态；Plot 状态额外投影范围并缓存。 */
  private storeComposedState(
    instance: IndicatorPipelineInstance,
    result: IndicatorSeriesResult,
    metadata: NonNullable<ReturnType<typeof getRegisteredIndicatorDefinition>>,
    timeline: IndicatorTimelineProjection,
    timestamp: number,
    colors: ColorTokens,
    state: unknown,
    renderStates: Map<string, unknown>,
  ): void {
    if (!isPlotRenderState(state) || !metadata.plots) {
      renderStates.set(instance.instanceId, state)
      return
    }
    const projected = updatePlotRange(
      { ...state, ...projectIndicatorCollection(state, timeline) },
      metadata.plots,
      this.visibleRange,
      timestamp,
    )
    this.plotProjections.set(result, {
      presentation: instance.presentation,
      colors,
      state: projected,
      timeline,
    })
    renderStates.set(instance.instanceId, projected)
  }

  /** 时间轴、展示配置与颜色一致时复用上一帧的 Plot 投影。 */
  private canReusePlotProjection(
    previous: { timeline: unknown; presentation: unknown; colors: unknown },
    timeline: unknown,
    presentation: unknown,
    colors: unknown,
  ): boolean {
    return (
      previous.timeline === timeline &&
      previous.presentation === presentation &&
      previous.colors === colors
    )
  }

  /** 从权威计算时间轴映射到当前展示时间轴，缓存完整的映射身份。 */
  private getTimelineProjection(source: readonly number[]): IndicatorTimelineProjection {
    const target = this.displayTimestamps ?? this.currentTimestamps
    const byMinute = this.displayTimestamps !== null
    const cached = this.timelineProjection
    if (cached?.source === source && cached.target === target && cached.byMinute === byMinute)
      return cached.projection
    const projection = createIndicatorTimelineProjection(source, target, byMinute)
    this.timelineProjection = { source, target, byMinute, projection }
    return projection
  }

  get indicatorsComputed(): Computed<ReadonlyArray<IndicatorInstance>> {
    return this._indicatorsComputed
  }

  get subPanesComputed(): Computed<ReadonlyArray<SubPaneInfo>> {
    return this._subPanesComputed
  }

  /** 当前工作区的轴列表；供范围解析、轴宽和轴列布局读取。 */
  getPaneAxes(): ReadonlyMap<string, ReadonlyArray<PaneAxisSpec>> {
    return this.paneAxes
  }

  /** 容器查询必须命中已声明的轴集合；空容器返回空集合，未知容器抛异常。 */
  getAxesInPane(paneId: string): ReadonlyArray<PaneAxisSpec> {
    const axes = this.paneAxes.get(paneId)
    if (axes === undefined)
      throw new KLineChartError(GENERIC_ERROR_CODES.NOT_REGISTERED, `Pane 未注册：${paneId}`)
    return axes
  }

  /** 某条轴上全部可见对象的输出极值；同轴多对象时取并集，轴无数据时返回 null。 */
  getAxisIndicatorRange(axisId: string): { min: number; max: number } | null {
    const axes = [...this.paneAxes.values()]
      .flat()
      .filter((candidate) => candidate.axisId === axisId)
    if (axes.length === 0) return null
    const states = this.getRenderStatesSnapshot()
    let min = Number.POSITIVE_INFINITY
    let max = Number.NEGATIVE_INFINITY
    for (const axis of axes) {
      for (const objectId of axis.objectIds) {
        const state = states.get(objectId)
        if (!isPlotRenderState(state) || state.visibleMin > state.visibleMax) continue
        min = Math.min(min, state.visibleMin)
        max = Math.max(max, state.visibleMax)
      }
    }
    return min <= max ? { min, max } : null
  }

  /** 挂载实际资源，资源表只用于释放，不保存业务投影。 */
  private mountLayerResource(layer: Layer<RenderContext>): void {
    this.deps.useRenderer(layer)
    this.layerResources.add(layer.id)
  }

  /** 统一释放全部窗格中的实例与轴图层，避免跨图迁移互相覆盖。 */
  private releaseLayerResources(): void {
    for (const layerId of this.layerResources) this.deps.removeRenderer(layerId)
    this.layerResources.clear()
  }

  destroy(): void {
    this.calculationScheduler.dispose()
    this.inlineExecutor.dispose()
    this.destroyed = true
    this.disposeDefinitionSubscription()
    this.releaseLayerResources()
    this.paneAxes = new Map()
    this.onResultsAppliedCallback = null
  }
}
