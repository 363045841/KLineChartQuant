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

import type { PluginHost } from '@/plugin'
import type { KLineData } from '@/types/price'
import { IndicatorRuntime } from './indicatorRuntime'
import type { IndicatorWorkerResponse } from './workerProtocol'
import { isWorkerResponse, PROTOCOL_VERSION } from './workerProtocol'
import { composeRenderStates, composeVisibleSubIndicatorStates, computeMainIndicatorPriceRange } from './stateComposer'
import type {
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
    IndicatorConfigSnapshot,
    IndicatorSeriesBundle,
} from './workerProtocol'
import type { MAFlags } from './calculators'

import type { MARenderState } from './maState'
import { MA_STATE_KEY } from './maState'
import type { BOLLRenderState } from './bollState'
import { BOLL_STATE_KEY } from './bollState'
import type { EXPMARenderState } from './expmaState'
import { EXPMA_STATE_KEY } from './expmaState'
import type { ENERenderState } from './eneState'
import { ENE_STATE_KEY } from './eneState'
import type { RSIRenderState } from './rsiState'
import { createRSIStateKey } from './rsiState'
import type { CCIRenderState } from './cciState'
import { createCCIStateKey } from './cciState'
import type { STOCHRenderState } from './stochState'
import { createSTOCHStateKey } from './stochState'
import type { MOMRenderState } from './momState'
import { createMOMStateKey } from './momState'
import type { WMSRRenderState } from './wmsrState'
import { createWMSRStateKey } from './wmsrState'
import type { KSTRenderState } from './kstState'
import { createKSTStateKey } from './kstState'
import type { FASTKRenderState } from './fastkState'
import { createFASTKStateKey } from './fastkState'
import type { MACDRenderState } from './macdState'
import { createMACDStateKey } from './macdState'
import type { ATRRenderState } from './atrState'
import { createATRStateKey, DEFAULT_ATR_PERIOD } from './atrState'

/**
 * 可见范围
 */
interface VisibleRange {
    start: number
    end: number
}

type VisibleSubIndicatorMask = {
    rsi: boolean
    cci: boolean
    stoch: boolean
    mom: boolean
    wmsr: boolean
    kst: boolean
    fastk: boolean
    macd: boolean
    atr: boolean
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
}

/**
 * IndicatorScheduler - 主线程 facade
 */
export class IndicatorScheduler {
    private pluginHost: PluginHost | null = null
    private visibleRange: VisibleRange = { start: 0, end: 0 }
    private activeMainIndicators: Set<string> = new Set()

    // 版本控制
    private dataVersion = 0
    private configVersion = 0
    private requestId = 0
    private lastAppliedRequestId = 0

    // 当前数据和配置快照
    private currentData: KLineData[] = []
    private configSnapshot: IndicatorConfigSnapshot = this.getDefaultConfig()

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

    /** 从 Chart 获取活跃副图 paneId 列表的回调 */
    private getActiveSubPaneIds: (() => string[]) | null = null

    constructor() {
        this.initBackend()
    }

    /**
     * 设置 PluginHost
     */
    setPluginHost(host: PluginHost): void {
        this.pluginHost = host
    }

