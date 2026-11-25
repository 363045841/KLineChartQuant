/**
 * ChartIndicatorManager —— 指标视图适配器。
 *
 * 职责只有三件事：
 * 1. 把 Kernel 的指标实例投影为计算请求，交给计算层；
 * 2. 订阅计算提交，按实例生成渲染投影；
 * 3. 维护图层与异步可用性。
 *
 * 计算、调度、结果仓库全部在 `engine/calculation`；本类不再持有行情或任务状态。
 */

import type { ComputeChange } from '@363045841yyt/klinechart-plot-contracts'

import { GENERIC_ERROR_CODES, INDICATOR_SERIES_ERROR_CODES, KLineChartError } from '@/errors.js'
import type { ObjectAxisBinding } from '@/foundation/geometry/axisBinding.js'
import type {
  IndicatorAvailabilityReader,
  IndicatorRenderStateReader,
  PluginHostImpl,
  RenderContext,
} from '../../foundation/plugin/index.js'
import { type Computed, computed, type ReadonlySignal } from '../../foundation/reactivity/signal.js'
import type { ColorTokens } from '../../foundation/tokens/index.js'
import type { KLineData } from '../../foundation/types/price.js'
import type {
  Layer,
  RenderObjectCommands,
  RenderObjectDescriptor,
} from '../../rendering/scene/types.js'
import {
  type CalculationClient,
  type CalculationDefinition,
  type CalculationHub,
  type CalculationInputValue,
  type CalculationMarketData,
  type CalculationRequest,
  type CalculationResult,
  createCalculationHub,
  createFeedKey,
  createLocalCalculationKey,
  type DataIdentity,
  type FeedSnapshot,
} from '../calculation/index.js'
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
import { isIndicatorVisibleOnPeriod } from './indicatorPeriodVisibility.js'
import {
  INDICATOR_AVAILABILITY_SERVICE,
  INDICATOR_AVAILABILITY_SOURCE,
  INDICATOR_INSTANCE_CATALOG_SERVICE,
  INDICATOR_INSTANCE_STATE_SERVICE,
  type IndicatorAvailabilityRegistry,
  type IndicatorInstanceCatalog,
  type IndicatorInstanceDescriptor,
} from './instances/api/indicatorRenderBinding.js'
import { createIndicatorCalculators } from './instances/assembly/indicatorCalculatorCatalog.js'
import { createIndicatorTimelineProjection } from './projection/impl/indicatorTimelineProjection.js'
import type { IndicatorTimelineProjection } from './projection/types.js'
import {
  getIndicatorDescriptor,
  getRegisteredIndicatorDefinition,
  indicatorCatalogRevision,
  readRegisteredDefinitions,
  resolveCanonicalIndicatorId,
} from './pipeline/index.js'
import { projectIndicatorSeries } from './projection/impl/indicatorTimelineProjection.js'
import { composeInstanceRenderState } from './stateComposer.js'

type ResolvedChartOptions = ChartOptions & {
  kWidth: number
  kGap: number
}

/** 把 Kernel 参数值规范化为计算身份可编码的 JSON 值；拒绝非 JSON 结构。 */
function toCalculationInputValue(value: unknown): CalculationInputValue {
  if (value === null) return null
  if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return value
  }
  if (Array.isArray(value)) return value.map(toCalculationInputValue)
  if (typeof value === 'object') {
    const result: Record<string, CalculationInputValue> = {}
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      result[key] = toCalculationInputValue(nested)
    }
    return result
  }
  throw new TypeError(`Unsupported indicator parameter value: ${String(value)}`)
}

