/**
 * IndicatorScheduler - 指标调度器（Worker 化重构版）
 *
 * 职责：
 * 1. 维护当前图表激活的指标配置
 * 2. 在数据/配置变更时触发 Worker 计算
 * 3. 接收 Worker 结果，组装 RenderState 并原子写入 Kernel
 * 4. 同步处理 visibleRange 变更（不走 Worker，避免异步延迟）
 *
 * 架构：
 * - 主线程 facade（本文件）
 * - Worker backend（indicator.worker.ts）
 * - Inline fallback backend（indicatorRuntime.ts）
 */

import type { IndicatorRenderStateReader, PluginHost } from '../../foundation/plugin/index.js'
import { computed, type ReadonlySignal } from '../../foundation/reactivity/signal.js'
import type { KLineData } from '../../foundation/types/price.js'
import {
  createIndicatorResultState,
  type IndicatorResultStateModule,
} from '../state/indicatorResultState.js'
import { type IndicatorMetadata, resolveStateKey } from './indicatorMetadata.js'
import { IndicatorRegistry } from './indicatorRegistry.js'
import { IndicatorRuntime } from './indicatorRuntime.js'
// Default constants for default config
import { DEFAULT_ATR_PERIOD } from './state/atrState.js'
import {
  DEFAULT_CHAIKIN_VOL_EMA_PERIOD,
  DEFAULT_CHAIKIN_VOL_ROC_PERIOD,
} from './state/chaikinVolState.js'
import { DEFAULT_CMF_PERIOD } from './state/cmfState.js'
import { DEFAULT_DEMA_PERIOD } from './state/demaState.js'
import { DEFAULT_DONCHIAN_PERIOD } from './state/donchianState.js'
import { DEFAULT_FIB_PERIOD } from './state/fibState.js'
import { DEFAULT_HMA_PERIOD } from './state/hmaState.js'
import { DEFAULT_HV_ANNUALIZATION, DEFAULT_HV_PERIOD } from './state/hvState.js'
import {
  DEFAULT_ICHIMOKU_DISPLACEMENT,
  DEFAULT_ICHIMOKU_KIJUN,
  DEFAULT_ICHIMOKU_SPAN_B,
  DEFAULT_ICHIMOKU_TENKAN,
} from './state/ichimokuState.js'
import {
  DEFAULT_KAMA_FAST_PERIOD,
  DEFAULT_KAMA_PERIOD,
  DEFAULT_KAMA_SLOW_PERIOD,
} from './state/kamaState.js'
import {
  DEFAULT_KELTNER_ATR_PERIOD,
  DEFAULT_KELTNER_EMA_PERIOD,
  DEFAULT_KELTNER_MULTIPLIER,
} from './state/keltnerState.js'
import { DEFAULT_MFI_PERIOD } from './state/mfiState.js'
import {
  DEFAULT_PARKINSON_ANNUALIZATION,
  DEFAULT_PARKINSON_PERIOD,
} from './state/parkinsonState.js'
import { DEFAULT_ROC_PERIOD } from './state/rocState.js'
import { DEFAULT_SAR_MAX_STEP, DEFAULT_SAR_STEP } from './state/sarState.js'
import { DEFAULT_STRUCTURE_LEFT, DEFAULT_STRUCTURE_RIGHT } from './state/structureState.js'
import {
  DEFAULT_SUPERTREND_ATR_PERIOD,
  DEFAULT_SUPERTREND_MULTIPLIER,
} from './state/supertrendState.js'
import { DEFAULT_TEMA_PERIOD } from './state/temaState.js'
import { DEFAULT_TRIX_PERIOD, DEFAULT_TRIX_SIGNAL_PERIOD } from './state/trixState.js'
import { DEFAULT_VMA_PERIOD } from './state/vmaState.js'
import {
  DEFAULT_VP_BINS,
  DEFAULT_VP_LOOKBACK,
  DEFAULT_VP_VALUE_AREA,
} from './state/volumeProfileState.js'
import { DEFAULT_VWAP_SESSION_GAP_MS } from './state/vwapState.js'
import { DEFAULT_WMA_PERIOD } from './state/wmaState.js'
import { DEFAULT_ZONES_OB_LOOKBACK } from './state/zonesState.js'
import {
  composeInstanceRenderState,
  composeVolumeRenderState,
  computeInstanceMainIndicatorPriceRange,
} from './stateComposer.js'
import type {
  IndicatorConfig,
  IndicatorInstanceCalculationInput,
  IndicatorInstanceCalculationResult,
  IndicatorWorkerResponse,
  SerializedRuntimeDescriptor,
} from './workerProtocol.js'
import { isWorkerResponse, PROTOCOL_VERSION } from './workerProtocol.js'

