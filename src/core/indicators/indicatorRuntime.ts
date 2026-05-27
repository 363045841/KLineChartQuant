/**
 * Indicator 纯计算运行时
 * 不依赖 PluginHost/StateStore，只负责计算和缓存
 * 可被主线程（inline fallback）或 Worker 使用
 */

import type { KLineData } from '@/types/price'
import {
    calcMAData,
    calcBOLLData,
    calcEXPMAData,
    calcENEData,
    calcRSIData,
    calcCCIData,
    calcSTOCHData,
    calcMOMData,
    calcWMSRData,
    calcKSTData,
    calcFASTKData,
    calcMACDData,
    calcATRData,
    calcWMAData,
    calcDEMAData,
    calcTEMAData,
    calcHMAData,
    calcKAMAData,
    calcSARData,
    calcSuperTrendData,
    calcKeltnerData,
    calcDonchianData,
    calcIchimokuData,
    calcROCData,
    calcTRIXData,
    DEFAULT_MA_PERIODS,
    DEFAULT_ATR_PERIOD,
    DEFAULT_WMA_PERIOD,
    DEFAULT_DEMA_PERIOD,
    DEFAULT_TEMA_PERIOD,
    DEFAULT_HMA_PERIOD,
    DEFAULT_KAMA_PERIOD,
    DEFAULT_KAMA_FAST_PERIOD,
    DEFAULT_KAMA_SLOW_PERIOD,
    DEFAULT_SAR_STEP,
    DEFAULT_SAR_MAX_STEP,
    DEFAULT_SUPERTREND_ATR_PERIOD,
    DEFAULT_SUPERTREND_MULTIPLIER,
    DEFAULT_KELTNER_EMA_PERIOD,
    DEFAULT_KELTNER_ATR_PERIOD,
    DEFAULT_KELTNER_MULTIPLIER,
    DEFAULT_DONCHIAN_PERIOD,
    DEFAULT_ICHIMOKU_TENKAN,
    DEFAULT_ICHIMOKU_KIJUN,
    DEFAULT_ICHIMOKU_SPAN_B,
    DEFAULT_ICHIMOKU_DISPLACEMENT,
    DEFAULT_ROC_PERIOD,
    DEFAULT_TRIX_PERIOD,
    DEFAULT_TRIX_SIGNAL_PERIOD,
    type MAFlags,
    type BOLLPoint,
    type EXPMAPoint,
    type ENEPoint,
    type STOCHPoint,
    type KSTPoint,
    type MACDPoint,
    type SARPoint,
    type SuperTrendPoint,
    type KeltnerPoint,
    type DonchianPoint,
    type IchimokuPoint,
} from './calculators'
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
    IndicatorConfigSnapshot,
    IndicatorSeriesBundle,
} from './workerProtocol'

/**
 * 可见范围
 */
interface VisibleRange {
    start: number
    end: number
}

/**
 * 计算运行时
 * 管理数据、配置、缓存和脏标记
 */
export class IndicatorRuntime {
    // 数据
    private currentData: KLineData[] = []
    private dataVersion = 0

    // 配置
    private config: IndicatorConfigSnapshot = this.getDefaultConfig()
    private configVersion = 0

    // 缓存的 series
    private cachedSeries: Record<number, (number | undefined)[]> = {}
    private cachedBollSeries: BOLLPoint[] = []
    private cachedExpmaSeries: EXPMAPoint[] = []
    private cachedEneSeries: ENEPoint[] = []
    private cachedRsiSeries: Record<number, (number | undefined)[]> = {}
    private cachedCciSeries: (number | undefined)[] = []
    private cachedStochSeries: STOCHPoint[] = []
    private cachedMomSeries: (number | undefined)[] = []
    private cachedWmsrSeries: (number | undefined)[] = []
    private cachedKstSeries: KSTPoint[] = []
    private cachedFastkSeries: (number | undefined)[] = []
    private cachedMacdSeries: MACDPoint[] = []
    private cachedAtrSeries: (number | undefined)[] = []
    private cachedWmaSeries: (number | undefined)[] = []
    private cachedDemaSeries: (number | undefined)[] = []
    private cachedTemaSeries: (number | undefined)[] = []
    private cachedHmaSeries: (number | undefined)[] = []
    private cachedKamaSeries: (number | undefined)[] = []
    private cachedSarSeries: (SARPoint | undefined)[] = []
    private cachedSupertrendSeries: (SuperTrendPoint | undefined)[] = []
    private cachedKeltnerSeries: (KeltnerPoint | undefined)[] = []
    private cachedDonchianSeries: (DonchianPoint | undefined)[] = []
    private cachedIchimokuSeries: (IchimokuPoint | undefined)[] = []
    private cachedRocSeries: (number | undefined)[] = []
    private cachedTrixSeries: (number | undefined)[] = []
    private cachedTrixSignalSeries: (number | undefined)[] = []