/** 指标实例的渲染对象身份；命令由图表注入，管理器不直接写 kernel。 */
function createIndicatorObjectDescriptor(
  instanceId: string,
  definition: IndicatorMetadata,
  commands: RenderObjectCommands,
): RenderObjectDescriptor {
  return {
    kind: 'indicator',
    domainId: instanceId,
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

/** 一个实例与它的计算请求；仅渲染型指标没有请求。 */
interface PlannedInstance {
  readonly spec: IndicatorInstanceSpec
  readonly metadata: IndicatorMetadata
  readonly request: CalculationRequest | null
  readonly presentation: Readonly<Record<string, unknown>>
}

export interface IndicatorDependencies {
  getMarketData?: () => CalculationMarketData
  getPeriod: () => string
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
  private readonly hub: CalculationHub
  private readonly client: CalculationClient
  /** 已安装定义的计算端口；计算层按 identity 读取，不持有定义仓库。 */
  private readonly calculators = new Map<string, CalculationDefinition>()
  private installedDefinitions: ReadonlyMap<string, IndicatorMetadata> = new Map()
  private appliedDefinitionRevision = -1
  private _indicatorsComputed: Computed<ReadonlyArray<IndicatorInstance>>
  private _subPanesComputed: Computed<ReadonlyArray<SubPaneInfo>>
  /** 只记录实际拥有的图层资源，不承载实例归属、参数或更新判断。 */
  private readonly layerResources = new Set<string>()
  /** 已安装到 Pane 的轴声明；帧消费者不重新派生尚未安装的轴。 */
  private paneAxes: ReadonlyMap<string, ReadonlyArray<PaneAxisSpec>> = new Map()
  /** destroy 后不再接收提交，也不把拆除错误当作运行期失败。 */
  private destroyed = false

  // ========== 视图投影状态（只读消费） ==========
  /** 当前行情身份；没有数据时为 null。 */
  private feedKey: string | null = null
  /** 当前行情修订；提交只接受该修订的结果。 */
  private feed: FeedSnapshot | null = null
  /** 当前状态下的实例与请求映射。 */
  private planned: readonly PlannedInstance[] = []
  /** 最近一次提交；滚动/缩放只重投影，不重算。 */
  private results: ReadonlyMap<string, CalculationResult> | null = null
  private visibleRange: VisibleRange = { start: 0, end: 0 }
  /** 非空时，计算结果需投影到该展示序列的时间戳。 */
  private displayTimestamps: readonly number[] | null = null
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
    period: string
    visible: ReadonlyMap<string, unknown>
  } | null = null
  /** 绘图点由结果和展示配置派生；可见区间变化只重算范围。 */
  private readonly plotProjections = new WeakMap<
    CalculationResult,
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
    const period = this.deps.getPeriod()
    const cached = this.visibleRenderStatesCache
    if (
      cached?.states === this.renderStates &&
      cached.instances === instances &&
      cached.period === period
    ) {
      return cached.visible
    }
    const visible = new Map<string, unknown>()
    for (const instance of instances) {
      if (instance.hidden === true || !this.renderStates.has(instance.instanceId)) continue
      const definition = this.getInstalledDefinition(instance.indicatorId)
      if (
        !isIndicatorVisibleOnPeriod(
          period,
          definition?.visiblePeriods,
          instance.timeframeVisibility,
        )
      )
        continue
      visible.set(instance.instanceId, this.renderStates.get(instance.instanceId))
    }
    this.visibleRenderStatesCache = { states: this.renderStates, instances, period, visible }
    return visible
  }

  constructor(deps: IndicatorDependencies) {
    this.deps = deps
    this.hub = createCalculationHub({
      resolveDefinition: (id) => this.calculators.get(id),
      marketData: deps.getMarketData,
    })
    this.client = this.hub.createClient('chart', {
      onCommit: (commit) => this.publishResults(commit.results),
      onPending: (owners, pending) => {
        for (const id of owners)
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

  /** 暴露给同一宿主上的其他消费者（警报、Agent）；计算层只有一份。 */
  getCalculationHub(): CalculationHub {
    return this.hub
  }

  /** 当前行情身份；没有数据时为 null。 */
  getFeedKey(): string | null {
    return this.feedKey
  }

  /** 仅捕获资源输入，追踪依赖由协调者的唯一订阅负责。 */
  readRuntimeInputs(): IndicatorRuntimeInputs {
    return {
      instances: this.deps.indicator.readonly.instances(),
      colors: this.deps.plotColors$(),
      definitionRevision: indicatorCatalogRevision(),
    }
  }

  /** 轴安装阶段发布绑定，后续范围、图层和标签读取同一份声明。 */
  acceptPaneAxes(axes: ReadonlyMap<string, ReadonlyArray<PaneAxisSpec>>): void {
    this.paneAxes = axes
  }

  /** 目标行情更新复用现有计算层；旧结果由修订校验自然淘汰。 */
  invalidateMarketData(): void {
    if (this.feed) this.hub.updateFeed(this.feed)
  }

  /** 在协调者的提交内同步计算器、发布完整计划、挂载图层。 */
  projectIndicators(inputs: IndicatorRuntimeInputs): void {
    this.synchronizeDefinitions(inputs.definitionRevision)
    this.planned = this.createPlan(inputs.instances)
    this.applyPlan()
    const activeInstanceIds = new Set(inputs.instances.map((instance) => instance.instanceId))
    for (const instanceId of [...this.availabilitySources.keys()]) {
      if (!activeInstanceIds.has(instanceId)) this.availabilitySources.delete(instanceId)
    }

    const instanceAxes = resolveObjectAxisMap(this.paneAxes)
    this.releaseLayerResources()
    for (const { spec, metadata } of this.planned) {
      const layer = createIndicatorLayer({
        definition: metadata,
        paneId: spec.paneId,
        indicatorId: spec.indicatorId,
        instanceId: spec.instanceId,
        axisId: instanceAxes.get(spec.instanceId)!,
        params: { ...spec.params },
        timeframeVisibility: spec.timeframeVisibility,
        object: createIndicatorObjectDescriptor(
          spec.instanceId,
          metadata,
          this.deps.objectCommands(spec.instanceId),
        ),
      })
      layer.visible = spec.hidden !== true
      layer.z += spec.ordinal
      this.mountLayerResource(layer)
    }
    this.reprojectRenderStates(inputs.colors)
    this.deps.scheduleDraw()
  }

  /** 把当前实例映射为渲染计划；只有声明 runtime 的实例产生计算请求。 */
  private createPlan(instances: readonly IndicatorInstanceSpec[]): readonly PlannedInstance[] {
    const planned: PlannedInstance[] = []
    for (const spec of instances) {
      const metadata = this.getInstalledDefinition(spec.indicatorId)
      if (!metadata) continue
      planned.push({
        spec,
        metadata,
        request: metadata.runtime ? this.createRequest(spec, metadata) : null,
        presentation: ChartIndicatorManager.resolvePresentation(metadata, spec.params),
      })
    }
    return Object.freeze(planned)
  }

  /** 生成一个实例的计算请求；参数与上下文完整快照。 */
  private createRequest(
    spec: IndicatorInstanceSpec,
    metadata: IndicatorMetadata,
  ): CalculationRequest {
    const definitionId = metadata.name
    const defaults = ChartIndicatorManager.resolveDefaultInputs(metadata.runtime!.defaultInputs)
    const inputs: Record<string, CalculationInputValue> = {}
    for (const name of Object.keys(defaults)) {
      const value = spec.params[name] ?? defaults[name]
      if (value === undefined) continue
      inputs[name] = toCalculationInputValue(value)
    }
    const context = { definitionRevision: metadata.runtime!.revision ?? 0 }
    return Object.freeze({
      key: createLocalCalculationKey({ definitionId, inputs, context }),
      definitionId,
      inputs: Object.freeze(inputs),
      context: Object.freeze(context),
      owners: Object.freeze([spec.instanceId]),
    })
  }

  /** 把计划提交给计算层；渲染型实例不产生请求。 */
  private applyPlan(): void {
    if (!this.feedKey) return
    const requests = this.planned.flatMap((entry) => (entry.request ? [entry.request] : []))
    this.client.setPlan([{ feed: this.feedKey, requests }])
  }

  /** 比对完整目录快照，合并通知时也能同步全部新增、替换和注销。 */
  private synchronizeDefinitions(revision: number): boolean {
    if (revision === this.appliedDefinitionRevision) return false
    const next = new Map(
      readRegisteredDefinitions().map((definition) => [definition.name, definition]),
    )
    const previous = this.installedDefinitions
    const outdated = [...previous.values()].filter(
      (definition) => next.get(definition.name) !== definition,
    )
    const install = [...next.values()].filter(
      (definition) => previous.get(definition.name) !== definition,
    )
    // 先安装新计算端口，再让计算层丢弃旧结果；否则无效定义会被当成最终结果提交。
    for (const definition of outdated) this.calculators.delete(definition.name)
    for (const definition of createIndicatorCalculators(install)) {
      this.calculators.set(definition.definitionId, definition)
    }
    const changed = [...outdated, ...install].map((definition) => definition.name)
    if (changed.length > 0) this.hub.invalidateDefinitions(changed)
    this.installedDefinitions = next
    this.appliedDefinitionRevision = revision
    for (const definition of outdated) {
      if (!next.has(definition.name)) {
        this.deps.removeInstancesByDefinition(resolveCanonicalIndicatorId(definition))
      }
    }
    return changed.length > 0
  }

  /** 解析名称或展示名，并确认当前图表已装配这份实现。 */
  private getInstalledDefinition(id: string): IndicatorMetadata | undefined {
    const definition = getRegisteredIndicatorDefinition(id)
    return definition && this.installedDefinitions.get(definition.name) === definition
      ? definition
      : undefined
  }

  /** 解析 runtime.defaultInputs，支持函数与常量两种声明。 */
  private static resolveDefaultInputs(value: unknown): Record<string, unknown> {
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
          timeframeVisibility: instance.timeframeVisibility,
          inputs: instance.params,
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

  /** 行情更新入口：构造快照交给计算层，视图只保留展示所需信息。 */
  updateIndicatorData(
    data: readonly KLineData[],
    change: ComputeChange,
    visibleRange: VisibleRange,
    dataRevision: number,
    displayTimestamps: readonly number[] | null,
    identity: DataIdentity,
    live: boolean,
  ): void {
    this.visibleRange = visibleRange
    this.displayTimestamps = displayTimestamps
    if (data.length === 0) {
      this.clearFeed()
      return
    }
    const nextFeedKey = createFeedKey(identity)
    if (this.feedKey !== null && this.feedKey !== nextFeedKey) {
      this.hub.removeFeed(this.feedKey)
      this.resetResults()
    }
    this.feedKey = nextFeedKey
    this.feed = {
      identity,
      dataRevision,
      marketRevision: this.deps.getMarketData?.().revision ?? 0,
      timestamps: data.map((item) => item.timestamp),
      data,
      change,
      // 由数据层显式给出：只有追加与末根更新才是实时 bar。
      live,
    }
    this.hub.updateFeed(this.feed)
    this.applyPlan()
    if (this.reprojectRenderStates()) this.deps.scheduleDraw()
  }

  /** 数据清空时释放行情与结果；消费者计划置空，不再等待提交。 */
  private clearFeed(): void {
    if (this.feedKey) this.hub.removeFeed(this.feedKey)
    this.feedKey = null
    this.feed = null
    this.resetResults()
    this.client.setPlan([])
    this.deps.scheduleDraw()
  }

  /** 结果与投影同时失效；实例配置保留，等下一份行情重新计算。 */
  private resetResults(): void {
    this.results = null
    this.renderStates = new Map()
    this.visibleRenderStatesCache = null
    this.timelineProjection = null
  }

  /**
   * 读取一个指标定义的数值序列。
   *
   * 与图表实例共用计算身份：参数一致时直接命中已提交结果；不同参数走预览提交。
   */
  async readSeries(
    request: {
      readonly definitionId: string
      readonly inputs?: Readonly<Record<string, unknown>>
    },
    signal: AbortSignal,
  ): Promise<CalculationResult> {
    if (!this.feedKey || !this.feed)
      throw new KLineChartError(
        INDICATOR_SERIES_ERROR_CODES.NO_DATA,
        'Reading indicator series requires active market data.',
      )
    const metadata = this.getInstalledDefinition(request.definitionId)
    if (!metadata?.runtime)
      throw new KLineChartError(
        INDICATOR_SERIES_ERROR_CODES.INDICATOR_NOT_REGISTERED,
        `Unknown indicator '${request.definitionId}'. Load or register it before reading its series.`,
      )
    const defaults = ChartIndicatorManager.resolveDefaultInputs(metadata.runtime.defaultInputs)
    const inputs: Record<string, CalculationInputValue> = {}
    for (const name of Object.keys(defaults)) {
      const value = request.inputs?.[name] ?? defaults[name]
      if (value === undefined) continue
      inputs[name] = toCalculationInputValue(value)
    }
    const context = { definitionRevision: metadata.runtime.revision ?? 0 }
    const definitionId = metadata.name
    const calculationRequest: CalculationRequest = Object.freeze({
      key: createLocalCalculationKey({ definitionId, inputs, context }),
      definitionId,
      inputs: Object.freeze(inputs),
      context: Object.freeze(context),
    })
    const result = await this.hub.submit(this.feedKey, calculationRequest, signal)
    if (result.error) {
      throw new KLineChartError(
        INDICATOR_SERIES_ERROR_CODES.COMPUTE_FAILED,
        `Indicator '${metadata.displayName}' failed: ${result.error.message}`,
      )
    }
    return result
  }

  /** 计算层提交：保存结果并重建渲染投影。 */
  private publishResults(results: ReadonlyMap<string, CalculationResult>): void {
    this.results = results
    this.renderStates = this.composeRenderStates(results)
    this.deps.scheduleDraw()
  }

  /** 调度错误直接报告，不切换执行链路或重试另一份实现。 */
  private handleCalculationError(error: unknown): void {
    if (this.destroyed) return
    console.error('[ChartIndicatorManager] Indicator calculation failed:', error)
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

  /** 用当前提交结果重算渲染投影，不触发计算。 */
  private reprojectRenderStates(colors: ColorTokens = this.deps.plotColors$.peek()): boolean {
    if (!this.results) return false
    this.renderStates = this.composeRenderStates(this.results, colors)
    return true
  }

  /** 逐实例生成渲染投影；提交结果与实例计划是唯一事实来源。 */
  private composeRenderStates(
    results: ReadonlyMap<string, CalculationResult>,
    colors: ColorTokens = this.deps.plotColors$.peek(),
  ): ReadonlyMap<string, unknown> {
    const timestamp = Date.now()
    const renderStates = new Map<string, unknown>()
    for (const entry of this.planned) {
      const { metadata, spec, presentation, request } = entry
      if (!request) continue
      const result = results.get(request.key)
      if (!result) continue
      const timeline = this.getTimelineProjection(result.timestamps)
      const previous = this.plotProjections.get(result)
      if (
        metadata.plots &&
        previous &&
        this.canReusePlotProjection(previous, timeline, presentation, colors)
      ) {
        renderStates.set(
          spec.instanceId,
          updatePlotRange(previous.state, metadata.plots, this.visibleRange, timestamp),
        )
        continue
      }
      const state = composeInstanceRenderState(
        metadata,
        result,
        request.inputs,
        presentation,
        this.visibleRange,
        timestamp,
        colors,
      )
      if (state === undefined) continue
      this.storeComposedState(
        spec.instanceId,
        result,
        metadata,
        presentation,
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
    instanceId: string,
    result: CalculationResult,
    metadata: IndicatorMetadata,
    presentation: Readonly<Record<string, unknown>>,
    timeline: IndicatorTimelineProjection,
    timestamp: number,
    colors: ColorTokens,
    state: unknown,
    renderStates: Map<string, unknown>,
  ): void {
    if (!isPlotRenderState(state) || !metadata.plots) {
      renderStates.set(instanceId, state)
      return
    }
    const projected = updatePlotRange(
      { ...state, ...projectIndicatorSeries(state, timeline) },
      metadata.plots,
      this.visibleRange,
      timestamp,
    )
    this.plotProjections.set(result, {
      presentation,
      colors,
      state: projected,
      timeline,
    })
    renderStates.set(instanceId, projected)
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
    const target = this.displayTimestamps ?? this.feed?.timestamps ?? source
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
    this.client.dispose()
    this.hub.dispose()
    this.destroyed = true
    this.releaseLayerResources()
    this.paneAxes = new Map()
    this.planned = []
    this.results = null
    this.feed = null
    this.feedKey = null
  }
}