/**
 * 可见范围
 */
interface VisibleRange {
  start: number
  end: number
}

/** Scheduler 从 Kernel 读取的最小实例快照。 */
interface IndicatorInstanceCalculationSource {
  readonly instanceId: string
  readonly definitionId: string
  readonly paneId: string
  readonly params: Readonly<Record<string, unknown>>
}

/** 将辅助 K 线的结果按分钟时间戳投影到分时展示序列。 */
function projectSeriesByTimestamp<T>(
  series: readonly T[],
  sourceTimestamps: readonly number[],
  displayTimestamps: readonly number[],
): Array<T | undefined> {
  const sourceIndexByMinute = new Map<number, number>()
  for (let index = 0; index < sourceTimestamps.length; index++) {
    sourceIndexByMinute.set(Math.floor(sourceTimestamps[index]! / 60_000), index)
  }
  return displayTimestamps.map((timestamp) => {
    const sourceIndex = sourceIndexByMinute.get(Math.floor(timestamp / 60_000))
    return sourceIndex === undefined ? undefined : series[sourceIndex]
  })
}

/** 将一个实例结果投影到展示时间轴。 */
function projectInstanceResultByTimestamp(
  result: IndicatorInstanceCalculationResult,
  sourceTimestamps: readonly number[],
  displayTimestamps: readonly number[] | null,
): IndicatorInstanceCalculationResult {
  if (!displayTimestamps) return result
  const project = (value: unknown): unknown => {
    if (Array.isArray(value)) return projectSeriesByTimestamp(value, sourceTimestamps, displayTimestamps)
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, project(nested)]))
    }
    return value
  }
  return { ...result, series: project(result.series) }
}

/**
 * IndicatorScheduler - 主线程 facade
 */
export class IndicatorScheduler {
  private readonly resultState: IndicatorResultStateModule
  private readonly ownsResultState: boolean
  private readonly busySignal$: ReadonlySignal<boolean>
  /** 独立使用 Scheduler 时的显式渲染投影目标。 */
  private legacyPluginHost: PluginHost | null = null
  private visibleRange: VisibleRange = { start: 0, end: 0 }
  private activeMainIndicators = new Map<string, Record<string, number | boolean | string>>()

  // 版本控制
  private dataVersion = 0
  private configVersion = 0
  private getConfigRevision: (() => number) | null = null
  private requestId = 0
  private lastAppliedRequestId = 0
  private activeRequestId = 0

  // 当前数据和配置快照
  private currentData: KLineData[] = []
  /** 非空时，计算结果需投影到该展示序列的时间戳。 */
  private displayTimestamps: readonly number[] | null = null
  private configSnapshot!: Record<string, IndicatorConfig>
  private paneIdOverrides = new Map<string, string>()

  // Worker 相关
  private worker: Worker | null = null
  private workerReady = false
  private useWorker = false
  private pendingRequest: {
    requestId: number
    dataVersion: number
    configVersion: number
  } | null = null

  // Inline fallback runtime
  private inlineRuntime: IndicatorRuntime | null = null

  // 重绘回调
  private invalidateCallback: (() => void) | null = null

  // Worker 异步结果应用完毕回调（用于串联其他管线，如 Alert）
  private onResultsAppliedCallback: (() => void) | null = null

  /** 从 Kernel 获取指标实例计算输入的回调。 */
  private getIndicatorInstances: (() => ReadonlyArray<IndicatorInstanceCalculationSource>) | null =
    null

  // 注册表
  private registry: IndicatorRegistry

