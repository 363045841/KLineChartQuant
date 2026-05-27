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
    DEFAULT_MA_PERIODS,
    DEFAULT_ATR_PERIOD,
    type MAFlags,
    type BOLLPoint,
    type EXPMAPoint,
    type ENEPoint,
    type STOCHPoint,
    type KSTPoint,
    type MACDPoint,
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
        }
    }
}
