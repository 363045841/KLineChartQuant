/**
 * IndicatorScheduler - 指标调度器（Worker 化重构版）
 *
 * 职责：
 * 1. 维护当前图表激活的指标配置
 * 2. 在数据/配置变更时触发 Worker 计算
 * 3. 接收 Worker 结果，组装 RenderState 并写入 StateStore
 * 4. 同步处理 visibleRange 变更（不走 Worker，避免异步延迟）
 *
 * 架构：
 * - 主线程 facade（本文件）
 * - Worker backend（indicator.worker.ts）
 * - Inline fallback backend（indicatorRuntime.ts）
 */

import type { PluginHost } from '../../foundation/plugin/index'
import type { BaseIndicatorState } from '../../foundation/plugin/index'
import type { KLineData } from '../../foundation/types/price'

import { resolveStateKey, type IndicatorMetadata } from './indicatorMetadata'
import { IndicatorRegistry } from './indicatorRegistry'
import { IndicatorRuntime } from './indicatorRuntime'
// Default constants for default config
import { DEFAULT_ATR_PERIOD } from './state/atrState'
import {
  DEFAULT_CHAIKIN_VOL_EMA_PERIOD,
  DEFAULT_CHAIKIN_VOL_ROC_PERIOD,
} from './state/chaikinVolState'
import { DEFAULT_CMF_PERIOD } from './state/cmfState'
import { DEFAULT_DEMA_PERIOD } from './state/demaState'
import { DEFAULT_DONCHIAN_PERIOD } from './state/donchianState'
import { DEFAULT_FIB_PERIOD } from './state/fibState'
import { DEFAULT_HMA_PERIOD } from './state/hmaState'
import { DEFAULT_HV_PERIOD, DEFAULT_HV_ANNUALIZATION } from './state/hvState'
import {
  DEFAULT_ICHIMOKU_TENKAN,
  DEFAULT_ICHIMOKU_KIJUN,
  DEFAULT_ICHIMOKU_SPAN_B,
  DEFAULT_ICHIMOKU_DISPLACEMENT,
} from './state/ichimokuState'
import {
  DEFAULT_KAMA_PERIOD,
  DEFAULT_KAMA_FAST_PERIOD,
  DEFAULT_KAMA_SLOW_PERIOD,
} from './state/kamaState'
import {
  DEFAULT_KELTNER_EMA_PERIOD,
  DEFAULT_KELTNER_ATR_PERIOD,
  DEFAULT_KELTNER_MULTIPLIER,
} from './state/keltnerState'
import { DEFAULT_MFI_PERIOD } from './state/mfiState'
import { DEFAULT_PARKINSON_PERIOD, DEFAULT_PARKINSON_ANNUALIZATION } from './state/parkinsonState'
import { DEFAULT_ROC_PERIOD } from './state/rocState'
import { DEFAULT_SAR_STEP, DEFAULT_SAR_MAX_STEP } from './state/sarState'
import { DEFAULT_STRUCTURE_LEFT, DEFAULT_STRUCTURE_RIGHT } from './state/structureState'
import {
  DEFAULT_SUPERTREND_ATR_PERIOD,
  DEFAULT_SUPERTREND_MULTIPLIER,
} from './state/supertrendState'
import { DEFAULT_TEMA_PERIOD } from './state/temaState'
import { DEFAULT_TRIX_PERIOD, DEFAULT_TRIX_SIGNAL_PERIOD } from './state/trixState'
import { DEFAULT_VMA_PERIOD } from './state/vmaState'
import {
  DEFAULT_VP_BINS,
  DEFAULT_VP_LOOKBACK,
  DEFAULT_VP_VALUE_AREA,
} from './state/volumeProfileState'
import { DEFAULT_VWAP_SESSION_GAP_MS } from './state/vwapState'
import { DEFAULT_WMA_PERIOD } from './state/wmaState'
import { DEFAULT_ZONES_OB_LOOKBACK } from './state/zonesState'
import {
  composeRenderStates,
  composeVisibleSubIndicatorStates,
  computeMainIndicatorPriceRange,
} from './stateComposer'
import { isWorkerResponse, PROTOCOL_VERSION } from './workerProtocol'
import type {
  IndicatorConfigSnapshot,
  IndicatorSeriesBundle,
  SerializedRuntimeDescriptor,
} from './workerProtocol'
import type { IndicatorWorkerResponse } from './workerProtocol'
import { createSignal, effect, type ReadonlySignal, type Signal } from '../../foundation/reactivity/signal'