  constructor(resultStateOrAutoSync?: IndicatorResultStateModule | boolean, autoSync?: boolean) {
    this.ownsResultState =
      typeof resultStateOrAutoSync === 'boolean' || resultStateOrAutoSync === undefined
    this.resultState =
      typeof resultStateOrAutoSync === 'object'
        ? resultStateOrAutoSync
        : createIndicatorResultState()
    this.busySignal$ = computed(
      () => this.resultState.readonly.snapshot().attempt.status === 'computing',
    )
    this.registry =
      (typeof resultStateOrAutoSync === 'boolean' ? resultStateOrAutoSync : autoSync) !== undefined
        ? new IndicatorRegistry(
            typeof resultStateOrAutoSync === 'boolean' ? resultStateOrAutoSync : autoSync,
          )
        : new IndicatorRegistry()
    this.configSnapshot = this.buildInitialConfigSnapshot()
    this.initBackend()
  }

  // ============================================================================
  // 公共 API：指标注册/注销
  // ============================================================================

  /**
   * 注册新指标（支持动态扩展）
   */
  registerIndicator<T>(meta: IndicatorMetadata<T>): void {
    if (this.registry.has(meta.name)) {
      console.warn(`[IndicatorScheduler] '${meta.name}' already registered, overwriting`)
    }
    this.registry.register(meta)
    if (meta.runtime && this.inlineRuntime) {
      this.inlineRuntime.addDescriptor(meta.runtime)
    }
    if (meta.runtime && this.useWorker && this.worker && this.workerReady) {
      const rt = meta.runtime
      this.worker.postMessage({
        type: 'addDescriptor',
        descriptor: {
          configKey: rt.configKey ?? meta.name,
          paneIdKey: rt.paneIdKey,
          defaultParams:
            typeof rt.defaultParams === 'function'
              ? (rt.defaultParams as () => any)()
              : rt.defaultParams,
          computeKey: rt.computeKey,
          outputAlignment: rt.outputAlignment,
        } as SerializedRuntimeDescriptor,
      })
    }
    this.configVersion++
    this.triggerRecompute()
    console.log(`[IndicatorScheduler] Registered indicator '${meta.name}' (${meta.displayName})`)
  }

  /**
   * 注销指标
   */
  unregisterIndicator(name: string): boolean {
    const success = this.registry.unregister(name)
    if (success) {
      this.configVersion++
      this.triggerRecompute()
      console.log(`[IndicatorScheduler] Unregistered indicator '${name}'`)
    }
    return success
  }

  /**
   * 获取指标元数据（供渲染器查询）
   */
  getIndicatorMetadata(name: string): IndicatorMetadata | undefined {
    return this.registry.get(name)
  }

  /**
   * 获取所有已注册指标
   */
  getAllIndicators(): readonly IndicatorMetadata[] {
    return this.registry.getAll()
  }

  /**
   * 设置重绘回调
   */
  setInvalidateCallback(callback: () => void): void {
    this.invalidateCallback = callback
  }

  /**
   * 设置 Worker 异步结果应用完毕回调
   * 当 Worker 返回计算结果并写入 StateStore 后触发，用于串联 Alert 等管线
   */
  setOnResultsApplied(callback: () => void): void {
    this.onResultsAppliedCallback = callback
  }

  /** 调度器繁忙信号，由 Kernel 计算状态派生。 */
  get busySignal(): ReadonlySignal<boolean> {
    return this.busySignal$
  }

  /**
   * 副图增删后通知 scheduler 刷新 active mask
   */
  onSubPaneChanged(): void {
    if (this.resultState.readonly.snapshot.peek().pool) this.updateVisibleStatesOnly()
  }

  /** 注入指标实例快照，作为实例级计算输入的唯一来源。 */
  setIndicatorInstanceProvider(
    provider: () => ReadonlyArray<IndicatorInstanceCalculationSource>,
  ): void {
    this.getIndicatorInstances = provider
  }

  /**
   * 销毁调度器
   */
  destroy(): void {
    this.terminateWorker()
    this.inlineRuntime = null
    this.invalidateCallback = null
    this.onResultsAppliedCallback = null
    this.legacyPluginHost = null
    if (this.ownsResultState) this.resultState.dispose()
  }

  /** 注入 Kernel 指标配置 revision，作为计算结果的配置来源身份。 */
  setConfigRevisionProvider(provider: () => number): void {
    this.getConfigRevision = provider
    this.configVersion = provider()
  }

