/**
 * Worker 消息协议
 * 定义主线程与 Indicator Worker 之间的所有通信类型
 */

import type { KLineData } from '@/types/price'
import type {
    MAFlags,
    BOLLPoint,
    EXPMAPoint,
    ENEPoint,
    STOCHPoint,
    KSTPoint,
    MACDPoint,
    SARPoint,
    SuperTrendPoint,
    KeltnerPoint,
    DonchianPoint,
    IchimokuPoint,
} from './calculators'

// ============================================================================
// 配置类型（从 scheduler.ts 提取，避免循环依赖）
// ============================================================================

export interface BOLLSchedulerConfig {
    period: number
    multiplier: number
    showUpper: boolean
    showMiddle: boolean
    showLower: boolean
    showBand: boolean
}

export interface EXPMASchedulerConfig {
    fastPeriod: number
    slowPeriod: number
}

export interface ENESchedulerConfig {
    period: number
    deviation: number
}

export interface RSISchedulerConfig {
    period1: number
    period2: number
    period3: number
    showRSI1: boolean
    showRSI2: boolean
    showRSI3: boolean
}

export interface CCISchedulerConfig {
    period: number
    showCCI: boolean
}

export interface STOCHSchedulerConfig {
    n: number
    m: number
    showK: boolean
    showD: boolean
}

export interface MOMSchedulerConfig {
    period: number
    showMOM: boolean
}

export interface WMSRSchedulerConfig {
    period: number
    showWMSR: boolean
}

export interface KSTSchedulerConfig {
    roc1: number
    roc2: number
    roc3: number
    roc4: number
    signalPeriod: number
    showKST: boolean
    showSignal: boolean
}

export interface FASTKSchedulerConfig {
    period: number
    showFASTK: boolean
}

export interface MACDSchedulerConfig {
    fastPeriod: number
    slowPeriod: number
    signalPeriod: number
    showDIF: boolean
    showDEA: boolean
    showBAR: boolean
}

export interface ATRSchedulerConfig {
    period: number
    showATR: boolean
}

export interface WMASchedulerConfig {
    period: number
    showWMA: boolean
}

export interface DEMASchedulerConfig {
    period: number
    showDEMA: boolean
}

export interface TEMASchedulerConfig {
    period: number
    showTEMA: boolean
}

export interface HMASchedulerConfig {
    period: number
    showHMA: boolean
}

export interface KAMASchedulerConfig {
    period: number
    fastPeriod: number
    slowPeriod: number
    showKAMA: boolean
}

export interface SARSchedulerConfig {
    step: number
    maxStep: number
    showSAR: boolean
}

export interface SuperTrendSchedulerConfig {
    atrPeriod: number
    multiplier: number
    showSuperTrend: boolean
}

export interface KeltnerSchedulerConfig {
    emaPeriod: number
    atrPeriod: number
    multiplier: number
    showUpper: boolean
    showMiddle: boolean
    showLower: boolean
}

export interface DonchianSchedulerConfig {
    period: number
    showUpper: boolean
    showMiddle: boolean
    showLower: boolean
}

export interface IchimokuSchedulerConfig {
    tenkanPeriod: number
    kijunPeriod: number
    spanBPeriod: number
    displacement: number
    showTenkan: boolean
    showKijun: boolean
    showSpanA: boolean
    showSpanB: boolean
    showCloud: boolean
    showChikou: boolean
}

export interface ROCSchedulerConfig {
    period: number
    showROC: boolean
}

export interface TRIXSchedulerConfig {
    period: number
    signalPeriod: number
    showTRIX: boolean
    showSignal: boolean
}

export interface HVSchedulerConfig {
    period: number
    annualizationFactor: number
    showHV: boolean
}

export interface ParkinsonSchedulerConfig {
    period: number
    annualizationFactor: number
    showParkinson: boolean
}

export interface ChaikinVolSchedulerConfig {
    emaPeriod: number
    rocPeriod: number
    showChaikinVol: boolean
}