/**
 * 可见范围
 */
interface VisibleRange {
  start: number
  end: number
}

// 重新导出配置类型（保持向后兼容）
export type {
  BOLLSchedulerConfig,
  EXPMASchedulerConfig,
  ENESchedulerConfig,
  RSISchedulerConfig,
  CCISchedulerConfig,
  STOCHSchedulerConfig,
  MOMSchedulerConfig,
  WMSRSchedulerConfig,
  KSTSchedulerConfig,
  FASTKSchedulerConfig,
  MACDSchedulerConfig,
  ATRSchedulerConfig,
  WMASchedulerConfig,
  DEMASchedulerConfig,
  TEMASchedulerConfig,
  HMASchedulerConfig,
  KAMASchedulerConfig,
  SARSchedulerConfig,
  SuperTrendSchedulerConfig,
  KeltnerSchedulerConfig,
  DonchianSchedulerConfig,
  IchimokuSchedulerConfig,
  ROCSchedulerConfig,
  TRIXSchedulerConfig,
  HVSchedulerConfig,
  ParkinsonSchedulerConfig,
  ChaikinVolSchedulerConfig,
  VMASchedulerConfig,
  OBVSchedulerConfig,
  PVTSchedulerConfig,
  VWAPSchedulerConfig,
  CMFSchedulerConfig,
  MFISchedulerConfig,
  PivotSchedulerConfig,
  FibSchedulerConfig,
  StructureSchedulerConfig,
  ZonesSchedulerConfig,
  VolumeProfileSchedulerConfig,
} from './workerProtocol'

/**
 * IndicatorScheduler - 主线程 facade
 */
export class IndicatorScheduler {
  private pluginHost: PluginHost | null = null
  private visibleRange: VisibleRange = { start: 0, end: 0 }
  private activeMainIndicators = new Map<string, Record<string, number | boolean | string>>()

  // 版本控制
  private dataVersion = 0
  private configVersion = 0
  private requestId = 0
  private lastAppliedRequestId = 0

  // 当前数据和配置快照
  private currentData: KLineData[] = []
  private configSnapshot!: IndicatorConfigSnapshot
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

  // 缓存的最新结果（用于 visibleRange 变更时同步更新）
  private latestResult: IndicatorSeriesBundle | null = null

  // 重绘回调
  private invalidateCallback: (() => void) | null = null

  // Worker 异步结果应用完毕回调（用于串联其他管线，如 Alert）
  private onResultsAppliedCallback: (() => void) | null = null

  /** 调度器繁忙信号（Worker 计算中时为 true，结果应用后恢复 false） */
  private _busySignal = createSignal(false)

  /** 从 Chart 获取活跃副图 paneId 列表的回调 */
  private getActiveSubPaneIds: (() => string[]) | null = null

  // 注册表
  private registry: IndicatorRegistry