    /**
     * 设置重绘回调
     */
    setInvalidateCallback(callback: () => void): void {
        this.invalidateCallback = callback
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
     * 销毁调度器
     */
    destroy(): void {
        this.terminateWorker()
        this.inlineRuntime = null
        this.latestResult = null
        this.invalidateCallback = null
    }

    // ============================================================================
    // 初始化
    // ============================================================================

    private getDefaultConfig(): IndicatorConfigSnapshot {
        return {
            ma: { ma5: true, ma10: true, ma20: true, ma30: true, ma60: true },
            boll: {
                period: 20,
                multiplier: 2,
                showUpper: true,
                showMiddle: true,
                showLower: true,
                showBand: true,
            },
            expma: { fastPeriod: 12, slowPeriod: 50 },
            ene: { period: 10, deviation: 11 },
            rsi: {
                period1: 6,
                period2: 12,
                period3: 24,
                showRSI1: true,
                showRSI2: true,
                showRSI3: true,
            },
            cci: { period: 14, showCCI: true },
            stoch: { n: 9, m: 3, showK: true, showD: true },
            mom: { period: 10, showMOM: true },
            wmsr: { period: 14, showWMSR: true },
            kst: {
                roc1: 10,
                roc2: 15,
                roc3: 20,
                roc4: 30,
                signalPeriod: 9,
                showKST: true,
                showSignal: true,
            },
            fastk: { period: 9, showFASTK: true },
            macd: {
                fastPeriod: 12,
                slowPeriod: 26,
                signalPeriod: 9,
                showDIF: true,
                showDEA: true,
                showBAR: true,
            },
            atr: { period: DEFAULT_ATR_PERIOD, showATR: true },
            rsiPaneId: 'sub_RSI',
            cciPaneId: 'sub_CCI',
            stochPaneId: 'sub_STOCH',
            momPaneId: 'sub_MOM',
            wmsrPaneId: 'sub_WMSR',
            kstPaneId: 'sub_KST',
            fastkPaneId: 'sub_FASTK',
            macdPaneId: 'sub_MACD',
            atrPaneId: 'sub_ATR',
        }
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
        console.log('[IndicatorScheduler] tryInitWorker: Worker available?', typeof Worker !== 'undefined')
        if (typeof Worker === 'undefined') {
            return false
        }
        try {
            // Vite 模块 Worker
            const workerUrl = new URL('./indicator.worker.ts', import.meta.url)
            console.log('[IndicatorScheduler] Creating worker from:', workerUrl.href)
            this.worker = new Worker(workerUrl, { type: 'module' })
            console.log('[IndicatorScheduler] Worker created, waiting for ready...')
            this.worker.onmessage = (e) => this.handleWorkerMessage(e.data)
            this.worker.onerror = (err) => {
                console.error('[IndicatorScheduler] Worker error:', err)
                this.fallbackToInline()
            }
            // 发送 init
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
        this.inlineRuntime = new IndicatorRuntime()
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
                // Worker 就绪后立即补算一次，确保后续走 Worker
                this.triggerRecompute()
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
                console.warn('[IndicatorScheduler] Unknown response type:', (_exhaustive as unknown as { type: string }).type)
            }
        }
    }

    private handleSeriesResult(msg: Extract<IndicatorWorkerResponse, { type: 'seriesResult' }>): void {
        // 检查版本是否过期
        if (msg.requestId < this.lastAppliedRequestId) {
            return // 丢弃旧结果
        }
        if (msg.dataVersion !== this.dataVersion || msg.configVersion !== this.configVersion) {
            return // 数据或配置已变更，丢弃旧结果
        }

        console.log(`[IndicatorScheduler] << Worker result: requestId=${msg.requestId} metrics=`, msg.metrics)
        this.lastAppliedRequestId = msg.requestId
        this.pendingRequest = null
        this.latestResult = msg.results

        // 组装并写入 states
        this.applyResults(msg.results)

        // 触发重绘
        this.invalidateCallback?.()
    }

    // ============================================================================
    // 结果应用
    // ============================================================================