export interface VMASchedulerConfig {
    period: number
    showVMA: boolean
}

export interface OBVSchedulerConfig {
    showOBV: boolean
}

export interface PVTSchedulerConfig {
    showPVT: boolean
}

// ============================================================================
// Worker 请求类型
// ============================================================================

export interface InitRequest {
    type: 'init'
    protocolVersion: number
}

export interface SetDataRequest {
    type: 'setData'
    dataVersion: number
    format: 'aos' | 'soa'
    data: KLineData[]
}

export interface SetConfigRequest {
    type: 'setConfig'
    configVersion: number
    configs: IndicatorConfigSnapshot
}

export interface ComputeSeriesRequest {
    type: 'computeSeries'
    requestId: number
    dataVersion: number
    configVersion: number
}

export interface DisposeRequest {
    type: 'dispose'
}

export type IndicatorWorkerRequest =
    | InitRequest
    | SetDataRequest
    | SetConfigRequest
    | ComputeSeriesRequest
    | DisposeRequest

// ============================================================================
// Worker 响应类型
// ============================================================================

export interface ReadyResponse {
    type: 'ready'
    protocolVersion: number
}

export interface SeriesResultResponse {
    type: 'seriesResult'
    requestId: number
    dataVersion: number
    configVersion: number
    results: IndicatorSeriesBundle
    metrics?: {
        computeMs: number
        dataLength: number
    }
}

export interface ErrorResponse {
    type: 'error'
    requestId?: number
    stage: 'init' | 'setData' | 'setConfig' | 'computeSeries'
    message: string
}

export type IndicatorWorkerResponse =
    | ReadyResponse
    | SeriesResultResponse
    | ErrorResponse

// ============================================================================
// 配置快照（Worker 内部使用）
// ============================================================================

export interface IndicatorConfigSnapshot {
    ma: MAFlags
    boll: BOLLSchedulerConfig
    expma: EXPMASchedulerConfig
    ene: ENESchedulerConfig
    rsi: RSISchedulerConfig
    cci: CCISchedulerConfig
    stoch: STOCHSchedulerConfig
    mom: MOMSchedulerConfig
    wmsr: WMSRSchedulerConfig
    kst: KSTSchedulerConfig
    fastk: FASTKSchedulerConfig
    macd: MACDSchedulerConfig
    atr: ATRSchedulerConfig
    wma: WMASchedulerConfig
    dema: DEMASchedulerConfig
    tema: TEMASchedulerConfig
    hma: HMASchedulerConfig
    kama: KAMASchedulerConfig
    sar: SARSchedulerConfig
    supertrend: SuperTrendSchedulerConfig
    keltner: KeltnerSchedulerConfig
    donchian: DonchianSchedulerConfig
    ichimoku: IchimokuSchedulerConfig
    roc: ROCSchedulerConfig
    trix: TRIXSchedulerConfig
    hv: HVSchedulerConfig
    parkinson: ParkinsonSchedulerConfig
    chaikinVol: ChaikinVolSchedulerConfig
    vma: VMASchedulerConfig
    obv: OBVSchedulerConfig
    pvt: PVTSchedulerConfig
    // pane IDs for sub-indicators
    rsiPaneId: string
    cciPaneId: string
    stochPaneId: string
    momPaneId: string
    wmsrPaneId: string
    kstPaneId: string
    fastkPaneId: string
    macdPaneId: string
    atrPaneId: string
    wmaPaneId: string
    demaPaneId: string
    temaPaneId: string
    hmaPaneId: string
    kamaPaneId: string
    sarPaneId: string
    supertrendPaneId: string
    keltnerPaneId: string
    donchianPaneId: string
    ichimokuPaneId: string
    rocPaneId: string
    trixPaneId: string
    hvPaneId: string
    parkinsonPaneId: string
    chaikinVolPaneId: string
    vmaPaneId: string
    obvPaneId: string
    pvtPaneId: string
}

