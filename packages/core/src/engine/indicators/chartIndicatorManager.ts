/**
 * ChartIndicatorManager —— 指标实例链路的宿主接线。
 *
 * 职责：
 * 1. 把 Kernel 的指标实例状态投影为 instances/ 链路的实例快照与计算计划；
 * 2. 执行计划（Worker 优先，失败降级 inline）并提交按 instanceId 索引的结果池；
 * 3. 逐实例生成渲染投影，按 instanceId 提供给 renderer / scale renderer / 图例；
 * 4. 协调副图 renderer 与主图 legend，并注册实例状态与目录服务。
 */

import { makePluginLayerId } from '../../foundation/plugin/impl/rendererLayerId.js'
import type {
  IndicatorRenderStateReader,
  PluginHostImpl,
  RenderContext,
  RendererPlugin,
  RendererPluginWithHost,
} from '../../foundation/plugin/index.js'
import {
  type Computed,
  computed,
  effect,
  type ReadonlySignal,
} from '../../foundation/reactivity/signal.js'
import type { KLineData } from '../../foundation/types/price.js'
import { generateUUID } from '../../foundation/utils/uuid.js'
import type { Layer } from '../../rendering/scene/types.js'
import type { ChartOptions, IndicatorInstance, PaneSpec, SubPaneInfo } from '../chartTypes.js'
import type { VisibleRange } from '../layout/pane.js'
import { UpdateLevel } from '../layout/pane.js'
import type { SubIndicatorType } from '../renderers/Indicator/index.js'
import { createMainIndicatorLegendRendererPlugin } from '../renderers/Indicator/mainIndicatorLegend.js'
import type {
  IndicatorInstanceSpec,
  IndicatorStateModule,
  SubPaneInput,
  SubPaneSpec,
} from '../state/indicatorState.js'
import { type SubPaneContext, type SubPaneEntry, SubPaneManager } from '../subPaneManager.js'
import {
  getRegisteredIndicatorDefinition,
  getRegisteredIndicatorDefinitions,
  resolveIndicatorDefinitionId,
} from './indicatorDefinitionRegistry.js'
import type { IndicatorMetadata } from './indicatorMetadata.js'
import {
  INDICATOR_INSTANCE_CATALOG_SERVICE,
  INDICATOR_INSTANCE_STATE_SERVICE,
  type IndicatorInstanceCatalog,
  type IndicatorInstanceDescriptor,
} from './instances/api/indicatorRenderBinding.js'
import {
  createIndicatorInstancePipeline,
  type IndicatorInstancePipeline,
} from './instances/assembly/indicatorInstancePipeline.js'
import {
  createInstanceCalculationDefinitions,
  serializeInstanceCalculationDefinitions,
} from './instances/assembly/instanceDefinitionCatalog.js'
import {
  createIndicatorCalculationKey,
  type IndicatorParameterValue,
  type IndicatorInstance as IndicatorPipelineInstance,
  type IndicatorResultPool,
  type IndicatorSeriesResult,
} from './instances/domain/instanceModel.js'
import {
  createInlineIndicatorCalculationExecutor,
  createWorkerIndicatorCalculationExecutor,
} from './instances/execution/instanceCalculationExecutors.js'
import {
  createInstanceCalculationScheduler,
  type IndicatorCalculationExecutor,
} from './instances/execution/instanceCalculationScheduler.js'
import {
  composeInstanceRenderState,
  composeVolumeRenderState,
  computeInstanceMainIndicatorPriceRange,
} from './stateComposer.js'

type ResolvedChartOptions = Omit<ChartOptions, 'kWidth' | 'kGap'> & {
  kWidth: number
  kGap: number
}

/** 可被 inline 降级替换的执行器持有者；调度器通过它间接调用当前执行器。 */
interface IndicatorExecutorHolder {
  active: IndicatorCalculationExecutor & { dispose?: () => void }
}