  // ============================================================================
  // 初始化
  // ============================================================================

  private buildInitialConfigSnapshot(): Record<string, IndicatorConfig> {
    const config: Record<string, IndicatorConfig> = {}
    for (const meta of this.registry.getAll()) {
      if (meta.runtime?.defaultParams || meta.presentation?.defaultOptions) {
        const key = meta.runtime?.configKey ?? meta.name
        const defaultParams =
          typeof meta.runtime?.defaultParams === 'function'
            ? meta.runtime.defaultParams()
            : meta.runtime?.defaultParams
        config[key] = {
          ...(defaultParams as IndicatorConfig),
          ...(meta.presentation?.defaultOptions ?? {}),
        }
      }
    }
    return config
  }

  private initBackend(): void {
    // 尝试初始化 Worker
    if (this.tryInitWorker()) {
      return
    }
    // 失败则使用 inline fallback
    this.initInlineRuntime()
  }

  private tryInitWorker(): boolean {
    console.log(
      '[IndicatorScheduler] tryInitWorker: Worker available?',
      typeof Worker !== 'undefined',
    )
    if (typeof Worker === 'undefined') {
      return false
    }
    try {
      console.log('[IndicatorScheduler] Creating worker...')
      this.worker = new Worker(new URL('./indicator.worker.js', import.meta.url), {
        type: 'module',
      })
      console.log('[IndicatorScheduler] Worker created, waiting for ready...')
      this.worker.onmessage = (e) => this.handleWorkerMessage(e.data)
      this.worker.onerror = (err) => {
        console.error('[IndicatorScheduler] Worker error:', err)
        const shouldRetry = this.pendingRequest !== null
        this.failActiveCalculation(`Worker runtime error: ${String(err)}`)
        this.fallbackToInline(shouldRetry)
      }
      this.worker.postMessage({
        type: 'init',
        protocolVersion: PROTOCOL_VERSION,
      })
      return true
    } catch (err) {
      console.warn('[IndicatorScheduler] Failed to init worker:', err)
      return false
    }
  }

  private initInlineRuntime(): void {
    console.log('[IndicatorScheduler] Using INLINE runtime (fallback)')
    const runtimeDescs = this.registry
      .getAll()
      .filter((m) => m.runtime)
      .map((m) => m.runtime!)
    this.inlineRuntime = new IndicatorRuntime(runtimeDescs)
    this.useWorker = false
    this.workerReady = true
  }

  private fallbackToInline(retryPendingRequest = false): void {
    console.warn('[IndicatorScheduler] Falling back to inline runtime')
    this.terminateWorker()
    this.initInlineRuntime()
    this.pendingRequest = null
    // Worker 失败后重新建立独立的 Inline attempt，旧 attempt 保留 error 记录。
    if (retryPendingRequest) {
      this.computeWithInline()
    }
  }

  /** 为一次计算分配请求身份并通知 Kernel 进入 computing。 */
  private beginCalculation(): number {
    const requestId = ++this.requestId
    this.activeRequestId = requestId
    this.resultState.actions.beginCalculation({
      requestId,
      dataRevision: this.dataVersion,
      configRevision: this.configVersion,
    })
    return requestId
  }

  /** 将当前计算尝试标记为失败，保留最近成功结果。 */
  private failActiveCalculation(error: unknown): void {
    this.failCalculation(this.activeRequestId, this.dataVersion, this.configVersion, error)
  }

  /** 记录指定计算尝试的失败，过期错误不会污染当前状态。 */
  private failCalculation(
    requestId: number,
    dataVersion: number,
    configVersion: number,
    error: unknown,
  ): void {
    this.resultState.actions.failCalculation({
      requestId,
      dataRevision: dataVersion,
      configRevision: configVersion,
      error: error instanceof Error ? error.message : String(error),
    })
    this.pendingRequest = null
  }

  private terminateWorker(): void {
    if (this.worker) {
      this.worker.terminate()
      this.worker = null
    }
    this.workerReady = false
    this.useWorker = false
  }

  // ============================================================================
  // Worker 消息处理
  // ============================================================================