// ============================================================================
// Series 结果包（Worker 计算输出）
// ============================================================================

export interface IndicatorSeriesBundle {
    ma: {
        series: Record<number, (number | undefined)[]>
        enabledPeriods: number[]
    }
    boll: {
        series: BOLLPoint[]
        params: BOLLSchedulerConfig
    }
    expma: {
        series: EXPMAPoint[]
        params: EXPMASchedulerConfig
    }
    ene: {
        series: ENEPoint[]
        params: ENESchedulerConfig
    }
    rsi: {
        series: Record<number, (number | undefined)[]>
        enabledPeriods: number[]
        params: RSISchedulerConfig
    }
    cci: {
        series: (number | undefined)[]
        params: CCISchedulerConfig
    }
    stoch: {
        series: STOCHPoint[]
        params: STOCHSchedulerConfig
    }
    mom: {
        series: (number | undefined)[]
        params: MOMSchedulerConfig
    }
    wmsr: {
        series: (number | undefined)[]
        params: WMSRSchedulerConfig
    }
    kst: {
        series: KSTPoint[]
        params: KSTSchedulerConfig
    }
    fastk: {
        series: (number | undefined)[]
        params: FASTKSchedulerConfig
    }
    macd: {
        series: MACDPoint[]
        params: MACDSchedulerConfig
    }
    atr: {
        series: (number | undefined)[]
        params: ATRSchedulerConfig
    }
    wma: {
        series: (number | undefined)[]
        params: WMASchedulerConfig
    }
    dema: {
        series: (number | undefined)[]
        params: DEMASchedulerConfig
    }
    tema: {
        series: (number | undefined)[]
        params: TEMASchedulerConfig
    }
    hma: {
        series: (number | undefined)[]
        params: HMASchedulerConfig
    }
    kama: {
        series: (number | undefined)[]
        params: KAMASchedulerConfig
    }
    sar: {
        series: (SARPoint | undefined)[]
        params: SARSchedulerConfig
    }
    supertrend: {
        series: (SuperTrendPoint | undefined)[]
        params: SuperTrendSchedulerConfig
    }
    keltner: {
        series: (KeltnerPoint | undefined)[]
        params: KeltnerSchedulerConfig
    }
    donchian: {
        series: (DonchianPoint | undefined)[]
        params: DonchianSchedulerConfig
    }
    ichimoku: {
        series: (IchimokuPoint | undefined)[]
        params: IchimokuSchedulerConfig
    }
    roc: {
        series: (number | undefined)[]
        params: ROCSchedulerConfig
    }
    trix: {
        series: (number | undefined)[]
        signalSeries: (number | undefined)[]
        params: TRIXSchedulerConfig
    }
    hv: {
        series: (number | undefined)[]
        params: HVSchedulerConfig
    }
    parkinson: {
        series: (number | undefined)[]
        params: ParkinsonSchedulerConfig
    }
    chaikinVol: {
        series: (number | undefined)[]
        params: ChaikinVolSchedulerConfig
    }
    vma: {
        series: (number | undefined)[]
        params: VMASchedulerConfig
    }
    obv: {
        series: (number | undefined)[]
        params: OBVSchedulerConfig
    }
    pvt: {
        series: (number | undefined)[]
        params: PVTSchedulerConfig
    }
    /** 本次计算中实际变更的指标列表 */
    _changed: string[]
}

// ============================================================================
// 协议版本
// ============================================================================

export const PROTOCOL_VERSION = 1

// ============================================================================
// 类型守卫
// ============================================================================

export function isWorkerResponse(msg: unknown): msg is IndicatorWorkerResponse {
    if (typeof msg !== 'object' || msg === null) return false
    const m = msg as Record<string, unknown>
    if (typeof m.type !== 'string') return false
    return ['ready', 'seriesResult', 'error'].includes(m.type)
}