    private applyResults(bundle: IndicatorSeriesBundle): void {
        if (!this.pluginHost) return

        const changed = new Set(bundle._changed)
        const timestamp = Date.now()
        const states = composeRenderStates(bundle, this.visibleRange, timestamp)

        // MA（空状态也需要写入，渲染器依赖 sentinel 判断）
        if (changed.has('ma')) {
            this.pluginHost.setSharedState<MARenderState>(MA_STATE_KEY, states.ma, 'ma_scheduler')
        }

        // BOLL
        if (changed.has('boll')) {
            this.pluginHost.setSharedState<BOLLRenderState>(BOLL_STATE_KEY, states.boll, 'indicator_scheduler')
        }

        // EXPMA
        if (changed.has('expma')) {
            this.pluginHost.setSharedState<EXPMARenderState>(EXPMA_STATE_KEY, states.expma, 'indicator_scheduler')
        }

        // ENE
        if (changed.has('ene')) {
            this.pluginHost.setSharedState<ENERenderState>(ENE_STATE_KEY, states.ene, 'indicator_scheduler')
        }

        // RSI
        if (changed.has('rsi')) {
            const rsiKey = createRSIStateKey(this.configSnapshot.rsiPaneId)
            this.pluginHost.setSharedState<RSIRenderState>(rsiKey, states.rsi, 'indicator_scheduler')
        }

        // CCI
        if (changed.has('cci')) {
            const cciKey = createCCIStateKey(this.configSnapshot.cciPaneId)
            this.pluginHost.setSharedState<CCIRenderState>(cciKey, states.cci, 'indicator_scheduler')
        }

        // STOCH
        if (changed.has('stoch')) {
            const stochKey = createSTOCHStateKey(this.configSnapshot.stochPaneId)
            this.pluginHost.setSharedState<STOCHRenderState>(stochKey, states.stoch, 'indicator_scheduler')
        }

        // MOM
        if (changed.has('mom')) {
            const momKey = createMOMStateKey(this.configSnapshot.momPaneId)
            this.pluginHost.setSharedState<MOMRenderState>(momKey, states.mom, 'indicator_scheduler')
        }

        // WMSR
        if (changed.has('wmsr')) {
            const wmsrKey = createWMSRStateKey(this.configSnapshot.wmsrPaneId)
            this.pluginHost.setSharedState<WMSRRenderState>(wmsrKey, states.wmsr, 'indicator_scheduler')
        }

        // KST
        if (changed.has('kst')) {
            const kstKey = createKSTStateKey(this.configSnapshot.kstPaneId)
            this.pluginHost.setSharedState<KSTRenderState>(kstKey, states.kst, 'indicator_scheduler')
        }

        // FASTK
        if (changed.has('fastk')) {
            const fastkKey = createFASTKStateKey(this.configSnapshot.fastkPaneId)
            this.pluginHost.setSharedState<FASTKRenderState>(fastkKey, states.fastk, 'indicator_scheduler')
        }

        // MACD
        if (changed.has('macd')) {
            const macdKey = createMACDStateKey(this.configSnapshot.macdPaneId)
            this.pluginHost.setSharedState<MACDRenderState>(macdKey, states.macd, 'indicator_scheduler')
        }

        // ATR
        if (changed.has('atr')) {
            const atrKey = createATRStateKey(this.configSnapshot.atrPaneId)
            this.pluginHost.setSharedState<ATRRenderState>(atrKey, states.atr, 'indicator_scheduler')
        }
    }

    private updateVisibleStatesOnly(): void {
        if (!this.pluginHost || !this.latestResult) return

        const timestamp = Date.now()
        const activeMask = this.buildActiveSubIndicatorMask()
        const states = composeVisibleSubIndicatorStates(this.latestResult, this.visibleRange, timestamp, activeMask)

        // RSI
        const rsiKey = createRSIStateKey(this.configSnapshot.rsiPaneId)
        this.pluginHost.setSharedState<RSIRenderState>(rsiKey, states.rsi, 'indicator_scheduler')

        // CCI
        const cciKey = createCCIStateKey(this.configSnapshot.cciPaneId)
        this.pluginHost.setSharedState<CCIRenderState>(cciKey, states.cci, 'indicator_scheduler')

        // STOCH
        const stochKey = createSTOCHStateKey(this.configSnapshot.stochPaneId)
        this.pluginHost.setSharedState<STOCHRenderState>(stochKey, states.stoch, 'indicator_scheduler')

        // MOM
        const momKey = createMOMStateKey(this.configSnapshot.momPaneId)
        this.pluginHost.setSharedState<MOMRenderState>(momKey, states.mom, 'indicator_scheduler')

        // WMSR
        const wmsrKey = createWMSRStateKey(this.configSnapshot.wmsrPaneId)
        this.pluginHost.setSharedState<WMSRRenderState>(wmsrKey, states.wmsr, 'indicator_scheduler')

        // KST
        const kstKey = createKSTStateKey(this.configSnapshot.kstPaneId)
        this.pluginHost.setSharedState<KSTRenderState>(kstKey, states.kst, 'indicator_scheduler')

        // FASTK
        const fastkKey = createFASTKStateKey(this.configSnapshot.fastkPaneId)
        this.pluginHost.setSharedState<FASTKRenderState>(fastkKey, states.fastk, 'indicator_scheduler')

        // MACD
        const macdKey = createMACDStateKey(this.configSnapshot.macdPaneId)
        this.pluginHost.setSharedState<MACDRenderState>(macdKey, states.macd, 'indicator_scheduler')

        // ATR
        const atrKey = createATRStateKey(this.configSnapshot.atrPaneId)
        this.pluginHost.setSharedState<ATRRenderState>(atrKey, states.atr, 'indicator_scheduler')
    }