  private handleWorkerMessage(msg: unknown): void {
    if (!isWorkerResponse(msg)) {
      console.warn('[IndicatorScheduler] Invalid worker response:', msg)
      return
    }

    switch (msg.type) {
      case 'ready':
        this.workerReady = true
        this.useWorker = true
        console.log('[IndicatorScheduler] Worker READY - using Worker backend')
        for (const meta of this.registry.getAll()) {
          if (!meta.runtime) continue
          const rt = meta.runtime
          this.worker!.postMessage({
            type: 'addDescriptor',
            descriptor: {
              configKey: rt.configKey ?? meta.name,
              paneIdKey: rt.paneIdKey,
              defaultParams:
                typeof rt.defaultParams === 'function'
                  ? (rt.defaultParams as () => any)()
                  : rt.defaultParams,
              computeKey: rt.computeKey,
              outputAlignment: rt.outputAlignment,
            } as SerializedRuntimeDescriptor,
          })
        }
        if (this.currentData.length > 0) {
          this.triggerRecompute()
        }
        break

      case 'seriesResult':
        this.handleSeriesResult(msg)
        break

      case 'error': {
        console.error('[IndicatorScheduler] Worker error:', msg.stage, msg.message)
        const shouldRetry =
          this.pendingRequest !== null &&
          (msg.requestId === undefined || msg.requestId === this.pendingRequest.requestId)
        if (shouldRetry) {
          this.failActiveCalculation(msg.message)
          this.fallbackToInline(true)
        }
        break
      }

      default: {
        const _exhaustive: never = msg
        console.warn(
          '[IndicatorScheduler] Unknown response type:',
          (_exhaustive as unknown as { type: string }).type,
        )
      }
    }
  }

  private handleSeriesResult(
    msg: Extract<IndicatorWorkerResponse, { type: 'seriesResult' }>,
  ): void {
    // 检查版本是否过期
    if (msg.requestId < this.lastAppliedRequestId) {
      return // 丢弃旧结果
    }
    if (!this.pendingRequest || msg.requestId !== this.pendingRequest.requestId) {
      return // 非当前计算尝试的结果
    }
    if (msg.dataVersion !== this.dataVersion || msg.configVersion !== this.configVersion) {
      return // 数据或配置已变更，丢弃旧结果
    }

    console.log(
      `[IndicatorScheduler] << Worker result: requestId=${msg.requestId} metrics=`,
      msg.metrics,
    )
    this.lastAppliedRequestId = msg.requestId
    this.pendingRequest = null

    try {
      // 组装并原子提交 Kernel 状态（内部触发重绘和结果回调）。
      this.applyResults(
        msg.instanceResults,
        msg.requestId,
        msg.dataVersion,
        msg.configVersion,
      )
    } catch (error) {
      this.failCalculation(msg.requestId, msg.dataVersion, msg.configVersion, error)
    }
  }

  // ============================================================================
  // 结果应用
  // ============================================================================

  /**
   * 检查 state 中的 visibleMin/visibleMax 是否为 Infinity，如果是则输出 warning
   */
  private checkVisibleExtremes(
    _state: { visibleMin: number; visibleMax: number },
    _indicatorName: string,
  ): void {}

  /** 将当前启用实例逐个投影为 renderer states。 */
  private composeRenderStateMap(
    instanceResults: ReadonlyArray<IndicatorInstanceCalculationResult>,
  ): ReadonlyMap<string, unknown> {
    const timestamp = Date.now()
    const result = new Map<string, unknown>()
    for (const instanceResult of instanceResults) {
      const meta = this.registry.get(instanceResult.definitionId)
      if (!meta) continue
      const state = composeInstanceRenderState(meta, instanceResult, this.visibleRange, timestamp)
      if (state === undefined) continue
      this.checkVisibleExtremes(
        state as { visibleMin: number; visibleMax: number },
        meta.displayName,
      )
      result.set(resolveStateKey(meta.stateKey, instanceResult.paneId), state)
    }
    const volume = composeVolumeRenderState(this.currentData, this.visibleRange, timestamp)
    const volumeMetadata = this.registry.get('volume')
    if (volume && volumeMetadata) {
      const volumeInstances = (this.getIndicatorInstances?.() ?? []).filter(
        (instance) => instance.definitionId === volumeMetadata.displayName,
      )
      const paneIds =
        volumeInstances.length > 0
          ? new Set(volumeInstances.map((instance) => instance.paneId))
          : new Set([volumeMetadata.defaultPaneId])
      for (const paneId of paneIds) {
        result.set(resolveStateKey(volumeMetadata.stateKey, paneId), volume)
      }
    }
    return result
  }