function mainIndicatorProjectionKey(
  params: Readonly<Record<string, number | boolean | string>>,
): string {
  const valueKey = (value: number | boolean | string): string => {
    if (typeof value !== 'number') return `${typeof value}:${JSON.stringify(value)}`
    if (Number.isNaN(value)) return 'number:NaN'
    if (value === Number.POSITIVE_INFINITY) return 'number:Infinity'
    if (value === Number.NEGATIVE_INFINITY) return 'number:-Infinity'
    if (Object.is(value, -0)) return 'number:-0'
    return `number:${value}`
  }
  return Object.keys(params)
    .sort()
    .map((key) => `${key}:${valueKey(params[key]!)}`)
    .join('|')
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

/** 副图业务操作：create/remove/clear 会联动 pane 布局，不能只写 subPane 模块 */
export interface SubPaneOps {
  create: (entry: SubPaneInput) => void
  remove: (paneId: string) => void
  replace: (paneId: string, indicatorId: string, params: Readonly<Record<string, unknown>>) => void
  setParams: (paneId: string, params: Readonly<Record<string, unknown>>) => void
  clear: () => void
}

export interface IndicatorDependencies {
  getOption: () => ResolvedChartOptions
  getPluginHost: () => PluginHostImpl
  getRenderer: <T extends RendererPlugin = RendererPlugin>(name: string) => T | undefined
  useRenderer: (
    plugin: RendererPlugin | RendererPluginWithHost,
    config?: Record<string, unknown>,
  ) => void
  removeRenderer: (name: string) => void
  updateRendererConfig: (name: string, config: Record<string, unknown>) => void
  /** pane ratios SSOT */
  paneRatios$: ReadonlySignal<Readonly<Record<string, number>>>
  paneSpecs$: ReadonlySignal<ReadonlyArray<PaneSpec>>
  projectPaneLayout: (
    specs: ReadonlyArray<PaneSpec>,
    ratios: Readonly<Record<string, number>>,
  ) => void
  getLastVisibleRange: () => VisibleRange
  getCrosshairPos: () => { x: number; y: number } | null
  getCrosshairPrice: () => number | null
  getActivePaneId: () => string | null
  scheduleDraw: (level?: UpdateLevel) => void
  getRenderContext: (paneId: string) => RenderContext | null
  getLayer: (id: string) => Layer | null
  /** 主图/副图统一的指标实例配置状态 */
  indicator: IndicatorStateModule
  /** 副图状态 + 联动 pane 布局的复合操作 */
  subPaneOps: SubPaneOps
  runRendererTransaction: (run: () => void) => void
}

export class ChartIndicatorManager {
  private deps: IndicatorDependencies
  private readonly pipeline: IndicatorInstancePipeline
  private readonly executorHolder: IndicatorExecutorHolder
  private readonly inlineExecutor: IndicatorCalculationExecutor
  private readonly calculationScheduler: ReturnType<typeof createInstanceCalculationScheduler>
  private subPaneManager: SubPaneManager
  private _indicatorsComputed: Computed<ReadonlyArray<IndicatorInstance>>
  private _subPanesComputed: Computed<ReadonlyArray<SubPaneInfo>>
  private subPaneCtx: SubPaneContext
  private disposeProjection: (() => void) | null = null
  private appliedMainIndicators = new Map<string, string>()
  private projectedPaneSpecs: ReadonlyArray<PaneSpec> | null = null
  private projectedPaneRatios: Readonly<Record<string, number>> | null = null
  /** 已投影到 renderStates 的展示版本；展示变化只重建投影。 */
  private projectedPresentationRevision = -1

  // ========== 计算与投影运行时 ==========
  private currentData: KLineData[] = []
  private currentTimestamps: readonly number[] = []
  private visibleRange: VisibleRange = { start: 0, end: 0 }
  /** 非空时，计算结果需投影到该展示序列的时间戳。 */
  private displayTimestamps: readonly number[] | null = null
  private dataRevision = 0
  private hasData = false
  private resultPool: IndicatorResultPool | null = null
  private renderStates: ReadonlyMap<string, unknown> = new Map()
  private onResultsAppliedCallback: (() => void) | null = null

  /** 主图指标默认参数（从注册表中懒加载） */
  private static _defaultMainParamsCache: Record<
    string,
    Record<string, number | boolean | string>
  > | null = null

  private static get DEFAULT_MAIN_PARAMS(): Record<
    string,
    Record<string, number | boolean | string>
  > {
    if (ChartIndicatorManager._defaultMainParamsCache === null) {
      ChartIndicatorManager._defaultMainParamsCache = {}
      for (const def of getRegisteredIndicatorDefinitions()) {
        if (def.category === 'main') {
          const key = def.displayName
          ChartIndicatorManager._defaultMainParamsCache[key] = {
            ...(def.presentation?.defaultOptions ?? def.runtime?.defaultParams ?? {}),
          } as Record<string, number | boolean | string>
        }
      }
    }
    return ChartIndicatorManager._defaultMainParamsCache
  }

  /** 可启用的主图指标白名单（从注册表中懒加载） */
  private static _enableMainIndicatorsCache: string[] | null = null

  private static get ENABLE_MAIN_INDICATORS(): string[] {
    if (ChartIndicatorManager._enableMainIndicatorsCache === null) {
      ChartIndicatorManager._enableMainIndicatorsCache = getRegisteredIndicatorDefinitions()
        .filter((d) => d.category === 'main')
        .map((d) => d.displayName)
    }
    return ChartIndicatorManager._enableMainIndicatorsCache
  }

  /** 副图渲染器名称前缀（保留向后兼容） */
  static readonly SUB_PANE_PREFIX = 'sub_'

  constructor(deps: IndicatorDependencies) {
    this.deps = deps

    // 实例链路：Kernel 实例配置为输入，计算计划与结果池为输出。
    this.pipeline = createIndicatorInstancePipeline({
      createId: generateUUID,
      initial: this.toPipelineInstances(deps.indicator.readonly.instances.peek()),
      onCalculationPlanChanged: () => this.requestCompute(),
    })

    // 执行器：Worker 可用时优先，异步失败在 handleCalculationError 中降级 inline。
    this.inlineExecutor = createInlineIndicatorCalculationExecutor(
      createInstanceCalculationDefinitions(getRegisteredIndicatorDefinitions()),
    )
    this.executorHolder = { active: this.inlineExecutor }
    const workerExecutor = this.tryCreateWorkerExecutor()
    if (workerExecutor) this.executorHolder.active = workerExecutor

    this.calculationScheduler = createInstanceCalculationScheduler({
      pipeline: this.pipeline,
      executor: {
        setData: (data, revision) => this.executorHolder.active.setData(data, revision),
        execute: (plan, revision) => this.executorHolder.active.execute(plan, revision),
      },
      onCommit: ({ pool }) => this.applyCommittedPool(pool),
      onError: (error) => this.handleCalculationError(error),
    })

    this.registerPluginServices()

    // 初始化副图管理器
    this.subPaneManager = new SubPaneManager()
    this.subPaneCtx = {
      ...this.deps,
      onPaneProjectionChanged: () => this.reprojectRenderStates(),
    }

    // 派生信号
    this._indicatorsComputed = computed<ReadonlyArray<IndicatorInstance>>(() =>
      this.deps.indicator.readonly.instances().map((instance) => ({
        id: instance.instanceId,
        definitionId: instance.indicatorId,
        label: instance.indicatorId,
        name: instance.indicatorId,
        role: instance.role,
        paneId: instance.role === 'sub' ? instance.paneId : undefined,
        ordinal: instance.ordinal,
        params: { ...instance.params },
      })),
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

  /** 在 Scene 与 layout 就绪后投影当前完整状态，并订阅后续变更。 */
  start(): void {
    if (this.disposeProjection) return
    this.syncRuntimeFromState()
    this.disposeProjection = effect(() => this.syncRuntimeFromState())
  }

  /** 将 kernel 当前快照投影为 pane、renderer 与实例链路的运行时状态。 */
  private syncRuntimeFromState(): void {
    const paneSpecs = this.deps.paneSpecs$()
    const paneRatios = this.deps.paneRatios$()
    const instances = this.deps.indicator.readonly.instances()
    const subPanes: SubPaneSpec[] = instances
      .filter((instance) => instance.role === 'sub')
      .map((instance) => ({
        instanceId: instance.instanceId,
        paneId: instance.paneId,
        indicatorId: instance.indicatorId,
        ordinal: instance.ordinal,
        params: instance.params,
      }))
    this.deps.runRendererTransaction(() => {
      let paneChanged = false
      if (paneSpecs !== this.projectedPaneSpecs || paneRatios !== this.projectedPaneRatios) {
        this.deps.projectPaneLayout(paneSpecs, paneRatios)
        this.projectedPaneSpecs = paneSpecs
        this.projectedPaneRatios = paneRatios
        paneChanged = true
      }
      this.syncPipeline(instances)
      const presentationChanged = this.syncPresentationProjection()
      const mainChanged = this.reconcileMainIndicators(instances)
      const subChanged = this.subPaneManager.reconcile(this.subPaneCtx, subPanes)
      if (paneChanged || presentationChanged || mainChanged || subChanged) {
        this.deps.scheduleDraw()
      }
    })
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
      // 定义变更不能伪装为参数更新；删建以保证 definitionId 与计算身份一致。
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

  /** 展示版本变化只重建渲染投影，不触发重新计算。 */
  private syncPresentationProjection(): boolean {
    const revision = this.pipeline.snapshot().presentationRevision
    if (revision === this.projectedPresentationRevision) return false
    this.projectedPresentationRevision = revision
    return this.reprojectRenderStates()
  }

  /**
   * 将 Kernel 实例规格转换为实例领域模型。
   * 没有 runtime 的指标（如成交量）不进入计算链路，由投影层单独合成渲染状态。
   */
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
        context: {},
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

  /**
   * 从 Kernel 实例参数中提取展示配置。
   * 只认定义声明的展示键，保证展示值不会混入计算身份。
   */
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

  /** 尝试创建 Worker 执行器；环境不支持时返回 null 交给 inline。 */
  private tryCreateWorkerExecutor():
    | (IndicatorCalculationExecutor & { dispose: () => void })
    | null {
    if (typeof Worker === 'undefined') return null
    try {
      const worker = new Worker(
        new URL('./instances/worker/instanceIndicator.worker.js', import.meta.url),
        { type: 'module' },
      )
      return createWorkerIndicatorCalculationExecutor({
        worker,
        definitions: serializeInstanceCalculationDefinitions(getRegisteredIndicatorDefinitions()),
      })
    } catch (error) {
      console.warn(
        '[ChartIndicatorManager] Indicator Worker unavailable, using inline executor',
        error,
      )
      return null
    }
  }

  /** 注册实例状态读取与实例目录服务，供 renderer / 图例消费。 */
  private registerPluginServices(): void {
    const host = this.deps.getPluginHost()
    host.registerService(INDICATOR_INSTANCE_STATE_SERVICE, this.createRenderStateReader())
    host.registerService(INDICATOR_INSTANCE_CATALOG_SERVICE, this.createInstanceCatalog())
  }

  /** 当前启用实例目录；主图图例按实例枚举。 */
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
          params: instance.params,
        }))
    return Object.freeze({
      listMainInstances: () => descriptors((instance) => instance.role === 'main'),
      listPaneInstances: (paneId: string) => descriptors((instance) => instance.paneId === paneId),
    })
  }

  /** 数据更新入口：K 线计算，可选把结果投影到展示时间戳序列。 */
  updateIndicatorData(
    data: KLineData[],
    visibleRange: VisibleRange,
    dataRevision?: number,
    displayTimestamps: readonly number[] | null = null,
  ): void {
    this.currentData = data
    this.currentTimestamps = data.map((item) => item.timestamp)
    this.visibleRange = visibleRange
    this.displayTimestamps = displayTimestamps
    this.dataRevision = dataRevision ?? this.dataRevision + 1
    this.hasData = data.length > 0
    this.requestCompute()
  }

  /** 计算计划或数据变化后请求一次调度；无数据时不触发。 */
  private requestCompute(): void {
    if (!this.hasData) return
    void this.calculationScheduler.compute({
      dataRevision: this.dataRevision,
      timestamps: this.displayTimestamps ?? this.currentTimestamps,
      data: this.currentData,
    })
  }

  /** 提交最新结果池：先投影到展示时间轴，再生成帧级渲染投影。 */
  private applyCommittedPool(pool: IndicatorResultPool): void {
    const projected = this.projectPoolToDisplayTimestamps(pool)
    this.resultPool = projected
    this.renderStates = this.composeRenderStates(projected)
    this.deps.scheduleDraw()
    this.onResultsAppliedCallback?.()
  }

  /** 计算失败时把 Worker 执行器降级为 inline，并重试当前数据。 */
  private handleCalculationError(error: unknown): void {
    console.error('[ChartIndicatorManager] Indicator calculation failed:', error)
    const active = this.executorHolder.active
    if (active === this.inlineExecutor) return
    this.executorHolder.active = this.inlineExecutor
    active.dispose?.()
    this.requestCompute()
  }

  /** 设置计算结果应用完毕回调，用于串联 Alert 等管线。 */
  setOnResultsApplied(callback: () => void): void {
    this.onResultsAppliedCallback = callback
  }

  /** 创建绑定当前帧已提交结果的读取器；键为 instanceId。 */
  createRenderStateReader(): IndicatorRenderStateReader {
    return {
      get: <T = unknown>(instanceId: string): T | undefined =>
        this.renderStates.get(instanceId) as T | undefined,
    }
  }

  /** 主图已启用实例的价格范围，用于主图 pane 缩放。 */
  getMainIndicatorPriceRange(): { min: number; max: number } | null {
    const pool = this.resultPool
    if (!pool) return null
    let min = Infinity
    let max = -Infinity
    for (const instance of this.pipeline.snapshot().instances.values()) {
      // 主图实例固定落在 main pane；paneId 不参与计算身份。
      if (instance.paneId !== 'main') continue
      const metadata = getRegisteredIndicatorDefinition(instance.definitionId)
      const result = pool.results.get(instance.instanceId)
      if (!metadata || !result) continue
      const range = computeInstanceMainIndicatorPriceRange(metadata, result, this.visibleRange)
      if (!range) continue
      min = Math.min(min, range.min)
      max = Math.max(max, range.max)
    }
    return Number.isFinite(min) && Number.isFinite(max) ? { min, max } : null
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
  private reprojectRenderStates(): boolean {
    if (!this.resultPool) return false
    this.renderStates = this.composeRenderStates(this.resultPool)
    return true
  }

  /** 逐实例生成渲染投影；结果池是唯一事实来源。 */
  private composeRenderStates(pool: IndicatorResultPool): ReadonlyMap<string, unknown> {
    const timestamp = Date.now()
    const renderStates = new Map<string, unknown>()
    for (const instance of this.pipeline.snapshot().instances.values()) {
      const metadata = getRegisteredIndicatorDefinition(instance.definitionId)
      const result = pool.results.get(instance.instanceId)
      if (!metadata || !result) continue
      const state = composeInstanceRenderState(
        metadata,
        result,
        instance.presentation,
        this.visibleRange,
        timestamp,
      )
      if (state === undefined) continue
      renderStates.set(instance.instanceId, state)
    }
    // 成交量没有 calculator，渲染状态由当前行情直接合成。
    const volume = composeVolumeRenderState(this.currentData, this.visibleRange, timestamp)
    const volumeMetadata = getRegisteredIndicatorDefinition('volume')
    if (volume && volumeMetadata) {
      for (const instance of this.deps.indicator.readonly.instances.peek()) {
        const metadata = getRegisteredIndicatorDefinition(instance.indicatorId)
        if (metadata?.name === volumeMetadata.name) {
          renderStates.set(instance.instanceId, volume)
        }
      }
    }
    return renderStates
  }

  /** 把计算结果按分钟时间戳投影到展示序列，保持分时指标与分时坐标对齐。 */
  private projectPoolToDisplayTimestamps(pool: IndicatorResultPool): IndicatorResultPool {
    const display = this.displayTimestamps
    if (!display) return pool
    const indexByMinute = new Map<number, number>()
    for (let index = 0; index < this.currentTimestamps.length; index++) {
      indexByMinute.set(Math.floor(this.currentTimestamps[index]! / 60_000), index)
    }
    const project = (value: unknown): unknown => {
      if (Array.isArray(value)) {
        return display.map((timestamp) => {
          const sourceIndex = indexByMinute.get(Math.floor(timestamp / 60_000))
          return sourceIndex === undefined ? undefined : value[sourceIndex]
        })
      }
      if (value && typeof value === 'object') {
        return Object.fromEntries(
          Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
            key,
            project(nested),
          ]),
        )
      }
      return value
    }
    const results = new Map<string, IndicatorSeriesResult>()
    for (const [instanceId, result] of pool.results) {
      results.set(instanceId, Object.freeze({ ...result, series: project(result.series) }))
    }
    return Object.freeze({
      ...pool,
      timestamps: Object.freeze([...display]),
      results,
    })
  }

  get subPaneManagerAccessor(): SubPaneManager {
    return this.subPaneManager
  }

  get indicatorInstancesSignalPeek(): ReadonlyArray<IndicatorInstanceSpec> {
    return this.deps.indicator.readonly.instances.peek()
  }

  get indicatorsComputed(): Computed<ReadonlyArray<IndicatorInstance>> {
    return this._indicatorsComputed
  }

  get subPanesComputed(): Computed<ReadonlyArray<SubPaneInfo>> {
    return this._subPanesComputed
  }

  /** 从统一实例集合读取指定主图指标。 */
  private getMainIndicatorInstance(indicatorId: string): IndicatorInstanceSpec | undefined {
    return this.deps.indicator.readonly.instances
      .peek()
      .find((instance) => instance.role === 'main' && instance.indicatorId === indicatorId)
  }

  // ========== 主图指标 API ==========

  enableMainIndicator(
    indicatorId: string,
    params?: Record<string, number | boolean | string>,
  ): boolean {
    const id = resolveIndicatorDefinitionId(indicatorId)
    if (!id || !ChartIndicatorManager.ENABLE_MAIN_INDICATORS.includes(id)) {
      console.warn(`[Chart] 未知的主图指标: ${indicatorId}`)
      return false
    }

    const existing = this.getMainIndicatorInstance(id)

    if (existing) {
      if (params) {
        this.deps.indicator.actions.upsertMain(id, params)
      }
      return true
    }

    const defaults = ChartIndicatorManager.DEFAULT_MAIN_PARAMS[id] ?? {}
    const merged = params ? { ...defaults, ...params } : defaults
    this.deps.indicator.actions.upsertMain(id, merged)
    return true
  }

  disableMainIndicator(indicatorId: string): boolean {
    const id = resolveIndicatorDefinitionId(indicatorId)
    if (!id || !this.getMainIndicatorInstance(id)) return false

    this.deps.indicator.actions.removeMain(id)
    return true
  }

  toggleMainIndicator(indicatorId: string, enabled: boolean): void {
    if (enabled) {
      this.enableMainIndicator(indicatorId)
    } else {
      this.disableMainIndicator(indicatorId)
    }
  }

  getActiveMainIndicators(): string[] {
    return this.deps.indicator.readonly.instances
      .peek()
      .filter((instance) => instance.role === 'main')
      .map((instance) => instance.indicatorId)
  }

  isMainIndicatorActive(indicatorId: string): boolean {
    const id = resolveIndicatorDefinitionId(indicatorId)
    return id !== undefined && Boolean(this.getMainIndicatorInstance(id))
  }

  updateMainIndicatorParams(
    indicatorId: string,
    params: Record<string, number | boolean | string>,
  ): void {
    const id = resolveIndicatorDefinitionId(indicatorId)
    if (!id || !this.getMainIndicatorInstance(id)) return

    this.deps.indicator.actions.setMainParams(id, params)
  }

  getMainIndicatorParams(indicatorId: string): Record<string, number | boolean | string> | null {
    const id = resolveIndicatorDefinitionId(indicatorId)
    const params = (id ? this.getMainIndicatorInstance(id)?.params : undefined) as
      | Readonly<Record<string, number | boolean | string>>
      | undefined
    return params ? { ...params } : null
  }

  clearMainIndicators(): void {
    this.deps.indicator.actions.clearMain()
  }

  private reconcileMainIndicators(desired: ReadonlyArray<IndicatorInstanceSpec>): boolean {
    let changed = false
    for (const id of [...this.appliedMainIndicators.keys()]) {
      if (desired.some((instance) => instance.role === 'main' && instance.indicatorId === id))
        continue
      this.appliedMainIndicators.delete(id)
      changed = true
    }
    for (const entry of desired) {
      if (entry.role !== 'main') continue
      const id = entry.indicatorId
      // 模式主序列（如 candle）由 core 挂载；有 @Indicator 主图定义的模式图层由此投影。
      if (entry.source === 'mode' && !getRegisteredIndicatorDefinition(id)?.mainPane) continue
      const hasApplied = this.appliedMainIndicators.has(id)
      const params = entry.params as Readonly<Record<string, number | boolean | string>>
      const projectionKey = mainIndicatorProjectionKey(params)
      if (this.appliedMainIndicators.get(id) === projectionKey) continue
      try {
        if (!hasApplied) this.enableMainIndicatorRenderer(id, entry.source === 'mode')
        const rendererName = getRegisteredIndicatorDefinition(id)?.mainPane?.rendererName
        if (rendererName) this.deps.updateRendererConfig(rendererName, { ...params })
        this.appliedMainIndicators.set(id, projectionKey)
        changed = true
      } catch (error) {
        console.error(`[ChartIndicatorManager] Failed to project main indicator "${id}":`, error)
      }
    }
    return changed
  }

  private enableMainIndicatorRenderer(indicatorId: string, isMode = false): void {
    const definition = getRegisteredIndicatorDefinition(indicatorId)
    const mainPane = definition?.mainPane
    if (!definition || !mainPane) return

    const rendererName = mainPane.rendererName
    const existingLayer = this.deps.getLayer(makePluginLayerId(rendererName))

    if (!existingLayer) {
      const plugin = definition.rendererFactory({
        paneId: 'main',
        indicatorId,
        instanceId: `main:${indicatorId}`,
      })
      // useRenderer：注册表 + 唯一 Scene Layer
      this.deps.useRenderer(plugin)
    }

    // core 可能已挂 legend Layer 且未进 Manager；两者任一存在都不再注册第二实例
    if (
      !isMode &&
      !this.deps.getLayer(makePluginLayerId('mainIndicatorLegend')) &&
      !this.deps.getRenderer('mainIndicatorLegend')
    ) {
      const legend = createMainIndicatorLegendRendererPlugin({
        yPaddingPx: this.deps.getOption().yPaddingPx,
      })
      this.deps.useRenderer(legend)
    }
  }

  /**
   * @deprecated 使用 enableMainIndicator/disableMainIndicator 替代
   * 状态一次 replaceAllMain，再做 renderer side effects，避免逐条中间态。
   */
  setActiveMainIndicators(indicators: string[]): void {
    const newIds = indicators
      .map((indicatorId) => resolveIndicatorDefinitionId(indicatorId))
      .filter(
        (id): id is string =>
          id !== undefined && ChartIndicatorManager.ENABLE_MAIN_INDICATORS.includes(id),
      )
    const instances: IndicatorInstanceSpec[] = newIds.map((id) => {
      const existing = this.getMainIndicatorInstance(id)
      return {
        instanceId: `main:${id}`,
        indicatorId: id,
        paneId: 'main',
        role: 'main',
        ordinal: 0,
        params: existing
          ? { ...existing.params }
          : { ...(ChartIndicatorManager.DEFAULT_MAIN_PARAMS[id] ?? {}) },
      }
    })
    this.deps.indicator.actions.replaceAllMain(instances)
  }

  getSubPaneEntries(): SubPaneEntry[] {
    return this.deps.indicator.readonly.subPanes.peek().map((entry) => ({
      ...entry,
      params: { ...entry.params },
      ...this.subPaneManager.getMountedResources(entry.paneId),
    }))
  }

  getSubPaneEntry(paneId: string): SubPaneEntry | undefined {
    const entry = this.deps.indicator.readonly.subPanes
      .peek()
      .find((candidate) => candidate.paneId === paneId)
    if (!entry) return undefined
    return {
      ...entry,
      params: { ...entry.params },
      ...this.subPaneManager.getMountedResources(paneId),
    }
  }

  private getDefaultSubPaneParams(indicatorId: SubIndicatorType): Record<string, unknown> {
    const meta = getRegisteredIndicatorDefinition(indicatorId)
    if (!meta) return {}
    const defaults = ChartIndicatorManager.resolveDefaultParams(meta.runtime?.defaultParams)
    return {
      ...defaults,
      ...(meta.presentation?.defaultOptions ?? {}),
    }
  }

  /** 创建副图实例描述，分别生成实例身份、布局身份和显示序号。 */
  private createPaneInput(
    paneId: string,
    indicatorId: string,
    params: Readonly<Record<string, unknown>> | undefined,
    instanceId: string,
  ): SubPaneInput {
    const ordinal =
      this.deps.indicator.readonly.instances
        .peek()
        .filter((instance) => instance.role === 'sub' && instance.indicatorId === indicatorId)
        .reduce((max, instance) => Math.max(max, instance.ordinal), -1) + 1
    return {
      instanceId,
      paneId,
      indicatorId,
      ordinal,
      params: params ?? this.getDefaultSubPaneParams(indicatorId as SubIndicatorType),
    }
  }

  // ========== 高层指标 API ==========

  /**
   * 添加指标实例；主图返回规范化 definitionId，副图创建独立 instanceId 和 paneId。
   * @param definitionId 已注册的指标定义标识。
   * @param role 指标显示位置。
   * @param params 可选的指标参数覆盖。
   * @returns 成功时返回可用于后续操作的标识，失败时返回 null。
   */
  addIndicator(
    definitionId: string,
    role: 'main' | 'sub',
    params?: Record<string, unknown>,
  ): string | null {
    if (role === 'main') {
      const success = this.enableMainIndicator(
        definitionId,
        params as Record<string, number | boolean | string>,
      )
      if (!success) return null
      return resolveIndicatorDefinitionId(definitionId) ?? definitionId
    } else {
      const definition = getRegisteredIndicatorDefinition(definitionId)
      if (!definition) return null
      const instanceId = generateUUID()
      const paneId = generateUUID()
      this.deps.subPaneOps.create(
        this.createPaneInput(paneId, definition.displayName, params, instanceId),
      )
      return instanceId
    }
  }

  removeIndicator(instanceId: string): boolean {
    const mainId = resolveIndicatorDefinitionId(instanceId)

    if (mainId && this.getMainIndicatorInstance(mainId)) {
      return this.disableMainIndicator(mainId)
    }

    const subPaneEntry = this.deps.indicator.readonly.instances
      .peek()
      .find((entry) => entry.role === 'sub' && entry.instanceId === instanceId)
    if (subPaneEntry) {
      this.deps.subPaneOps.remove(subPaneEntry.paneId)
      return true
    }

    return false
  }

  updateIndicatorParams(instanceId: string, params: Record<string, unknown>): boolean {
    const mainId = resolveIndicatorDefinitionId(instanceId)

    if (mainId && this.getMainIndicatorInstance(mainId)) {
      this.updateMainIndicatorParams(mainId, params as Record<string, number | boolean | string>)
      return true
    }

    const subPaneEntry = this.deps.indicator.readonly.instances
      .peek()
      .find((entry) => entry.role === 'sub' && entry.instanceId === instanceId)
    if (subPaneEntry) {
      this.deps.subPaneOps.setParams(subPaneEntry.paneId, params)
      return true
    }

    return false
  }

  reorderIndicators(orderedInstanceIds: string[]): boolean {
    console.warn('[Chart] reorderIndicators not fully implemented yet')
    return false
  }

  destroy(): void {
    this.disposeProjection?.()
    this.disposeProjection = null
    this.deps.runRendererTransaction(() => this.subPaneManager.clear(this.subPaneCtx))
    this.executorHolder.active.dispose?.()
    this.onResultsAppliedCallback = null
  }
}