    private buildActiveSubIndicatorMask(): VisibleSubIndicatorMask {
        const activeIds = this.getActiveSubPaneIds?.() ?? []
        return {
            rsi: activeIds.includes(this.configSnapshot.rsiPaneId),
            cci: activeIds.includes(this.configSnapshot.cciPaneId),
            stoch: activeIds.includes(this.configSnapshot.stochPaneId),
            mom: activeIds.includes(this.configSnapshot.momPaneId),
            wmsr: activeIds.includes(this.configSnapshot.wmsrPaneId),
            kst: activeIds.includes(this.configSnapshot.kstPaneId),
            fastk: activeIds.includes(this.configSnapshot.fastkPaneId),
            macd: activeIds.includes(this.configSnapshot.macdPaneId),
            atr: activeIds.includes(this.configSnapshot.atrPaneId),
        }
    }

    /** 仅保留活跃副图的配置，后端只算这些 */
    private buildActiveConfig(): IndicatorConfigSnapshot {
        const activeIds = this.getActiveSubPaneIds?.() ?? []
        if (activeIds.length === 0) return { ...this.configSnapshot }

        const cfg: Record<string, unknown> = { ...this.configSnapshot }
        const subKeys = ['rsi', 'cci', 'stoch', 'mom', 'wmsr', 'kst', 'fastk', 'macd', 'atr'] as const
        for (const key of subKeys) {
            const paneIdKey = `${key}PaneId`
            const paneId = cfg[paneIdKey] as string
            if (!activeIds.includes(paneId)) {
                const subCfg = { ...(cfg[key] as Record<string, unknown>) }
                for (const k of Object.keys(subCfg)) {
                    if (k.startsWith('show')) {
                        subCfg[k] = false
                    }
                }
                cfg[key] = subCfg
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
    update(data: KLineData[], visibleRange: VisibleRange): void {
        this.currentData = data
        this.visibleRange = visibleRange
        this.dataVersion++

        if (this.useWorker && this.worker && this.workerReady) {
            this.computeWithWorker()
        } else {
            this.computeWithInline()
        }
    }

    /**
     * 视口变更时调用 - 同步处理，不走 Worker
     */
    updateVisibleRange(visibleRange: VisibleRange): void {
        this.visibleRange = visibleRange

        // 基于缓存的 series 同步更新极值
        if (this.latestResult) {
            this.updateVisibleStatesOnly()
        }
    }

    /**
     * MA 配置变更
     */
    updateMAConfig(config: MAFlags): void {
        this.configSnapshot.ma = { ...config }
        this.configVersion++
        this.triggerRecompute()
    }

    /**
     * BOLL 配置变更
     */
    updateBOLLConfig(config: Partial<BOLLSchedulerConfig>): void {
        this.configSnapshot.boll = { ...this.configSnapshot.boll, ...config }
        this.configVersion++
        this.triggerRecompute()
    }

    /**
     * EXPMA 配置变更
     */
    updateEXPMAConfig(config: Partial<EXPMASchedulerConfig>): void {
        this.configSnapshot.expma = { ...this.configSnapshot.expma, ...config }
        this.configVersion++
        this.triggerRecompute()
    }

    /**
     * ENE 配置变更
     */
    updateENEConfig(config: Partial<ENESchedulerConfig>): void {
        this.configSnapshot.ene = { ...this.configSnapshot.ene, ...config }
        this.configVersion++
        this.triggerRecompute()
    }

    /**
     * RSI 配置变更
     */
    updateRSIConfig(config: Partial<RSISchedulerConfig>, paneId?: string): void {
        if (paneId !== undefined) {
            this.configSnapshot.rsiPaneId = paneId
        }
        this.configSnapshot.rsi = { ...this.configSnapshot.rsi, ...config }
        this.configVersion++
        this.triggerRecompute()
    }

    /**
     * CCI 配置变更
     */
    updateCCIConfig(config: Partial<CCISchedulerConfig>, paneId?: string): void {
        if (paneId !== undefined) {
            this.configSnapshot.cciPaneId = paneId
        }
        this.configSnapshot.cci = { ...this.configSnapshot.cci, ...config }
        this.configVersion++
        this.triggerRecompute()
    }

    /**
     * STOCH 配置变更
     */
    updateSTOCHConfig(config: Partial<STOCHSchedulerConfig>, paneId?: string): void {
        if (paneId !== undefined) {
            this.configSnapshot.stochPaneId = paneId
        }
        this.configSnapshot.stoch = { ...this.configSnapshot.stoch, ...config }
        this.configVersion++
        this.triggerRecompute()
    }

    /**
     * MOM 配置变更
     */
    updateMOMConfig(config: Partial<MOMSchedulerConfig>, paneId?: string): void {
        if (paneId !== undefined) {
            this.configSnapshot.momPaneId = paneId
        }
        this.configSnapshot.mom = { ...this.configSnapshot.mom, ...config }
        this.configVersion++
        this.triggerRecompute()
    }

    /**
     * WMSR 配置变更
     */
    updateWMSRConfig(config: Partial<WMSRSchedulerConfig>, paneId?: string): void {
        if (paneId !== undefined) {
            this.configSnapshot.wmsrPaneId = paneId
        }
        this.configSnapshot.wmsr = { ...this.configSnapshot.wmsr, ...config }
        this.configVersion++
        this.triggerRecompute()
    }

    /**
     * KST 配置变更
     */
    updateKSTConfig(config: Partial<KSTSchedulerConfig>, paneId?: string): void {
        if (paneId !== undefined) {
            this.configSnapshot.kstPaneId = paneId
        }
        this.configSnapshot.kst = { ...this.configSnapshot.kst, ...config }
        this.configVersion++
        this.triggerRecompute()
    }

    /**
     * FASTK 配置变更
     */
    updateFASTKConfig(config: Partial<FASTKSchedulerConfig>, paneId?: string): void {
        if (paneId !== undefined) {
            this.configSnapshot.fastkPaneId = paneId
        }
        this.configSnapshot.fastk = { ...this.configSnapshot.fastk, ...config }
        this.configVersion++
        this.triggerRecompute()
    }

    /**
     * MACD 配置变更
     */
    updateMACDConfig(config: Partial<MACDSchedulerConfig>, paneId?: string): void {
        if (paneId !== undefined) {
            this.configSnapshot.macdPaneId = paneId
        }
        this.configSnapshot.macd = { ...this.configSnapshot.macd, ...config }
        this.configVersion++
        this.triggerRecompute()
    }

    /**
     * ATR 配置变更
     */
    updateATRConfig(config: Partial<ATRSchedulerConfig>, paneId?: string): void {
        if (paneId !== undefined) {
            this.configSnapshot.atrPaneId = paneId
        }
        this.configSnapshot.atr = { ...this.configSnapshot.atr, ...config }
        this.configVersion++
        this.triggerRecompute()
    }

    /**
     * 设置当前激活的主图指标
     */
    setActiveMainIndicators(indicators: string[]): void {
        this.activeMainIndicators = new Set(indicators.map(i => i.toLowerCase()))
    }

    /**
     * 获取主图指标价格范围
     */
    getMainIndicatorPriceRange(): { min: number; max: number } | null {
        if (!this.latestResult) return null
        return computeMainIndicatorPriceRange(
            this.latestResult,
            this.visibleRange,
            this.activeMainIndicators
        )
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
        if (this.useWorker && this.worker && this.workerReady) {
            this.computeWithWorker()
        } else {
            this.computeWithInline()
        }
    }

    private computeWithWorker(): void {
        if (!this.worker || !this.workerReady) return

        console.log(`[IndicatorScheduler] >> Worker compute: requestId=${this.requestId + 1} dataV=${this.dataVersion} configV=${this.configVersion}`)
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
            this.inlineRuntime = new IndicatorRuntime()
        }

        console.log(`[IndicatorScheduler] >> INLINE compute: dataV=${this.dataVersion} configV=${this.configVersion}`)

        // 设置数据和配置（仅活跃副图）
        this.inlineRuntime.setData(this.currentData, this.dataVersion)
        this.inlineRuntime.setConfig(this.buildActiveConfig(), this.configVersion)

        // 同步计算
        const results = this.inlineRuntime.computeSeries()
        this.latestResult = results

        // 组装并写入 states
        this.applyResults(results)

        // 触发重绘
        this.invalidateCallback?.()
    }
}