  /** 将调度器注册为插件服务；指标结果不再写入 PluginHost StateStore。 */
  setPluginHost(host: PluginHost): void {
    this.legacyPluginHost = host
    host.registerService('indicatorScheduler', this)
  }

  /** 创建绑定当前已提交结果的帧级读取器。 */
  createRenderStateReader(): IndicatorRenderStateReader {
    const renderStates = this.resultState.readonly.snapshot.peek().committed?.renderStates
    return {
      get<T = unknown>(stateKey: string): T | undefined {
        return renderStates?.get(stateKey) as T | undefined
      },
    }
  }

  /** 将已提交 Kernel 快照投影给独立 Scheduler 的显式 PluginHost 使用者。 */
  private projectStandaloneRenderStates(
    renderStates: ReadonlyMap<string, unknown>,
    shouldProject: (meta: IndicatorMetadata) => boolean,
  ): void {
    if (!this.ownsResultState || !this.legacyPluginHost) return
    for (const meta of this.registry.getAll()) {
      if (!shouldProject(meta)) continue
      if (!meta.applyResult) continue
      const paneId = this.paneIdOverrides.get(meta.name) ?? meta.defaultPaneId
      const state = renderStates.get(resolveStateKey(meta.stateKey, paneId))
      if (state !== undefined) meta.applyResult(this.legacyPluginHost, state, paneId)
    }
  }

  /** 提交最新完整计算结果，并在提交后安排下一帧绘制。 */
  private applyResults(
    instanceResults: ReadonlyArray<IndicatorInstanceCalculationResult>,
    requestId: number,
    dataVersion: number,
    configVersion: number,
  ): void {
    const projectedResults = instanceResults.map((result) => projectInstanceResultByTimestamp(
      result,
      this.currentData.map((item) => item.timestamp),
      this.displayTimestamps,
    ))
    const renderStates = this.composeRenderStateMap(projectedResults)
    const committed = this.resultState.actions.commitResults({
      requestId,
      dataRevision: dataVersion,
      configRevision: configVersion,
      timestamps: this.displayTimestamps ?? this.currentData.map((item) => item.timestamp),
      instanceResults: projectedResults,
      renderStates,
    })
    if (!committed) return
    this.projectStandaloneRenderStates(renderStates, () => true)
    this.invalidateCallback?.()
    this.onResultsAppliedCallback?.()
  }

  /** 重算可见范围极值并回调 applyResult（视口变更时同步更新，不走 Worker） */
  private updateVisibleStatesOnly(forceProjection = false): boolean {
    const pool = this.resultState.readonly.snapshot.peek().pool
    if (!pool) return false
    const renderStates = this.composeRenderStateMap([...pool.results.values()])
    const committed = this.resultState.readonly.snapshot.peek().committed
    if (!committed) return false
    if (
      !this.resultState.actions.updateProjection({
        resultVersion: committed.resultVersion,
        renderStates,
      })
    )
      return false
    this.projectStandaloneRenderStates(renderStates, (meta) => {
      if (forceProjection) return true
      if (meta.category !== 'main') return true
      const paneId = this.paneIdOverrides.get(meta.name) ?? meta.defaultPaneId
      const current = this.legacyPluginHost?.getSharedState<{
        timestamp: number
        visibleMin?: number
        visibleMax?: number
      }>(resolveStateKey(meta.stateKey, paneId))
      return (
        !current ||
        !Number.isFinite(current.visibleMin) ||
        !Number.isFinite(current.visibleMax) ||
        current.visibleMin! > current.visibleMax!
      )
    })
    return true
  }