    // 脏标记
    private dirtyData = true
    private dirtyMAConfig = true
    private dirtyBollConfig = true
    private dirtyExpmaConfig = true
    private dirtyEneConfig = true
    private dirtyRsiConfig = true
    private dirtyCciConfig = true
    private dirtyStochConfig = true
    private dirtyMomConfig = true
    private dirtyWmsrConfig = true
    private dirtyKstConfig = true
    private dirtyFastkConfig = true
    private dirtyMacdConfig = true
    private dirtyAtrConfig = true
    private dirtyWmaConfig = true
    private dirtyDemaConfig = true
    private dirtyTemaConfig = true
    private dirtyHmaConfig = true
    private dirtyKamaConfig = true
    private dirtySarConfig = true
    private dirtySupertrendConfig = true
    private dirtyKeltnerConfig = true
    private dirtyDonchianConfig = true
    private dirtyIchimokuConfig = true
    private dirtyRocConfig = true
    private dirtyTrixConfig = true

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
        }
    }

    /**
     * 更新数据
     */
    setData(data: KLineData[], version: number): void {
        if (this.dataVersion === version && !this.dirtyData) return
        this.currentData = data
        this.dataVersion = version
        this.dirtyData = true
    }

    /**
     * 更新配置
     */
    private shallowEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
        const keysA = Object.keys(a)
        const keysB = Object.keys(b)
        if (keysA.length !== keysB.length) return false
        for (const key of keysA) {
            if (a[key] !== b[key]) return false
        }
        return true
    }

    /**
     * 更新配置（仅值变更时才设置脏标记）
     */
    setConfig(config: Partial<IndicatorConfigSnapshot>, version: number): void {
        // 合并配置（仅值变更时才标记脏）
        if (config.ma !== undefined && !this.shallowEqual(config.ma as unknown as Record<string, unknown>, this.config.ma as unknown as Record<string, unknown>)) {
            this.config.ma = { ...this.config.ma, ...config.ma }
            this.dirtyMAConfig = true
        }
        if (config.boll !== undefined && !this.shallowEqual(config.boll as unknown as Record<string, unknown>, this.config.boll as unknown as Record<string, unknown>)) {
            this.config.boll = { ...this.config.boll, ...config.boll }
            this.dirtyBollConfig = true
        }
        if (config.expma !== undefined && !this.shallowEqual(config.expma as unknown as Record<string, unknown>, this.config.expma as unknown as Record<string, unknown>)) {
            this.config.expma = { ...this.config.expma, ...config.expma }
            this.dirtyExpmaConfig = true
        }
        if (config.ene !== undefined && !this.shallowEqual(config.ene as unknown as Record<string, unknown>, this.config.ene as unknown as Record<string, unknown>)) {
            this.config.ene = { ...this.config.ene, ...config.ene }
            this.dirtyEneConfig = true
        }
        if (config.rsi !== undefined && !this.shallowEqual(config.rsi as unknown as Record<string, unknown>, this.config.rsi as unknown as Record<string, unknown>)) {
            this.config.rsi = { ...this.config.rsi, ...config.rsi }
            this.dirtyRsiConfig = true
        }
        if (config.cci !== undefined && !this.shallowEqual(config.cci as unknown as Record<string, unknown>, this.config.cci as unknown as Record<string, unknown>)) {
            this.config.cci = { ...this.config.cci, ...config.cci }
            this.dirtyCciConfig = true
        }
        if (config.stoch !== undefined && !this.shallowEqual(config.stoch as unknown as Record<string, unknown>, this.config.stoch as unknown as Record<string, unknown>)) {
            this.config.stoch = { ...this.config.stoch, ...config.stoch }
            this.dirtyStochConfig = true
        }
        if (config.mom !== undefined && !this.shallowEqual(config.mom as unknown as Record<string, unknown>, this.config.mom as unknown as Record<string, unknown>)) {
            this.config.mom = { ...this.config.mom, ...config.mom }
            this.dirtyMomConfig = true
        }
        if (config.wmsr !== undefined && !this.shallowEqual(config.wmsr as unknown as Record<string, unknown>, this.config.wmsr as unknown as Record<string, unknown>)) {
            this.config.wmsr = { ...this.config.wmsr, ...config.wmsr }
            this.dirtyWmsrConfig = true
        }
        if (config.kst !== undefined && !this.shallowEqual(config.kst as unknown as Record<string, unknown>, this.config.kst as unknown as Record<string, unknown>)) {
            this.config.kst = { ...this.config.kst, ...config.kst }
            this.dirtyKstConfig = true
        }
        if (config.fastk !== undefined && !this.shallowEqual(config.fastk as unknown as Record<string, unknown>, this.config.fastk as unknown as Record<string, unknown>)) {
            this.config.fastk = { ...this.config.fastk, ...config.fastk }
            this.dirtyFastkConfig = true
        }
        if (config.macd !== undefined && !this.shallowEqual(config.macd as unknown as Record<string, unknown>, this.config.macd as unknown as Record<string, unknown>)) {
            this.config.macd = { ...this.config.macd, ...config.macd }
            this.dirtyMacdConfig = true
        }
        if (config.atr !== undefined && !this.shallowEqual(config.atr as unknown as Record<string, unknown>, this.config.atr as unknown as Record<string, unknown>)) {
            this.config.atr = { ...this.config.atr, ...config.atr }
            this.dirtyAtrConfig = true
        }
        if (config.wma !== undefined && !this.shallowEqual(config.wma as unknown as Record<string, unknown>, this.config.wma as unknown as Record<string, unknown>)) {
            this.config.wma = { ...this.config.wma, ...config.wma }
            this.dirtyWmaConfig = true
        }
        if (config.dema !== undefined && !this.shallowEqual(config.dema as unknown as Record<string, unknown>, this.config.dema as unknown as Record<string, unknown>)) {
            this.config.dema = { ...this.config.dema, ...config.dema }
            this.dirtyDemaConfig = true
        }
        if (config.tema !== undefined && !this.shallowEqual(config.tema as unknown as Record<string, unknown>, this.config.tema as unknown as Record<string, unknown>)) {
            this.config.tema = { ...this.config.tema, ...config.tema }
            this.dirtyTemaConfig = true
        }
        if (config.hma !== undefined && !this.shallowEqual(config.hma as unknown as Record<string, unknown>, this.config.hma as unknown as Record<string, unknown>)) {
            this.config.hma = { ...this.config.hma, ...config.hma }
            this.dirtyHmaConfig = true
        }
        if (config.kama !== undefined && !this.shallowEqual(config.kama as unknown as Record<string, unknown>, this.config.kama as unknown as Record<string, unknown>)) {
            this.config.kama = { ...this.config.kama, ...config.kama }
            this.dirtyKamaConfig = true
        }
        if (config.sar !== undefined && !this.shallowEqual(config.sar as unknown as Record<string, unknown>, this.config.sar as unknown as Record<string, unknown>)) {
            this.config.sar = { ...this.config.sar, ...config.sar }
            this.dirtySarConfig = true
        }
        if (config.supertrend !== undefined && !this.shallowEqual(config.supertrend as unknown as Record<string, unknown>, this.config.supertrend as unknown as Record<string, unknown>)) {
            this.config.supertrend = { ...this.config.supertrend, ...config.supertrend }
            this.dirtySupertrendConfig = true
        }
        if (config.keltner !== undefined && !this.shallowEqual(config.keltner as unknown as Record<string, unknown>, this.config.keltner as unknown as Record<string, unknown>)) {
            this.config.keltner = { ...this.config.keltner, ...config.keltner }
            this.dirtyKeltnerConfig = true
        }
        if (config.donchian !== undefined && !this.shallowEqual(config.donchian as unknown as Record<string, unknown>, this.config.donchian as unknown as Record<string, unknown>)) {
            this.config.donchian = { ...this.config.donchian, ...config.donchian }
            this.dirtyDonchianConfig = true
        }
        if (config.ichimoku !== undefined && !this.shallowEqual(config.ichimoku as unknown as Record<string, unknown>, this.config.ichimoku as unknown as Record<string, unknown>)) {
            this.config.ichimoku = { ...this.config.ichimoku, ...config.ichimoku }
            this.dirtyIchimokuConfig = true
        }
        if (config.roc !== undefined && !this.shallowEqual(config.roc as unknown as Record<string, unknown>, this.config.roc as unknown as Record<string, unknown>)) {
            this.config.roc = { ...this.config.roc, ...config.roc }
            this.dirtyRocConfig = true
        }
        if (config.trix !== undefined && !this.shallowEqual(config.trix as unknown as Record<string, unknown>, this.config.trix as unknown as Record<string, unknown>)) {
            this.config.trix = { ...this.config.trix, ...config.trix }
            this.dirtyTrixConfig = true
        }
        // pane IDs
        if (config.rsiPaneId !== undefined) this.config.rsiPaneId = config.rsiPaneId
        if (config.cciPaneId !== undefined) this.config.cciPaneId = config.cciPaneId
        if (config.stochPaneId !== undefined) this.config.stochPaneId = config.stochPaneId
        if (config.momPaneId !== undefined) this.config.momPaneId = config.momPaneId
        if (config.wmsrPaneId !== undefined) this.config.wmsrPaneId = config.wmsrPaneId
        if (config.kstPaneId !== undefined) this.config.kstPaneId = config.kstPaneId
        if (config.fastkPaneId !== undefined) this.config.fastkPaneId = config.fastkPaneId
        if (config.macdPaneId !== undefined) this.config.macdPaneId = config.macdPaneId
        if (config.atrPaneId !== undefined) this.config.atrPaneId = config.atrPaneId
        if (config.wmaPaneId !== undefined) this.config.wmaPaneId = config.wmaPaneId
        if (config.demaPaneId !== undefined) this.config.demaPaneId = config.demaPaneId
        if (config.temaPaneId !== undefined) this.config.temaPaneId = config.temaPaneId
        if (config.hmaPaneId !== undefined) this.config.hmaPaneId = config.hmaPaneId
        if (config.kamaPaneId !== undefined) this.config.kamaPaneId = config.kamaPaneId
        if (config.sarPaneId !== undefined) this.config.sarPaneId = config.sarPaneId
        if (config.supertrendPaneId !== undefined) this.config.supertrendPaneId = config.supertrendPaneId
        if (config.keltnerPaneId !== undefined) this.config.keltnerPaneId = config.keltnerPaneId
        if (config.donchianPaneId !== undefined) this.config.donchianPaneId = config.donchianPaneId
        if (config.ichimokuPaneId !== undefined) this.config.ichimokuPaneId = config.ichimokuPaneId
        if (config.rocPaneId !== undefined) this.config.rocPaneId = config.rocPaneId
        if (config.trixPaneId !== undefined) this.config.trixPaneId = config.trixPaneId

        this.configVersion = version
    }

    /**
     * 强制所有指标标记为脏（用于 recompute）
     */
    forceDirty(): void {
        this.dirtyData = true
        this.dirtyMAConfig = true
        this.dirtyBollConfig = true
        this.dirtyExpmaConfig = true
        this.dirtyEneConfig = true
        this.dirtyRsiConfig = true
        this.dirtyCciConfig = true
        this.dirtyStochConfig = true
        this.dirtyMomConfig = true
        this.dirtyWmsrConfig = true
        this.dirtyKstConfig = true
        this.dirtyFastkConfig = true
        this.dirtyMacdConfig = true
        this.dirtyAtrConfig = true
        this.dirtyWmaConfig = true
        this.dirtyDemaConfig = true
        this.dirtyTemaConfig = true
        this.dirtyHmaConfig = true
        this.dirtyKamaConfig = true
        this.dirtySarConfig = true
        this.dirtySupertrendConfig = true
        this.dirtyKeltnerConfig = true
        this.dirtyDonchianConfig = true
        this.dirtyIchimokuConfig = true
        this.dirtyRocConfig = true
        this.dirtyTrixConfig = true
    }

    /**
     * 获取当前数据版本
     */
    getDataVersion(): number {
        return this.dataVersion
    }

    /**
     * 获取当前配置版本
     */
    getConfigVersion(): number {
        return this.configVersion
    }

    /**
     * 计算所有指标的 series（如果脏了）
     * 返回结果包，供主线程组装成 render states
     */
    computeSeries(): IndicatorSeriesBundle {
        const data = this.currentData
        const changed: string[] = []

        // MA
        if (this.dirtyData || this.dirtyMAConfig) {
            this.cachedSeries = {}
            for (const period of DEFAULT_MA_PERIODS) {
                const flagKey = `ma${period}` as keyof MAFlags
                if (this.config.ma[flagKey]) {
                    this.cachedSeries[period] = calcMAData(data, period)
                }
            }
            changed.push('ma')
        }

        // BOLL
        if (this.dirtyData || this.dirtyBollConfig) {
            this.cachedBollSeries = calcBOLLData(
                data,
                this.config.boll.period,
                this.config.boll.multiplier
            )
            changed.push('boll')
        }

        // EXPMA
        if (this.dirtyData || this.dirtyExpmaConfig) {
            this.cachedExpmaSeries = calcEXPMAData(
                data,
                this.config.expma.fastPeriod,
                this.config.expma.slowPeriod
            )
            changed.push('expma')
        }

        // ENE
        if (this.dirtyData || this.dirtyEneConfig) {
            this.cachedEneSeries = calcENEData(
                data,
                this.config.ene.period,
                this.config.ene.deviation
            )
            changed.push('ene')
        }

        // RSI
        if (this.dirtyData || this.dirtyRsiConfig) {
            this.cachedRsiSeries = {}
            const periods = [this.config.rsi.period1, this.config.rsi.period2, this.config.rsi.period3]
            const shows = [this.config.rsi.showRSI1, this.config.rsi.showRSI2, this.config.rsi.showRSI3]
            for (let i = 0; i < periods.length; i++) {
                if (shows[i]) {
                    this.cachedRsiSeries[periods[i]] = calcRSIData(data, periods[i])
                }
            }
            changed.push('rsi')
        }

        // CCI
        if (this.dirtyData || this.dirtyCciConfig) {
            if (this.config.cci.showCCI) {
                this.cachedCciSeries = calcCCIData(data, this.config.cci.period)
            } else {
                this.cachedCciSeries = []
            }
            changed.push('cci')
        }

        // STOCH
        if (this.dirtyData || this.dirtyStochConfig) {
            if (this.config.stoch.showK || this.config.stoch.showD) {
                this.cachedStochSeries = calcSTOCHData(data, this.config.stoch.n, this.config.stoch.m)
            } else {
                this.cachedStochSeries = []
            }
            changed.push('stoch')
        }

        // MOM
        if (this.dirtyData || this.dirtyMomConfig) {
            if (this.config.mom.showMOM) {
                this.cachedMomSeries = calcMOMData(data, this.config.mom.period)
            } else {
                this.cachedMomSeries = []
            }
            changed.push('mom')
        }

        // WMSR
        if (this.dirtyData || this.dirtyWmsrConfig) {
            if (this.config.wmsr.showWMSR) {
                this.cachedWmsrSeries = calcWMSRData(data, this.config.wmsr.period)
            } else {
                this.cachedWmsrSeries = []
            }
            changed.push('wmsr')
        }

        // KST
        if (this.dirtyData || this.dirtyKstConfig) {
            if (this.config.kst.showKST || this.config.kst.showSignal) {
                this.cachedKstSeries = calcKSTData(
                    data,
                    this.config.kst.roc1,
                    this.config.kst.roc2,
                    this.config.kst.roc3,
                    this.config.kst.roc4,
                    this.config.kst.signalPeriod
                )
            } else {
                this.cachedKstSeries = []
            }
            changed.push('kst')
        }

        // FASTK
        if (this.dirtyData || this.dirtyFastkConfig) {
            if (this.config.fastk.showFASTK) {
                this.cachedFastkSeries = calcFASTKData(data, this.config.fastk.period)
            } else {
                this.cachedFastkSeries = []
            }
            changed.push('fastk')
        }

        // MACD
        if (this.dirtyData || this.dirtyMacdConfig) {
            if (this.config.macd.showDIF || this.config.macd.showDEA || this.config.macd.showBAR) {
                this.cachedMacdSeries = calcMACDData(
                    data,
                    this.config.macd.fastPeriod,
                    this.config.macd.slowPeriod,
                    this.config.macd.signalPeriod
                )
            } else {
                this.cachedMacdSeries = []
            }
            changed.push('macd')
        }

        // ATR
        if (this.dirtyData || this.dirtyAtrConfig) {
            if (this.config.atr.showATR) {
                this.cachedAtrSeries = calcATRData(data, this.config.atr.period)
            } else {
                this.cachedAtrSeries = []
            }
            changed.push('atr')
        }

        // WMA
        if (this.dirtyData || this.dirtyWmaConfig) {
            if (this.config.wma.showWMA) {
                this.cachedWmaSeries = calcWMAData(data, this.config.wma.period)
            } else {
                this.cachedWmaSeries = []
            }
            changed.push('wma')
        }

        // DEMA
        if (this.dirtyData || this.dirtyDemaConfig) {
            if (this.config.dema.showDEMA) {
                this.cachedDemaSeries = calcDEMAData(data, this.config.dema.period)
            } else {
                this.cachedDemaSeries = []
            }
            changed.push('dema')
        }

        // TEMA
        if (this.dirtyData || this.dirtyTemaConfig) {
            if (this.config.tema.showTEMA) {
                this.cachedTemaSeries = calcTEMAData(data, this.config.tema.period)
            } else {
                this.cachedTemaSeries = []
            }
            changed.push('tema')
        }

        // HMA
        if (this.dirtyData || this.dirtyHmaConfig) {
            if (this.config.hma.showHMA) {
                this.cachedHmaSeries = calcHMAData(data, this.config.hma.period)
            } else {
                this.cachedHmaSeries = []
            }
            changed.push('hma')
        }

        // KAMA
        if (this.dirtyData || this.dirtyKamaConfig) {
            if (this.config.kama.showKAMA) {
                this.cachedKamaSeries = calcKAMAData(
                    data,
                    this.config.kama.period,
                    this.config.kama.fastPeriod,
                    this.config.kama.slowPeriod,
                )
            } else {
                this.cachedKamaSeries = []
            }
            changed.push('kama')
        }

        // SAR
        if (this.dirtyData || this.dirtySarConfig) {
            if (this.config.sar.showSAR) {
                this.cachedSarSeries = calcSARData(
                    data,
                    this.config.sar.step,
                    this.config.sar.maxStep,
                )
            } else {
                this.cachedSarSeries = []
            }
            changed.push('sar')
        }

        // SuperTrend
        if (this.dirtyData || this.dirtySupertrendConfig) {
            if (this.config.supertrend.showSuperTrend) {
                this.cachedSupertrendSeries = calcSuperTrendData(
                    data,
                    this.config.supertrend.atrPeriod,
                    this.config.supertrend.multiplier,
                )
            } else {
                this.cachedSupertrendSeries = []
            }
            changed.push('supertrend')
        }

        // Keltner
        if (this.dirtyData || this.dirtyKeltnerConfig) {
            if (this.config.keltner.showUpper || this.config.keltner.showMiddle || this.config.keltner.showLower) {
                this.cachedKeltnerSeries = calcKeltnerData(
                    data,
                    this.config.keltner.emaPeriod,
                    this.config.keltner.atrPeriod,
                    this.config.keltner.multiplier,
                )
            } else {
                this.cachedKeltnerSeries = []
            }
            changed.push('keltner')
        }

        // Donchian
        if (this.dirtyData || this.dirtyDonchianConfig) {
            if (this.config.donchian.showUpper || this.config.donchian.showMiddle || this.config.donchian.showLower) {
                this.cachedDonchianSeries = calcDonchianData(data, this.config.donchian.period)
            } else {
                this.cachedDonchianSeries = []
            }
            changed.push('donchian')
        }

        // Ichimoku
        if (this.dirtyData || this.dirtyIchimokuConfig) {
            const ic = this.config.ichimoku
            if (ic.showTenkan || ic.showKijun || ic.showSpanA || ic.showSpanB || ic.showCloud || ic.showChikou) {
                this.cachedIchimokuSeries = calcIchimokuData(
                    data,
                    ic.tenkanPeriod,
                    ic.kijunPeriod,
                    ic.spanBPeriod,
                    ic.displacement,
                )
            } else {
                this.cachedIchimokuSeries = []
            }
            changed.push('ichimoku')
        }

        // ROC
        if (this.dirtyData || this.dirtyRocConfig) {
            if (this.config.roc.showROC) {
                this.cachedRocSeries = calcROCData(data, this.config.roc.period)
            } else {
                this.cachedRocSeries = []
            }
            changed.push('roc')
        }

        // TRIX
        if (this.dirtyData || this.dirtyTrixConfig) {
            if (this.config.trix.showTRIX || this.config.trix.showSignal) {
                const result = calcTRIXData(data, this.config.trix.period, this.config.trix.signalPeriod)
                this.cachedTrixSeries = result.series
                this.cachedTrixSignalSeries = result.signalSeries
            } else {
                this.cachedTrixSeries = []
                this.cachedTrixSignalSeries = []
            }
            changed.push('trix')
        }

        // 重置脏标记
        this.dirtyData = false
        this.dirtyMAConfig = false
        this.dirtyBollConfig = false
        this.dirtyExpmaConfig = false
        this.dirtyEneConfig = false
        this.dirtyRsiConfig = false
        this.dirtyCciConfig = false
        this.dirtyStochConfig = false
        this.dirtyMomConfig = false
        this.dirtyWmsrConfig = false
        this.dirtyKstConfig = false
        this.dirtyFastkConfig = false
        this.dirtyMacdConfig = false
        this.dirtyAtrConfig = false
        this.dirtyWmaConfig = false
        this.dirtyDemaConfig = false
        this.dirtyTemaConfig = false
        this.dirtyHmaConfig = false
        this.dirtyKamaConfig = false
        this.dirtySarConfig = false
        this.dirtySupertrendConfig = false
        this.dirtyKeltnerConfig = false
        this.dirtyDonchianConfig = false
        this.dirtyIchimokuConfig = false
        this.dirtyRocConfig = false
        this.dirtyTrixConfig = false

        // 组装结果
        return {
            ma: {
                series: this.cachedSeries,
                enabledPeriods: Object.keys(this.cachedSeries).map(Number),
            },
            boll: {
                series: this.cachedBollSeries,
                params: { ...this.config.boll },
            },
            expma: {
                series: this.cachedExpmaSeries,
                params: { ...this.config.expma },
            },
            ene: {
                series: this.cachedEneSeries,
                params: { ...this.config.ene },
            },
            rsi: {
                series: this.cachedRsiSeries,
                enabledPeriods: Object.keys(this.cachedRsiSeries).map(Number),
                params: { ...this.config.rsi },
            },
            cci: {
                series: this.cachedCciSeries,
                params: { ...this.config.cci },
            },
            stoch: {
                series: this.cachedStochSeries,
                params: { ...this.config.stoch },
            },
            mom: {
                series: this.cachedMomSeries,
                params: { ...this.config.mom },
            },
            wmsr: {
                series: this.cachedWmsrSeries,
                params: { ...this.config.wmsr },
            },
            kst: {
                series: this.cachedKstSeries,
                params: { ...this.config.kst },
            },
            fastk: {
                series: this.cachedFastkSeries,
                params: { ...this.config.fastk },
            },
            macd: {
                series: this.cachedMacdSeries,
                params: { ...this.config.macd },
            },
            atr: {
                series: this.cachedAtrSeries,
                params: { ...this.config.atr },
            },
            wma: {
                series: this.cachedWmaSeries,
                params: { ...this.config.wma },
            },
            dema: {
                series: this.cachedDemaSeries,
                params: { ...this.config.dema },
            },
            tema: {
                series: this.cachedTemaSeries,
                params: { ...this.config.tema },
            },
            hma: {
                series: this.cachedHmaSeries,
                params: { ...this.config.hma },
            },
            kama: {
                series: this.cachedKamaSeries,
                params: { ...this.config.kama },
            },
            sar: {
                series: this.cachedSarSeries,
                params: { ...this.config.sar },
            },
            supertrend: {
                series: this.cachedSupertrendSeries,
                params: { ...this.config.supertrend },
            },
            keltner: {
                series: this.cachedKeltnerSeries,
                params: { ...this.config.keltner },
            },
            donchian: {
                series: this.cachedDonchianSeries,
                params: { ...this.config.donchian },
            },
            ichimoku: {
                series: this.cachedIchimokuSeries,
                params: { ...this.config.ichimoku },
            },
            roc: {
                series: this.cachedRocSeries,
                params: { ...this.config.roc },
            },
            trix: {
                series: this.cachedTrixSeries,
                signalSeries: this.cachedTrixSignalSeries,
                params: { ...this.config.trix },
            },
            _changed: changed,
        }
    }

    /**
     * 获取缓存的 series（用于 visibleRange 变更时扫描极值）
     */
    getCachedSeries(): IndicatorSeriesBundle {
        return {
            _changed: [],
            ma: {
                series: this.cachedSeries,
                enabledPeriods: Object.keys(this.cachedSeries).map(Number),
            },
            boll: {
                series: this.cachedBollSeries,
                params: { ...this.config.boll },
            },
            expma: {
                series: this.cachedExpmaSeries,
                params: { ...this.config.expma },
            },
            ene: {
                series: this.cachedEneSeries,
                params: { ...this.config.ene },
            },
            rsi: {
                series: this.cachedRsiSeries,
                enabledPeriods: Object.keys(this.cachedRsiSeries).map(Number),
                params: { ...this.config.rsi },
            },
            cci: {
                series: this.cachedCciSeries,
                params: { ...this.config.cci },
            },
            stoch: {
                series: this.cachedStochSeries,
                params: { ...this.config.stoch },
            },
            mom: {
                series: this.cachedMomSeries,
                params: { ...this.config.mom },
            },
            wmsr: {
                series: this.cachedWmsrSeries,
                params: { ...this.config.wmsr },
            },
            kst: {
                series: this.cachedKstSeries,
                params: { ...this.config.kst },
            },
            fastk: {
                series: this.cachedFastkSeries,
                params: { ...this.config.fastk },
            },
            macd: {
                series: this.cachedMacdSeries,
                params: { ...this.config.macd },
            },
            atr: {
                series: this.cachedAtrSeries,
                params: { ...this.config.atr },
            },
            wma: {
                series: this.cachedWmaSeries,
                params: { ...this.config.wma },
            },
            dema: {
                series: this.cachedDemaSeries,
                params: { ...this.config.dema },
            },
            tema: {
                series: this.cachedTemaSeries,
                params: { ...this.config.tema },
            },
            hma: {
                series: this.cachedHmaSeries,
                params: { ...this.config.hma },
            },
            kama: {
                series: this.cachedKamaSeries,
                params: { ...this.config.kama },
            },
            sar: {
                series: this.cachedSarSeries,
                params: { ...this.config.sar },
            },
            supertrend: {
                series: this.cachedSupertrendSeries,
                params: { ...this.config.supertrend },
            },
            keltner: {
                series: this.cachedKeltnerSeries,
                params: { ...this.config.keltner },
            },
            donchian: {
                series: this.cachedDonchianSeries,
                params: { ...this.config.donchian },
            },
            ichimoku: {
                series: this.cachedIchimokuSeries,
                params: { ...this.config.ichimoku },
            },
            roc: {
                series: this.cachedRocSeries,
                params: { ...this.config.roc },
            },
            trix: {
                series: this.cachedTrixSeries,
                signalSeries: this.cachedTrixSignalSeries,
                params: { ...this.config.trix },
            },
        }
    }
}
