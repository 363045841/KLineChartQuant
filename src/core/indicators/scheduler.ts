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
import type { WMARenderState } from './wmaState'
import { createWMAStateKey, DEFAULT_WMA_PERIOD } from './wmaState'
import type { DEMARenderState } from './demaState'
import { createDEMAStateKey, DEFAULT_DEMA_PERIOD } from './demaState'
import type { TEMARenderState } from './temaState'
import { createTEMAStateKey, DEFAULT_TEMA_PERIOD } from './temaState'
import type { HMARenderState } from './hmaState'
import { createHMAStateKey, DEFAULT_HMA_PERIOD } from './hmaState'
import type { KAMARenderState } from './kamaState'
import { createKAMAStateKey, DEFAULT_KAMA_PERIOD, DEFAULT_KAMA_FAST_PERIOD, DEFAULT_KAMA_SLOW_PERIOD } from './kamaState'
import type { SARRenderState } from './sarState'
import { createSARStateKey, DEFAULT_SAR_STEP, DEFAULT_SAR_MAX_STEP } from './sarState'
import type { SuperTrendRenderState } from './supertrendState'
import {
    createSuperTrendStateKey,
    DEFAULT_SUPERTREND_ATR_PERIOD,
    DEFAULT_SUPERTREND_MULTIPLIER,
} from './supertrendState'
import type { KeltnerRenderState } from './keltnerState'
import {
    createKeltnerStateKey,
    DEFAULT_KELTNER_EMA_PERIOD,
    DEFAULT_KELTNER_ATR_PERIOD,
    DEFAULT_KELTNER_MULTIPLIER,
} from './keltnerState'
import type { DonchianRenderState } from './donchianState'
import { createDonchianStateKey, DEFAULT_DONCHIAN_PERIOD } from './donchianState'
import type { IchimokuRenderState } from './ichimokuState'
import {
    createIchimokuStateKey,
    DEFAULT_ICHIMOKU_TENKAN,
    DEFAULT_ICHIMOKU_KIJUN,
    DEFAULT_ICHIMOKU_SPAN_B,
    DEFAULT_ICHIMOKU_DISPLACEMENT,
} from './ichimokuState'
import type { ROCRenderState } from './rocState'
import { createROCStateKey, DEFAULT_ROC_PERIOD } from './rocState'
import type { TRIXRenderState } from './trixState'
import { createTRIXStateKey, DEFAULT_TRIX_PERIOD, DEFAULT_TRIX_SIGNAL_PERIOD } from './trixState'
import type { HVRenderState } from './hvState'
import { createHVStateKey, DEFAULT_HV_PERIOD, DEFAULT_HV_ANNUALIZATION } from './hvState'
import type { ParkinsonRenderState } from './parkinsonState'
import { createParkinsonStateKey, DEFAULT_PARKINSON_PERIOD, DEFAULT_PARKINSON_ANNUALIZATION } from './parkinsonState'
import type { ChaikinVolRenderState } from './chaikinVolState'
import { createChaikinVolStateKey, DEFAULT_CHAIKIN_VOL_EMA_PERIOD, DEFAULT_CHAIKIN_VOL_ROC_PERIOD } from './chaikinVolState'
import type { VMARenderState } from './vmaState'
import { createVMAStateKey, DEFAULT_VMA_PERIOD } from './vmaState'
import type { OBVRenderState } from './obvState'
import { createOBVStateKey } from './obvState'
import type { PVTRenderState } from './pvtState'
import { createPVTStateKey } from './pvtState'

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
    wma: boolean
    dema: boolean
    tema: boolean
    hma: boolean
    kama: boolean
    sar: boolean
    supertrend: boolean
    keltner: boolean
    donchian: boolean
    ichimoku: boolean
    roc: boolean
    trix: boolean
    hv: boolean
    parkinson: boolean
    chaikinVol: boolean
    vma: boolean
    obv: boolean
    pvt: boolean
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
            wma: { period: DEFAULT_WMA_PERIOD, showWMA: true },
            dema: { period: DEFAULT_DEMA_PERIOD, showDEMA: true },
            tema: { period: DEFAULT_TEMA_PERIOD, showTEMA: true },
            hma: { period: DEFAULT_HMA_PERIOD, showHMA: true },
            kama: {
                period: DEFAULT_KAMA_PERIOD,
                fastPeriod: DEFAULT_KAMA_FAST_PERIOD,
                slowPeriod: DEFAULT_KAMA_SLOW_PERIOD,
                showKAMA: true,
            },
            sar: { step: DEFAULT_SAR_STEP, maxStep: DEFAULT_SAR_MAX_STEP, showSAR: true },
            supertrend: {
                atrPeriod: DEFAULT_SUPERTREND_ATR_PERIOD,
                multiplier: DEFAULT_SUPERTREND_MULTIPLIER,
                showSuperTrend: true,
            },
            keltner: {
                emaPeriod: DEFAULT_KELTNER_EMA_PERIOD,
                atrPeriod: DEFAULT_KELTNER_ATR_PERIOD,
                multiplier: DEFAULT_KELTNER_MULTIPLIER,
                showUpper: true,
                showMiddle: true,
                showLower: true,
            },
            donchian: {
                period: DEFAULT_DONCHIAN_PERIOD,
                showUpper: true,
                showMiddle: true,
                showLower: true,
            },
            ichimoku: {
                tenkanPeriod: DEFAULT_ICHIMOKU_TENKAN,
                kijunPeriod: DEFAULT_ICHIMOKU_KIJUN,
                spanBPeriod: DEFAULT_ICHIMOKU_SPAN_B,
                displacement: DEFAULT_ICHIMOKU_DISPLACEMENT,
                showTenkan: true,
                showKijun: true,
                showSpanA: true,
                showSpanB: true,
                showCloud: true,
                showChikou: true,
            },
            roc: { period: DEFAULT_ROC_PERIOD, showROC: true },
            trix: {
                period: DEFAULT_TRIX_PERIOD,
                signalPeriod: DEFAULT_TRIX_SIGNAL_PERIOD,
                showTRIX: true,
                showSignal: true,
            },
            hv: { period: DEFAULT_HV_PERIOD, annualizationFactor: DEFAULT_HV_ANNUALIZATION, showHV: true },
            parkinson: { period: DEFAULT_PARKINSON_PERIOD, annualizationFactor: DEFAULT_PARKINSON_ANNUALIZATION, showParkinson: true },
            chaikinVol: { emaPeriod: DEFAULT_CHAIKIN_VOL_EMA_PERIOD, rocPeriod: DEFAULT_CHAIKIN_VOL_ROC_PERIOD, showChaikinVol: true },
            vma: { period: DEFAULT_VMA_PERIOD, showVMA: true },
            obv: { showOBV: true },
            pvt: { showPVT: true },
            rsiPaneId: 'sub_RSI',
            cciPaneId: 'sub_CCI',
            stochPaneId: 'sub_STOCH',
            momPaneId: 'sub_MOM',
            wmsrPaneId: 'sub_WMSR',
            kstPaneId: 'sub_KST',
            fastkPaneId: 'sub_FASTK',
            macdPaneId: 'sub_MACD',
            atrPaneId: 'sub_ATR',
            wmaPaneId: 'sub_WMA',
            demaPaneId: 'sub_DEMA',
            temaPaneId: 'sub_TEMA',
            hmaPaneId: 'sub_HMA',
            kamaPaneId: 'sub_KAMA',
            sarPaneId: 'sub_SAR',
            supertrendPaneId: 'sub_SuperTrend',
            keltnerPaneId: 'sub_Keltner',
            donchianPaneId: 'sub_Donchian',
            ichimokuPaneId: 'sub_Ichimoku',
            rocPaneId: 'sub_ROC',
            trixPaneId: 'sub_TRIX',
            hvPaneId: 'sub_HV',
            parkinsonPaneId: 'sub_Parkinson',
            chaikinVolPaneId: 'sub_ChaikinVol',
            vmaPaneId: 'sub_VMA',
            obvPaneId: 'sub_OBV',
            pvtPaneId: 'sub_PVT',
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

        // WMA
        if (changed.has('wma')) {
            const wmaKey = createWMAStateKey(this.configSnapshot.wmaPaneId)
            this.pluginHost.setSharedState<WMARenderState>(wmaKey, states.wma, 'indicator_scheduler')
        }

        // DEMA
        if (changed.has('dema')) {
            const demaKey = createDEMAStateKey(this.configSnapshot.demaPaneId)
            this.pluginHost.setSharedState<DEMARenderState>(demaKey, states.dema, 'indicator_scheduler')
        }

        // TEMA
        if (changed.has('tema')) {
            const temaKey = createTEMAStateKey(this.configSnapshot.temaPaneId)
            this.pluginHost.setSharedState<TEMARenderState>(temaKey, states.tema, 'indicator_scheduler')
        }

        // HMA
        if (changed.has('hma')) {
            const hmaKey = createHMAStateKey(this.configSnapshot.hmaPaneId)
            this.pluginHost.setSharedState<HMARenderState>(hmaKey, states.hma, 'indicator_scheduler')
        }

        // KAMA
        if (changed.has('kama')) {
            const kamaKey = createKAMAStateKey(this.configSnapshot.kamaPaneId)
            this.pluginHost.setSharedState<KAMARenderState>(kamaKey, states.kama, 'indicator_scheduler')
        }

        // SAR
        if (changed.has('sar')) {
            const sarKey = createSARStateKey(this.configSnapshot.sarPaneId)
            this.pluginHost.setSharedState<SARRenderState>(sarKey, states.sar, 'indicator_scheduler')
        }

        // SuperTrend
        if (changed.has('supertrend')) {
            const stKey = createSuperTrendStateKey(this.configSnapshot.supertrendPaneId)
            this.pluginHost.setSharedState<SuperTrendRenderState>(stKey, states.supertrend, 'indicator_scheduler')
        }

        // Keltner
        if (changed.has('keltner')) {
            const kKey = createKeltnerStateKey(this.configSnapshot.keltnerPaneId)
            this.pluginHost.setSharedState<KeltnerRenderState>(kKey, states.keltner, 'indicator_scheduler')
        }

        // Donchian
        if (changed.has('donchian')) {
            const dKey = createDonchianStateKey(this.configSnapshot.donchianPaneId)
            this.pluginHost.setSharedState<DonchianRenderState>(dKey, states.donchian, 'indicator_scheduler')
        }

        // Ichimoku
        if (changed.has('ichimoku')) {
            const iKey = createIchimokuStateKey(this.configSnapshot.ichimokuPaneId)
            this.pluginHost.setSharedState<IchimokuRenderState>(iKey, states.ichimoku, 'indicator_scheduler')
        }

        // ROC
        if (changed.has('roc')) {
            const rKey = createROCStateKey(this.configSnapshot.rocPaneId)
            this.pluginHost.setSharedState<ROCRenderState>(rKey, states.roc, 'indicator_scheduler')
        }

        // TRIX
        if (changed.has('trix')) {
            const tKey = createTRIXStateKey(this.configSnapshot.trixPaneId)
            this.pluginHost.setSharedState<TRIXRenderState>(tKey, states.trix, 'indicator_scheduler')
        }

        // HV
        if (changed.has('hv')) {
            const hKey = createHVStateKey(this.configSnapshot.hvPaneId)
            this.pluginHost.setSharedState<HVRenderState>(hKey, states.hv, 'indicator_scheduler')
        }

        // Parkinson
        if (changed.has('parkinson')) {
            const pKey = createParkinsonStateKey(this.configSnapshot.parkinsonPaneId)
            this.pluginHost.setSharedState<ParkinsonRenderState>(pKey, states.parkinson, 'indicator_scheduler')
        }

        // ChaikinVol
        if (changed.has('chaikinVol')) {
            const cKey = createChaikinVolStateKey(this.configSnapshot.chaikinVolPaneId)
            this.pluginHost.setSharedState<ChaikinVolRenderState>(cKey, states.chaikinVol, 'indicator_scheduler')
        }

        // VMA
        if (changed.has('vma')) {
            const vmaKey = createVMAStateKey(this.configSnapshot.vmaPaneId)
            this.pluginHost.setSharedState<VMARenderState>(vmaKey, states.vma, 'indicator_scheduler')
        }

        // OBV
        if (changed.has('obv')) {
            const obvKey = createOBVStateKey(this.configSnapshot.obvPaneId)
            this.pluginHost.setSharedState<OBVRenderState>(obvKey, states.obv, 'indicator_scheduler')
        }

        // PVT
        if (changed.has('pvt')) {
            const pvtKey = createPVTStateKey(this.configSnapshot.pvtPaneId)
            this.pluginHost.setSharedState<PVTRenderState>(pvtKey, states.pvt, 'indicator_scheduler')
        }
    }

    private updateVisibleStatesOnly(): void {
        if (!this.pluginHost || !this.latestResult) return

        const timestamp = Date.now()
        const activeMask = this.buildActiveSubIndicatorMask()
        const states = composeVisibleSubIndicatorStates(this.latestResult, this.visibleRange, timestamp, activeMask)
        console.log(`[ATR-Scheduler] updateVisibleStatesOnly: atrActive=${!!activeMask.atr} atrPaneId=${this.configSnapshot.atrPaneId} seriesLen=${states.atr.series.length}`)

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

        // WMA
        const wmaKey = createWMAStateKey(this.configSnapshot.wmaPaneId)
        this.pluginHost.setSharedState<WMARenderState>(wmaKey, states.wma, 'indicator_scheduler')

        // DEMA
        const demaKey = createDEMAStateKey(this.configSnapshot.demaPaneId)
        this.pluginHost.setSharedState<DEMARenderState>(demaKey, states.dema, 'indicator_scheduler')

        // TEMA
        const temaKey = createTEMAStateKey(this.configSnapshot.temaPaneId)
        this.pluginHost.setSharedState<TEMARenderState>(temaKey, states.tema, 'indicator_scheduler')

        // HMA
        const hmaKey = createHMAStateKey(this.configSnapshot.hmaPaneId)
        this.pluginHost.setSharedState<HMARenderState>(hmaKey, states.hma, 'indicator_scheduler')

        // KAMA
        const kamaKey = createKAMAStateKey(this.configSnapshot.kamaPaneId)
        this.pluginHost.setSharedState<KAMARenderState>(kamaKey, states.kama, 'indicator_scheduler')

        // SAR
        const sarKey = createSARStateKey(this.configSnapshot.sarPaneId)
        this.pluginHost.setSharedState<SARRenderState>(sarKey, states.sar, 'indicator_scheduler')

        // SuperTrend
        const stKey = createSuperTrendStateKey(this.configSnapshot.supertrendPaneId)
        this.pluginHost.setSharedState<SuperTrendRenderState>(stKey, states.supertrend, 'indicator_scheduler')

        // Keltner
        const kKey = createKeltnerStateKey(this.configSnapshot.keltnerPaneId)
        this.pluginHost.setSharedState<KeltnerRenderState>(kKey, states.keltner, 'indicator_scheduler')

        // Donchian
        const dKey = createDonchianStateKey(this.configSnapshot.donchianPaneId)
        this.pluginHost.setSharedState<DonchianRenderState>(dKey, states.donchian, 'indicator_scheduler')

        // Ichimoku
        const iKey = createIchimokuStateKey(this.configSnapshot.ichimokuPaneId)
        this.pluginHost.setSharedState<IchimokuRenderState>(iKey, states.ichimoku, 'indicator_scheduler')

        // ROC
        const rKey = createROCStateKey(this.configSnapshot.rocPaneId)
        this.pluginHost.setSharedState<ROCRenderState>(rKey, states.roc, 'indicator_scheduler')

        // TRIX
        const tKey = createTRIXStateKey(this.configSnapshot.trixPaneId)
        this.pluginHost.setSharedState<TRIXRenderState>(tKey, states.trix, 'indicator_scheduler')

        // HV
        const hKey = createHVStateKey(this.configSnapshot.hvPaneId)
        this.pluginHost.setSharedState<HVRenderState>(hKey, states.hv, 'indicator_scheduler')

        // Parkinson
        const pKey = createParkinsonStateKey(this.configSnapshot.parkinsonPaneId)
        this.pluginHost.setSharedState<ParkinsonRenderState>(pKey, states.parkinson, 'indicator_scheduler')

        // ChaikinVol
        const cKey = createChaikinVolStateKey(this.configSnapshot.chaikinVolPaneId)
        this.pluginHost.setSharedState<ChaikinVolRenderState>(cKey, states.chaikinVol, 'indicator_scheduler')

        // VMA
        const vmaKey = createVMAStateKey(this.configSnapshot.vmaPaneId)
        this.pluginHost.setSharedState<VMARenderState>(vmaKey, states.vma, 'indicator_scheduler')

        // OBV
        const obvKey = createOBVStateKey(this.configSnapshot.obvPaneId)
        this.pluginHost.setSharedState<OBVRenderState>(obvKey, states.obv, 'indicator_scheduler')

        // PVT
        const pvtKey = createPVTStateKey(this.configSnapshot.pvtPaneId)
        this.pluginHost.setSharedState<PVTRenderState>(pvtKey, states.pvt, 'indicator_scheduler')
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
            wma: activeIds.includes(this.configSnapshot.wmaPaneId),
            dema: activeIds.includes(this.configSnapshot.demaPaneId),
            tema: activeIds.includes(this.configSnapshot.temaPaneId),
            hma: activeIds.includes(this.configSnapshot.hmaPaneId),
            kama: activeIds.includes(this.configSnapshot.kamaPaneId),
            sar: activeIds.includes(this.configSnapshot.sarPaneId),
            supertrend: activeIds.includes(this.configSnapshot.supertrendPaneId),
            keltner: activeIds.includes(this.configSnapshot.keltnerPaneId),
            donchian: activeIds.includes(this.configSnapshot.donchianPaneId),
            ichimoku: activeIds.includes(this.configSnapshot.ichimokuPaneId),
            roc: activeIds.includes(this.configSnapshot.rocPaneId),
            trix: activeIds.includes(this.configSnapshot.trixPaneId),
            hv: activeIds.includes(this.configSnapshot.hvPaneId),
            parkinson: activeIds.includes(this.configSnapshot.parkinsonPaneId),
            chaikinVol: activeIds.includes(this.configSnapshot.chaikinVolPaneId),
            vma: activeIds.includes(this.configSnapshot.vmaPaneId),
            obv: activeIds.includes(this.configSnapshot.obvPaneId),
            pvt: activeIds.includes(this.configSnapshot.pvtPaneId),
        }
    }

    /** 仅保留活跃副图的配置，后端只算这些 */
    private buildActiveConfig(): IndicatorConfigSnapshot {
        const activeIds = this.getActiveSubPaneIds?.() ?? []
        if (activeIds.length === 0) return { ...this.configSnapshot }

        const cfg: Record<string, unknown> = { ...this.configSnapshot }
        const subKeys = ['rsi', 'cci', 'stoch', 'mom', 'wmsr', 'kst', 'fastk', 'macd', 'atr', 'wma', 'dema', 'tema', 'hma', 'kama', 'sar', 'supertrend', 'keltner', 'donchian', 'ichimoku', 'roc', 'trix', 'hv', 'parkinson', 'chaikinVol', 'vma', 'obv', 'pvt'] as const
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
     * WMA 配置变更
     */
    updateWMAConfig(config: Partial<WMASchedulerConfig>, paneId?: string): void {
        if (paneId !== undefined) {
            this.configSnapshot.wmaPaneId = paneId
        }
        this.configSnapshot.wma = { ...this.configSnapshot.wma, ...config }
        this.configVersion++
        this.triggerRecompute()
    }

    /**
     * DEMA 配置变更
     */
    updateDEMAConfig(config: Partial<DEMASchedulerConfig>, paneId?: string): void {
        if (paneId !== undefined) {
            this.configSnapshot.demaPaneId = paneId
        }
        this.configSnapshot.dema = { ...this.configSnapshot.dema, ...config }
        this.configVersion++
        this.triggerRecompute()
    }

    /**
     * TEMA 配置变更
     */
    updateTEMAConfig(config: Partial<TEMASchedulerConfig>, paneId?: string): void {
        if (paneId !== undefined) {
            this.configSnapshot.temaPaneId = paneId
        }
        this.configSnapshot.tema = { ...this.configSnapshot.tema, ...config }
        this.configVersion++
        this.triggerRecompute()
    }

    /**
     * HMA 配置变更
     */
    updateHMAConfig(config: Partial<HMASchedulerConfig>, paneId?: string): void {
        if (paneId !== undefined) {
            this.configSnapshot.hmaPaneId = paneId
        }
        this.configSnapshot.hma = { ...this.configSnapshot.hma, ...config }
        this.configVersion++
        this.triggerRecompute()
    }

    /**
     * KAMA 配置变更
     */
    updateKAMAConfig(config: Partial<KAMASchedulerConfig>, paneId?: string): void {
        if (paneId !== undefined) {
            this.configSnapshot.kamaPaneId = paneId
        }
        this.configSnapshot.kama = { ...this.configSnapshot.kama, ...config }
        this.configVersion++
        this.triggerRecompute()
    }

    /**
     * SAR 配置变更
     */
    updateSARConfig(config: Partial<SARSchedulerConfig>, paneId?: string): void {
        if (paneId !== undefined) {
            this.configSnapshot.sarPaneId = paneId
        }
        this.configSnapshot.sar = { ...this.configSnapshot.sar, ...config }
        this.configVersion++
        this.triggerRecompute()
    }

    /**
     * SuperTrend 配置变更
     */
    updateSuperTrendConfig(config: Partial<SuperTrendSchedulerConfig>, paneId?: string): void {
        if (paneId !== undefined) this.configSnapshot.supertrendPaneId = paneId
        this.configSnapshot.supertrend = { ...this.configSnapshot.supertrend, ...config }
        this.configVersion++
        this.triggerRecompute()
    }

    /**
     * Keltner 配置变更
     */
    updateKeltnerConfig(config: Partial<KeltnerSchedulerConfig>, paneId?: string): void {
        if (paneId !== undefined) this.configSnapshot.keltnerPaneId = paneId
        this.configSnapshot.keltner = { ...this.configSnapshot.keltner, ...config }
        this.configVersion++
        this.triggerRecompute()
    }

    /**
     * Donchian 配置变更
     */
    updateDonchianConfig(config: Partial<DonchianSchedulerConfig>, paneId?: string): void {
        if (paneId !== undefined) this.configSnapshot.donchianPaneId = paneId
        this.configSnapshot.donchian = { ...this.configSnapshot.donchian, ...config }
        this.configVersion++
        this.triggerRecompute()
    }

    /**
     * Ichimoku 配置变更
     */
    updateIchimokuConfig(config: Partial<IchimokuSchedulerConfig>, paneId?: string): void {
        if (paneId !== undefined) this.configSnapshot.ichimokuPaneId = paneId
        this.configSnapshot.ichimoku = { ...this.configSnapshot.ichimoku, ...config }
        this.configVersion++
        this.triggerRecompute()
    }

    /**
     * ROC 配置变更
     */
    updateROCConfig(config: Partial<ROCSchedulerConfig>, paneId?: string): void {
        if (paneId !== undefined) this.configSnapshot.rocPaneId = paneId
        this.configSnapshot.roc = { ...this.configSnapshot.roc, ...config }
        this.configVersion++
        this.triggerRecompute()
    }

    /**
     * TRIX 配置变更
     */
    updateTRIXConfig(config: Partial<TRIXSchedulerConfig>, paneId?: string): void {
        if (paneId !== undefined) this.configSnapshot.trixPaneId = paneId
        this.configSnapshot.trix = { ...this.configSnapshot.trix, ...config }
        this.configVersion++
        this.triggerRecompute()
    }

    /**
     * HV 配置变更
     */
    updateHVConfig(config: Partial<HVSchedulerConfig>, paneId?: string): void {
        if (paneId !== undefined) this.configSnapshot.hvPaneId = paneId
        this.configSnapshot.hv = { ...this.configSnapshot.hv, ...config }
        this.configVersion++
        this.triggerRecompute()
    }

    /**
     * Parkinson 配置变更
     */
    updateParkinsonConfig(config: Partial<ParkinsonSchedulerConfig>, paneId?: string): void {
        if (paneId !== undefined) this.configSnapshot.parkinsonPaneId = paneId
        this.configSnapshot.parkinson = { ...this.configSnapshot.parkinson, ...config }
        this.configVersion++
        this.triggerRecompute()
    }

    /**
     * ChaikinVol 配置变更
     */
    updateChaikinVolConfig(config: Partial<ChaikinVolSchedulerConfig>, paneId?: string): void {
        if (paneId !== undefined) this.configSnapshot.chaikinVolPaneId = paneId
        this.configSnapshot.chaikinVol = { ...this.configSnapshot.chaikinVol, ...config }
        this.configVersion++
        this.triggerRecompute()
    }

    /**
     * VMA 配置变更
     */
    updateVMAConfig(config: Partial<VMASchedulerConfig>, paneId?: string): void {
        if (paneId !== undefined) this.configSnapshot.vmaPaneId = paneId
        this.configSnapshot.vma = { ...this.configSnapshot.vma, ...config }
        this.configVersion++
        this.triggerRecompute()
    }

    /**
     * OBV 配置变更
     */
    updateOBVConfig(config: Partial<OBVSchedulerConfig>, paneId?: string): void {
        if (paneId !== undefined) this.configSnapshot.obvPaneId = paneId
        this.configSnapshot.obv = { ...this.configSnapshot.obv, ...config }
        this.configVersion++
        this.triggerRecompute()
    }

    /**
     * PVT 配置变更
     */
    updatePVTConfig(config: Partial<PVTSchedulerConfig>, paneId?: string): void {
        if (paneId !== undefined) this.configSnapshot.pvtPaneId = paneId
        this.configSnapshot.pvt = { ...this.configSnapshot.pvt, ...config }
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