  /** 合并定义默认参数与实例参数，生成可跨 Worker 传输的计算输入。 */
  private buildInstanceCalculationInputs(): IndicatorInstanceCalculationInput[] {
    const instances = this.getIndicatorInstances?.() ?? []
    const inputs: IndicatorInstanceCalculationInput[] = []
    for (const instance of instances) {
      const metadata = this.registry.get(instance.definitionId)
      const runtime = metadata?.runtime
      if (!metadata || !runtime) continue
      const defaults =
        typeof runtime.defaultParams === 'function'
          ? (runtime.defaultParams as () => Record<string, unknown>)()
          : (runtime.defaultParams as Record<string, unknown>)
      inputs.push({
        instanceId: instance.instanceId,
        definitionId: metadata.name,
        configKey: runtime.configKey ?? metadata.name,
        paneId: instance.paneId,
        params: Object.fromEntries(
          Object.keys(defaults).map((name) => [name, instance.params[name] ?? defaults[name]]),
        ),
      })
    }
    return inputs
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * 数据变更时调用
   */
  update(data: KLineData[], visibleRange: VisibleRange, dataRevision?: number): boolean {
    return this.updateWithDisplayTimestamps(data, visibleRange, dataRevision)
  }

  /** 使用 K 线计算，并可投影结果至另一条展示序列。 */
  updateWithDisplayTimestamps(
    data: KLineData[],
    visibleRange: VisibleRange,
    dataRevision?: number,
    displayTimestamps: readonly number[] | null = null,
  ): boolean {
    this.currentData = data
    this.displayTimestamps = displayTimestamps
    this.visibleRange = visibleRange
    this.dataVersion = dataRevision ?? this.dataVersion + 1
    if (this.getConfigRevision) this.configVersion = this.getConfigRevision()

    if (this.useWorker && this.worker && this.workerReady) {
      this.computeWithWorker()
      return false
    } else {
      this.computeWithInline()
      return true
    }
  }

  /**
   * 视口变更时调用 - 同步处理，不走 Worker
   */
  updateVisibleRange(visibleRange: VisibleRange): void {
    if (!this.updateVisibleRangeForFrame(visibleRange)) return
    this.invalidateCallback?.()
  }

  /**
   * 在 ChartRenderer 的活动帧内投影可见区指标状态，不单独请求下一帧。
   *
   * @param visibleRange - 本帧已封存的可见数据区间。
   * @returns 是否更新了指标投影。
   */
  updateVisibleRangeForFrame(visibleRange: VisibleRange): boolean {
    if (
      this.visibleRange.start === visibleRange.start &&
      this.visibleRange.end === visibleRange.end
    ) {
      return false
    }
    this.visibleRange = visibleRange
    return this.resultState.readonly.snapshot.peek().pool ? this.updateVisibleStatesOnly() : false
  }

  /**
   * 通用指标配置变更入口
   */
  updateIndicatorConfig(
    indicatorId: string,
    config: Record<string, unknown>,
    paneId?: string,
  ): void {
    const meta = this.registry.get(indicatorId)
    if (!meta?.runtime) {
      console.warn(`[IndicatorScheduler] Unknown or unregistered indicator: ${indicatorId}`)
      return
    }
    const rt = meta.runtime
    const configKey = rt.configKey ?? indicatorId
    // Update paneId if provided
    if (paneId !== undefined) {
      this.paneIdOverrides.set(indicatorId, paneId)
    }
    const previousConfig = this.configSnapshot[configKey] ?? {}
    const defaultParams =
      typeof rt.defaultParams === 'function'
        ? (rt.defaultParams as () => Record<string, unknown>)()
        : (rt.defaultParams as Record<string, unknown>)
    const calculationKeys = new Set(Object.keys(defaultParams))
    const calculationChanged = Object.entries(config).some(
      ([name, value]) => calculationKeys.has(name) && !Object.is(previousConfig[name], value),
    )
    const presentationChanged = Object.entries(config).some(
      ([name, value]) => !calculationKeys.has(name) && !Object.is(previousConfig[name], value),
    )
    // 配置快照兼容现有 UI 输入，但 Runtime 只读取 defaultParams 声明的字段
    this.configSnapshot[configKey] = {
      ...previousConfig,
      ...config,
    }
    if (calculationChanged) {
      this.configVersion = this.getConfigRevision?.() ?? this.configVersion + 1
      this.triggerRecompute()
    } else if (presentationChanged && this.updateVisibleStatesOnly(true)) {
      this.invalidateCallback?.()
    }
  }

  /**
   * 设置当前激活的主图指标
   */
  setActiveMainIndicators(
    indicators: Array<{ id: string; params: Record<string, number | boolean | string> }>,
  ): void {
    this.activeMainIndicators = new Map(indicators.map((i) => [i.id.toLowerCase(), i.params]))
  }

  /**
   * 获取主图指标价格范围
   */
  getMainIndicatorPriceRange(): { min: number; max: number } | null {
    const results = this.resultState.readonly.snapshot.peek().pool?.results
    if (!results) return null
    let min = Infinity
    let max = -Infinity
    for (const instance of this.buildInstanceCalculationInputs()) {
      if (!this.activeMainIndicators.has(instance.definitionId.toLowerCase())) continue
      const metadata = this.registry.get(instance.definitionId)
      const result = results.get(instance.instanceId)
      if (!metadata || !result) continue
      const range = computeInstanceMainIndicatorPriceRange(metadata, result, this.visibleRange)
      if (!range) continue
      min = Math.min(min, range.min)
      max = Math.max(max, range.max)
    }
    return Number.isFinite(min) && Number.isFinite(max) ? { min, max } : null
  }

  /**
   * 获取所有已注册的主图指标
   */
  getMainIndicators(): readonly IndicatorMetadata[] {
    return this.registry.getMainIndicators()
  }

  /**
   * 检查主图指标是否激活
   */
  isMainIndicatorActive(indicatorId: string): boolean {
    return this.activeMainIndicators.has(indicatorId.toLowerCase())
  }

  /**
   * 获取主图指标当前参数
   */
  getMainIndicatorParams(indicatorId: string): Record<string, number | boolean | string> {
    return this.activeMainIndicators.get(indicatorId.toLowerCase()) ?? {}
  }

  /**
   * 强制全部重算
   */
  recompute(): void {
    // 递增版本号，确保 worker 端也会重新计算
    this.dataVersion++
    this.triggerRecompute()
  }

  // ============================================================================
  // 计算触发
  // ============================================================================

  private triggerRecompute(): void {
    if (this.currentData.length === 0) return
    if (this.useWorker && this.worker && this.workerReady) {
      this.computeWithWorker()
    } else {
      this.computeWithInline()
    }
  }

  private computeWithWorker(): void {
    if (!this.worker || !this.workerReady) return

    const requestId = this.beginCalculation()

    console.log(
      `[IndicatorScheduler] >> Worker compute: requestId=${requestId} dataV=${this.dataVersion} configV=${this.configVersion}`,
    )
    this.pendingRequest = {
      requestId,
      dataVersion: this.dataVersion,
      configVersion: this.configVersion,
    }

    // 发送数据（首次或变更时）
    this.worker.postMessage({
      type: 'setData',
      dataVersion: this.dataVersion,
      format: 'aos',
      data: this.currentData,
    })

    // 请求计算
    this.worker.postMessage({
      type: 'computeSeries',
      requestId,
      dataVersion: this.dataVersion,
      configVersion: this.configVersion,
      instances: this.buildInstanceCalculationInputs(),
    })
  }

  private computeWithInline(): void {
    if (!this.inlineRuntime) {
      const runtimeDescs = this.registry
        .getAll()
        .filter((m) => m.runtime)
        .map((m) => m.runtime!)
      this.inlineRuntime = new IndicatorRuntime(runtimeDescs)
    }

    const requestId = this.beginCalculation()

    console.log(
      `[IndicatorScheduler] >> INLINE compute: dataV=${this.dataVersion} configV=${this.configVersion}`,
    )

    // 设置数据；计算参数由本次实例请求携带。
    this.inlineRuntime.setData(this.currentData, this.dataVersion)

    // 同步计算
    try {
      const instanceResults = this.inlineRuntime.computeInstanceSeries(
        this.buildInstanceCalculationInputs(),
      )
      // 组装并原子提交 Kernel 状态（内部触发重绘和结果回调）。
      this.applyResults(instanceResults, requestId, this.dataVersion, this.configVersion)
    } catch (error) {
      this.failCalculation(requestId, this.dataVersion, this.configVersion, error)
    }
  }
}