  constructor(autoSync?: boolean) {
    this.registry =
      autoSync !== undefined ? new IndicatorRegistry(autoSync) : new IndicatorRegistry()
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
          defaultConfig:
            typeof rt.defaultConfig === 'function'
              ? (rt.defaultConfig as () => any)()
              : rt.defaultConfig,
          computeKey: rt.computeKey,
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
   * 设置 PluginHost
   */
  setPluginHost(host: PluginHost): void {
    this.pluginHost = host
    host.registerService('indicatorScheduler', this)
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

  /** 调度器繁忙信号 — Worker 计算中为 true，结果应用后恢复 false */
  get busySignal(): Signal<boolean> {
    return this._busySignal
  }

  /**
   * 副图增删后通知 scheduler 刷新 active mask
   */
  onSubPaneChanged(): void {
    if (this.latestResult) this.updateVisibleStatesOnly()
  }

  /**
   * 设置活跃副图 paneId 提供者（来自 Chart.getSubPaneIndicators）
   */
  setActiveSubPaneProvider(provider: () => string[]): void {
    this.getActiveSubPaneIds = provider
  }

  /**
   * 绑定 visibleRange 信号 — 替代手动 updateVisibleRange 调用。
   * signal 变化时自动更新内部 visibleRange 并重算 visible state。
   */
  setVisibleRangeSignal(signal: ReadonlySignal<{ start: number; end: number } | null>): void {
    effect(() => {
      const range = signal()
      if (range) {
        this.visibleRange = range
        if (this.latestResult) {
          const mainStateUpdated = this.updateVisibleStatesOnly()
          if (mainStateUpdated) {
            this.invalidateCallback?.()
          }
        }
      }
    })
  }

  /**
   * 销毁调度器
   */
  destroy(): void {
    this.terminateWorker()
    this.inlineRuntime = null
    this.latestResult = null
    this.invalidateCallback = null
    this.onResultsAppliedCallback = null
  }

  // ============================================================================
  // 初始化
  // ============================================================================

  private buildInitialConfigSnapshot(): IndicatorConfigSnapshot {
    const config: Record<string, unknown> = {}
    for (const meta of this.registry.getAll()) {
      if (meta.runtime?.defaultConfig) {
        const key = meta.runtime.configKey ?? meta.name
        config[key] = { ...(meta.runtime.defaultConfig as Record<string, unknown>) }
      }
    }
    return config as unknown as IndicatorConfigSnapshot
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
        this.fallbackToInline()
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

  private fallbackToInline(): void {
    console.warn('[IndicatorScheduler] Falling back to inline runtime')
    this.terminateWorker()
    this.initInlineRuntime()
    // 如果有待处理的请求，用 inline 重新执行
    if (this.pendingRequest) {
      this.computeWithInline()
    }
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
              defaultConfig:
                typeof rt.defaultConfig === 'function'
                  ? (rt.defaultConfig as () => any)()
                  : rt.defaultConfig,
              computeKey: rt.computeKey,
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

      case 'error':
        console.error('[IndicatorScheduler] Worker error:', msg.stage, msg.message)
        if (this.pendingRequest && msg.requestId === this.pendingRequest.requestId) {
          this.fallbackToInline()
        }
        break

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
    if (msg.dataVersion !== this.dataVersion || msg.configVersion !== this.configVersion) {
      return // 数据或配置已变更，丢弃旧结果
    }

    console.log(
      `[IndicatorScheduler] << Worker result: requestId=${msg.requestId} metrics=`,
      msg.metrics,
    )
    this.lastAppliedRequestId = msg.requestId
    this.pendingRequest = null
    this.latestResult = msg.results

    // 组装并写入 states（内部触发 busy=false + 回调）
    this.applyResults(msg.results)
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

  /** 遍历注册表中的所有指标，通过 applyResult 回调写入 StateStore */
  private applyResults(bundle: IndicatorSeriesBundle): void {
    if (!this.pluginHost) return

    const changed = new Set(bundle._changed)
    const timestamp = Date.now()
    const states = composeRenderStates(bundle, this.visibleRange, timestamp, (indicatorId) =>
      this.registry.get(indicatorId),
    )

    for (const meta of this.registry.getAll()) {
      if (!changed.has(meta.name)) continue
      if (!meta.applyResult) continue

      const state = (states as Record<string, unknown>)[meta.name]
      if (!state) continue

      this.checkVisibleExtremes(
        state as { visibleMin: number; visibleMax: number },
        meta.displayName,
      )

      const paneId = this.paneIdOverrides.get(meta.name) ?? meta.defaultPaneId

      meta.applyResult(this.pluginHost, state as BaseIndicatorState, paneId)
    }

    this._busySignal.set(false)
    this.invalidateCallback?.()
    this.onResultsAppliedCallback?.()
  }

  /** 重算可见范围极值并回调 applyResult（视口变更时同步更新，不走 Worker） */
  private updateVisibleStatesOnly(): boolean {
    if (!this.pluginHost || !this.latestResult) return false

    const timestamp = Date.now()
    let mainStates: Record<string, unknown> | null = null
    let mainStateUpdated = false
    const activeMask = this.buildActiveSubIndicatorMask()
    const subStates = composeVisibleSubIndicatorStates(
      this.latestResult,
      this.visibleRange,
      timestamp,
      activeMask,
      (indicatorId) => this.registry.get(indicatorId),
    ) as Record<string, unknown>

    for (const meta of this.registry.getAll()) {
      if (!meta.applyResult) continue

      let state: unknown
      if (meta.category === 'main') {
        const paneId = this.paneIdOverrides.get(meta.name) ?? meta.defaultPaneId
        const current = this.pluginHost.getSharedState<
          BaseIndicatorState & { visibleMin?: number; visibleMax?: number }
        >(resolveStateKey(meta.stateKey, paneId))
        const currentValid =
          current &&
          Number.isFinite(current.visibleMin) &&
          Number.isFinite(current.visibleMax) &&
          current.visibleMin! <= current.visibleMax!
        if (currentValid) continue

        mainStates ??= composeRenderStates(
          this.latestResult,
          this.visibleRange,
          timestamp,
          (indicatorId) => this.registry.get(indicatorId),
        ) as Record<string, unknown>
        state = mainStates[meta.name]
      } else {
        state = subStates[meta.name]
      }
      if (state === undefined) continue

      this.checkVisibleExtremes(
        state as { visibleMin: number; visibleMax: number },
        meta.displayName,
      )

      const paneId = this.paneIdOverrides.get(meta.name) ?? meta.defaultPaneId

      meta.applyResult(this.pluginHost, state as BaseIndicatorState, paneId)
      if (meta.category === 'main') {
        mainStateUpdated = true
      }
    }

    return mainStateUpdated
  }

  /** 遍历注册表，标记当前可见副图，仅这些指标参与计算 */
  private buildActiveSubIndicatorMask(): Record<string, boolean> {
    const activeIds = this.getActiveSubPaneIds?.() ?? []
    const mask: Record<string, boolean> = {}
    for (const meta of this.registry.getAll()) {
      const paneId = this.paneIdOverrides.get(meta.name) ?? meta.defaultPaneId
      mask[meta.name] = activeIds.includes(paneId) || !!(meta.allowMainPane && paneId === 'main')
    }
    return mask
  }

  /** 遍历注册表，禁用非活跃副图指标的 show* 字段，后端只算活跃指标 */
  private buildActiveConfig(): IndicatorConfigSnapshot {
    const activeIds = this.getActiveSubPaneIds?.() ?? []
    if (activeIds.length === 0) return { ...this.configSnapshot }

    const cfg: Record<string, unknown> = { ...this.configSnapshot }
    for (const meta of this.registry.getAll()) {
      const paneId = this.paneIdOverrides.get(meta.name) ?? meta.defaultPaneId
      if (!activeIds.includes(paneId) && paneId !== 'main') {
        const subCfg = { ...(cfg[meta.name] as Record<string, unknown>) }
        for (const k of Object.keys(subCfg)) {
          if (k.startsWith('show')) {
            subCfg[k] = false
          }
        }
        cfg[meta.name] = subCfg
      }
    }
    return cfg as unknown as IndicatorConfigSnapshot
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * 数据变更时调用
   */
  update(data: KLineData[], visibleRange: VisibleRange): boolean {
    this.currentData = data
    this.visibleRange = visibleRange
    this.dataVersion++

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
    this.visibleRange = visibleRange

    // 基于缓存的 series 同步更新极值
    if (this.latestResult) {
      const mainStateUpdated = this.updateVisibleStatesOnly()
      if (mainStateUpdated) {
        this.invalidateCallback?.()
      }
    }
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
    // Merge config
    ;(this.configSnapshot as any)[configKey] = {
      ...((this.configSnapshot as any)[configKey] ?? {}),
      ...config,
    }
    this.configVersion++
    this.triggerRecompute()
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
    if (!this.latestResult) return null
    const result = computeMainIndicatorPriceRange(
      this.latestResult,
      this.visibleRange,
      new Set(this.activeMainIndicators.keys()),
      (indicatorId) => this.registry.get(indicatorId),
    )
    return result
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
    // 强制 inline runtime 重新计算（无视脏标记）
    if (this.inlineRuntime) {
      this.inlineRuntime.forceDirty()
    }
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

    this._busySignal.set(true)

    console.log(
      `[IndicatorScheduler] >> Worker compute: requestId=${this.requestId + 1} dataV=${this.dataVersion} configV=${this.configVersion}`,
    )
    this.requestId++
    this.pendingRequest = {
      requestId: this.requestId,
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

    // 发送配置（仅活跃副图）
    this.worker.postMessage({
      type: 'setConfig',
      configVersion: this.configVersion,
      configs: this.buildActiveConfig(),
    })

    // 请求计算
    this.worker.postMessage({
      type: 'computeSeries',
      requestId: this.requestId,
      dataVersion: this.dataVersion,
      configVersion: this.configVersion,
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

    this._busySignal.set(true)

    console.log(
      `[IndicatorScheduler] >> INLINE compute: dataV=${this.dataVersion} configV=${this.configVersion}`,
    )

    // 设置数据和配置（仅活跃副图）
    this.inlineRuntime.setData(this.currentData, this.dataVersion)
    this.inlineRuntime.setConfig(this.buildActiveConfig(), this.configVersion)

    // 同步计算
    const results = this.inlineRuntime.computeSeries()
    this.latestResult = results

    // 组装并写入 states（内部触发 busy=false + 回调）
    this.applyResults(results)
  }
}
