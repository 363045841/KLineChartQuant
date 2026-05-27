/**
 * State Composer
 * 把 Worker/Runtime 返回的 series bundle 组装成与现有兼容的 render states
 */

import type {
    MARenderState,
} from './maState'
import type {
    BOLLRenderState,
} from './bollState'
import type {
    EXPMARenderState,
} from './expmaState'
import type {
    ENERenderState,
} from './eneState'
import type {
    RSIRenderState,
} from './rsiState'
import { EMPTY_RSI_STATE } from './rsiState'
import type {
    CCIRenderState,
} from './cciState'
import { EMPTY_CCI_STATE } from './cciState'
import type {
    STOCHRenderState,
} from './stochState'
import { EMPTY_STOCH_STATE } from './stochState'
import type {
    MOMRenderState,
} from './momState'
import { EMPTY_MOM_STATE } from './momState'
import type {
    WMSRRenderState,
} from './wmsrState'
import { EMPTY_WMSR_STATE } from './wmsrState'
import type {
    KSTRenderState,
} from './kstState'
import { EMPTY_KST_STATE } from './kstState'
import type {
    FASTKRenderState,
} from './fastkState'
import { EMPTY_FASTK_STATE } from './fastkState'
import type {
    MACDRenderState,
} from './macdState'
import { EMPTY_MACD_STATE } from './macdState'
import type {
    ATRRenderState,
} from './atrState'
import { EMPTY_ATR_STATE } from './atrState'
import type { WMARenderState } from './wmaState'
import { EMPTY_WMA_STATE } from './wmaState'
import type { DEMARenderState } from './demaState'
import { EMPTY_DEMA_STATE } from './demaState'
import type { TEMARenderState } from './temaState'
import { EMPTY_TEMA_STATE } from './temaState'
import type { HMARenderState } from './hmaState'
import { EMPTY_HMA_STATE } from './hmaState'
import type { IndicatorSeriesBundle } from './workerProtocol'

/**
 * 可见范围
 */
interface VisibleRange {
    start: number
    end: number
}

type VisibleSubIndicatorStates = {
    rsi: RSIRenderState
    cci: CCIRenderState
    stoch: STOCHRenderState
    mom: MOMRenderState
    wmsr: WMSRRenderState
    kst: KSTRenderState
    fastk: FASTKRenderState
    macd: MACDRenderState
    atr: ATRRenderState
    wma: WMARenderState
    dema: DEMARenderState
    tema: TEMARenderState
    hma: HMARenderState
}

type VisibleSubIndicatorMask = {
    rsi?: boolean
    cci?: boolean
    stoch?: boolean
    mom?: boolean
    wmsr?: boolean
    kst?: boolean
    fastk?: boolean
    macd?: boolean
    atr?: boolean
    wma?: boolean
    dema?: boolean
    tema?: boolean
    hma?: boolean
}

type ComposedRenderStates = VisibleSubIndicatorStates & {
    ma: MARenderState
    boll: BOLLRenderState
    expma: EXPMARenderState
    ene: ENERenderState
}

function getLatestMACDPoint(bundle: IndicatorSeriesBundle, visibleRange: VisibleRange) {
    const latestIndex = visibleRange.end - 1
    return latestIndex >= 0 && latestIndex < bundle.macd.series.length
        ? bundle.macd.series[latestIndex]
        : null
}

function mergeEmptyState<T extends { timestamp: number }>(state: T, timestamp: number, overrides: Partial<T>): T {
    return {
        ...state,
        ...overrides,
        timestamp,
    }
}

/**
 * 仅计算副图指标的 visible-only states
 * 用于滚动时的轻量更新，避免重复计算主图指标
 */
export function composeVisibleSubIndicatorStates(
    bundle: IndicatorSeriesBundle,
    visibleRange: VisibleRange,
    timestamp: number,
    activeMask: VisibleSubIndicatorMask = {}
): VisibleSubIndicatorStates {
    const rsiActive = activeMask.rsi ?? true
    const cciActive = activeMask.cci ?? true
    const stochActive = activeMask.stoch ?? true
    const momActive = activeMask.mom ?? true
    const wmsrActive = activeMask.wmsr ?? true
    const kstActive = activeMask.kst ?? true
    const fastkActive = activeMask.fastk ?? true
    const macdActive = activeMask.macd ?? true
    const atrActive = activeMask.atr ?? true
    const wmaActive = activeMask.wma ?? true
    const demaActive = activeMask.dema ?? true
    const temaActive = activeMask.tema ?? true
    const hmaActive = activeMask.hma ?? true

    const rsiExtremes = rsiActive ? calcRSIExtremes(bundle.rsi.series, visibleRange) : null
    const cciExtremes = cciActive ? calcCCIExtremes(bundle.cci.series, visibleRange) : null
    const stochExtremes = stochActive ? calcSTOCHExtremes(bundle.stoch.series, visibleRange) : null
    const momExtremes = momActive ? calcMOMExtremes(bundle.mom.series, visibleRange) : null
    const wmsrExtremes = wmsrActive ? calcWMSRExtremes(bundle.wmsr.series, visibleRange) : null
    const kstExtremes = kstActive ? calcKSTExtremes(bundle.kst.series, visibleRange) : null
    const fastkExtremes = fastkActive ? calcFASTKExtremes(bundle.fastk.series, visibleRange) : null
    const macdExtremes = macdActive ? calcMACDExtremes(bundle.macd.series, visibleRange) : null
    const atrExtremes = atrActive ? calcATRExtremes(bundle.atr.series, visibleRange) : null
    const wmaExtremes = wmaActive ? calcSparseExtremes(bundle.wma.series, visibleRange) : null
    const demaExtremes = demaActive ? calcSparseExtremes(bundle.dema.series, visibleRange) : null
    const temaExtremes = temaActive ? calcSparseExtremes(bundle.tema.series, visibleRange) : null
    const hmaExtremes = hmaActive ? calcSparseExtremes(bundle.hma.series, visibleRange) : null
    const latestPoint = macdActive ? getLatestMACDPoint(bundle, visibleRange) : null

    const macdPadding = macdExtremes ? Math.max(Math.abs(macdExtremes.max), Math.abs(macdExtremes.min)) * 0.1 : 0
    const macdValueMin = macdExtremes && Number.isFinite(macdExtremes.min) ? macdExtremes.min - macdPadding : EMPTY_MACD_STATE.valueMin
    const macdValueMax = macdExtremes && Number.isFinite(macdExtremes.max) ? macdExtremes.max + macdPadding : EMPTY_MACD_STATE.valueMax

    const cciValueMin = cciExtremes ? Math.min(cciExtremes.min, -150) : EMPTY_CCI_STATE.valueMin
    const cciValueMax = cciExtremes ? Math.max(cciExtremes.max, 150) : EMPTY_CCI_STATE.valueMax

    const momPadding = momExtremes ? Math.max(Math.abs(momExtremes.max), Math.abs(momExtremes.min)) * 0.1 : 0
    const momValueMin = momExtremes ? momExtremes.min - momPadding : EMPTY_MOM_STATE.valueMin
    const momValueMax = momExtremes ? momExtremes.max + momPadding : EMPTY_MOM_STATE.valueMax

    const kstRange = kstExtremes ? kstExtremes.max - kstExtremes.min : 0
    const kstPadding = kstRange * 0.1
    const kstValueMin = kstExtremes ? kstExtremes.min - kstPadding : EMPTY_KST_STATE.valueMin
    const kstValueMax = kstExtremes ? kstExtremes.max + kstPadding : EMPTY_KST_STATE.valueMax

    const atrValueMax = atrExtremes && Number.isFinite(atrExtremes.max)
        ? atrExtremes.max * 1.1
        : EMPTY_ATR_STATE.valueMax

    const maFamilyBounds = (ext: { min: number; max: number } | null, empty: { valueMin: number; valueMax: number }) => {
        if (!ext || !Number.isFinite(ext.min) || !Number.isFinite(ext.max)) {
            return { valueMin: empty.valueMin, valueMax: empty.valueMax }
        }
        const range = ext.max - ext.min
        const padding = range > 0 ? range * 0.05 : Math.max(1, Math.abs(ext.max) * 0.05)
        return { valueMin: ext.min - padding, valueMax: ext.max + padding }
    }

    const wmaBounds = maFamilyBounds(wmaExtremes, EMPTY_WMA_STATE)
    const demaBounds = maFamilyBounds(demaExtremes, EMPTY_DEMA_STATE)
    const temaBounds = maFamilyBounds(temaExtremes, EMPTY_TEMA_STATE)
    const hmaBounds = maFamilyBounds(hmaExtremes, EMPTY_HMA_STATE)

    return {
        rsi: rsiActive ? {
            timestamp,
            series: bundle.rsi.series,
            enabledPeriods: bundle.rsi.enabledPeriods,
            params: bundle.rsi.params,
            valueMin: 0,
            valueMax: 100,
            visibleMin: rsiExtremes!.min,
            visibleMax: rsiExtremes!.max,
        } : mergeEmptyState(EMPTY_RSI_STATE, timestamp, {
            series: bundle.rsi.series,
            enabledPeriods: bundle.rsi.enabledPeriods,
            params: bundle.rsi.params,
        }),
        cci: cciActive ? {
            timestamp,
            series: bundle.cci.series,
            params: bundle.cci.params,
            valueMin: cciValueMin,
            valueMax: cciValueMax,
            visibleMin: cciExtremes!.min,
            visibleMax: cciExtremes!.max,
        } : mergeEmptyState(EMPTY_CCI_STATE, timestamp, {
            series: bundle.cci.series,
            params: bundle.cci.params,
        }),
        stoch: stochActive ? {
            timestamp,
            series: bundle.stoch.series,
            params: bundle.stoch.params,
            valueMin: 0,
            valueMax: 100,
            visibleMin: stochExtremes!.min,
            visibleMax: stochExtremes!.max,
        } : mergeEmptyState(EMPTY_STOCH_STATE, timestamp, {
            series: bundle.stoch.series,
            params: bundle.stoch.params,
        }),
        mom: momActive ? {
            timestamp,
            series: bundle.mom.series,
            params: bundle.mom.params,
            valueMin: momValueMin,
            valueMax: momValueMax,
            visibleMin: momExtremes!.min,
            visibleMax: momExtremes!.max,
        } : mergeEmptyState(EMPTY_MOM_STATE, timestamp, {
            series: bundle.mom.series,
            params: bundle.mom.params,
        }),
        wmsr: wmsrActive ? {
            timestamp,
            series: bundle.wmsr.series,
            params: bundle.wmsr.params,
            valueMin: -100,
            valueMax: 0,
            visibleMin: wmsrExtremes!.min,
            visibleMax: wmsrExtremes!.max,
        } : mergeEmptyState(EMPTY_WMSR_STATE, timestamp, {
            series: bundle.wmsr.series,
            params: bundle.wmsr.params,
        }),
        kst: kstActive ? {
            timestamp,
            series: bundle.kst.series,
            params: bundle.kst.params,
            valueMin: kstValueMin,
            valueMax: kstValueMax,
            visibleMin: kstExtremes!.min,
            visibleMax: kstExtremes!.max,
        } : mergeEmptyState(EMPTY_KST_STATE, timestamp, {
            series: bundle.kst.series,
            params: bundle.kst.params,
        }),
        fastk: fastkActive ? {
            timestamp,
            series: bundle.fastk.series,
            params: bundle.fastk.params,
            valueMin: 0,
            valueMax: 100,
            visibleMin: fastkExtremes!.min,
            visibleMax: fastkExtremes!.max,
        } : mergeEmptyState(EMPTY_FASTK_STATE, timestamp, {
            series: bundle.fastk.series,
            params: bundle.fastk.params,
        }),
        macd: macdActive ? {
            timestamp,
            series: bundle.macd.series,
            params: bundle.macd.params,
            valueMin: macdValueMin,
            valueMax: macdValueMax,
            visibleMin: macdExtremes!.min,
            visibleMax: macdExtremes!.max,
            latestValues: latestPoint ? {
                dif: latestPoint.dif,
                dea: latestPoint.dea,
                macd: latestPoint.macd,
            } : undefined,
        } : mergeEmptyState(EMPTY_MACD_STATE, timestamp, {
            series: bundle.macd.series,
            params: bundle.macd.params,
        }),
        atr: atrActive ? {
            timestamp,
            series: bundle.atr.series,
            params: bundle.atr.params,
            valueMin: 0,
            valueMax: atrValueMax,
            visibleMin: atrExtremes!.min,
            visibleMax: atrExtremes!.max,
        } : mergeEmptyState(EMPTY_ATR_STATE, timestamp, {
            series: bundle.atr.series,
            params: bundle.atr.params,
        }),
        wma: wmaActive ? {
            timestamp,
            series: bundle.wma.series,
            params: bundle.wma.params,
            valueMin: wmaBounds.valueMin,
            valueMax: wmaBounds.valueMax,
            visibleMin: wmaExtremes!.min,
            visibleMax: wmaExtremes!.max,
        } : mergeEmptyState(EMPTY_WMA_STATE, timestamp, {
            series: bundle.wma.series,
            params: bundle.wma.params,
        }),
        dema: demaActive ? {
            timestamp,
            series: bundle.dema.series,
            params: bundle.dema.params,
            valueMin: demaBounds.valueMin,
            valueMax: demaBounds.valueMax,
            visibleMin: demaExtremes!.min,
            visibleMax: demaExtremes!.max,
        } : mergeEmptyState(EMPTY_DEMA_STATE, timestamp, {
            series: bundle.dema.series,
            params: bundle.dema.params,
        }),
        tema: temaActive ? {
            timestamp,
            series: bundle.tema.series,
            params: bundle.tema.params,
            valueMin: temaBounds.valueMin,
            valueMax: temaBounds.valueMax,
            visibleMin: temaExtremes!.min,
            visibleMax: temaExtremes!.max,
        } : mergeEmptyState(EMPTY_TEMA_STATE, timestamp, {
            series: bundle.tema.series,
            params: bundle.tema.params,
        }),
        hma: hmaActive ? {
            timestamp,
            series: bundle.hma.series,
            params: bundle.hma.params,
            valueMin: hmaBounds.valueMin,
            valueMax: hmaBounds.valueMax,
            visibleMin: hmaExtremes!.min,
            visibleMax: hmaExtremes!.max,
        } : mergeEmptyState(EMPTY_HMA_STATE, timestamp, {
            series: bundle.hma.series,
            params: bundle.hma.params,
        }),
    }
}

/**
 * 从 series bundle 组装所有 render states
 * 同时计算 visibleMin/visibleMax 等派生字段
 */
export function composeRenderStates(
    bundle: IndicatorSeriesBundle,
    visibleRange: VisibleRange,
    timestamp: number
): ComposedRenderStates {
    const maExtremes = calcMAExtremes(bundle.ma.series, visibleRange)
    const bollExtremes = calcBOLLExtremes(bundle.boll.series, visibleRange)
    const expmaExtremes = calcEXPMAExtremes(bundle.expma.series, visibleRange)
    const eneExtremes = calcENEExtremes(bundle.ene.series, visibleRange)
    const subStates = composeVisibleSubIndicatorStates(bundle, visibleRange, timestamp)

    return {
        ma: {
            timestamp,
            series: bundle.ma.series,
            enabledPeriods: bundle.ma.enabledPeriods,
            visibleMin: maExtremes.min,
            visibleMax: maExtremes.max,
        },
        boll: {
            timestamp,
            series: bundle.boll.series,
            params: bundle.boll.params,
            visibleMin: bollExtremes.min,
            visibleMax: bollExtremes.max,
        },
        expma: {
            timestamp,
            series: bundle.expma.series,
            params: bundle.expma.params,
            visibleMin: expmaExtremes.min,
            visibleMax: expmaExtremes.max,
        },
        ene: {
            timestamp,
            series: bundle.ene.series,
            params: bundle.ene.params,
            visibleMin: eneExtremes.min,
            visibleMax: eneExtremes.max,
        },
        ...subStates,
    }
}

// ============================================================================
// 极值计算辅助函数
// ============================================================================

function calcMAExtremes(series: Record<number, (number | undefined)[]>, range: VisibleRange): { min: number; max: number } {
    const seriesList = Object.values(series)
    if (seriesList.length === 0 || range.start >= seriesList[0]!.length) {
        return { min: Infinity, max: -Infinity }
    }
    let min = Infinity
    let max = -Infinity
    for (const values of seriesList) {
        const end = Math.min(range.end, values.length)
        for (let i = range.start; i < end; i++) {
            const v = values[i]
            if (v !== undefined) {
                min = Math.min(min, v)
                max = Math.max(max, v)
            }
        }
    }
    return { min, max }
}

interface BOLLPoint { upper: number; middle: number; lower: number }
function calcBOLLExtremes(series: BOLLPoint[], range: VisibleRange): { min: number; max: number } {
    if (series.length === 0 || range.start >= series.length) {
        return { min: Infinity, max: -Infinity }
    }
    let min = Infinity
    let max = -Infinity
    const end = Math.min(range.end, series.length)
    for (let i = range.start; i < end; i++) {
        const p = series[i]
        if (p) {
            min = Math.min(min, p.upper, p.middle, p.lower)
            max = Math.max(max, p.upper, p.middle, p.lower)
        }
    }
    return { min, max }
}

interface EXPMAPoint { fast: number; slow: number }
function calcEXPMAExtremes(series: EXPMAPoint[], range: VisibleRange): { min: number; max: number } {
    if (series.length === 0 || range.start >= series.length) {
        return { min: Infinity, max: -Infinity }
    }
    let min = Infinity
    let max = -Infinity
    const end = Math.min(range.end, series.length)
    for (let i = range.start; i < end; i++) {
        const p = series[i]
        if (p) {
            min = Math.min(min, p.fast, p.slow)
            max = Math.max(max, p.fast, p.slow)
        }
    }
    return { min, max }
}

interface ENEPoint { upper: number; middle: number; lower: number }
function calcENEExtremes(series: ENEPoint[], range: VisibleRange): { min: number; max: number } {
    if (series.length === 0 || range.start >= series.length) {
        return { min: Infinity, max: -Infinity }
    }
    let min = Infinity
    let max = -Infinity
    const end = Math.min(range.end, series.length)
    for (let i = range.start; i < end; i++) {
        const p = series[i]
        if (p) {
            min = Math.min(min, p.upper, p.middle, p.lower)
            max = Math.max(max, p.upper, p.middle, p.lower)
        }
    }
    return { min, max }
}

function calcRSIExtremes(series: Record<number, (number | undefined)[]>, range: VisibleRange): { min: number; max: number } {
    const seriesList = Object.values(series)
    if (seriesList.length === 0 || range.start >= seriesList[0]!.length) {
        return { min: Infinity, max: -Infinity }
    }
    let min = Infinity
    let max = -Infinity
    for (const values of seriesList) {
        const end = Math.min(range.end, values.length)
        for (let i = range.start; i < end; i++) {
            const v = values[i]
            if (v !== undefined) {
                min = Math.min(min, v)
                max = Math.max(max, v)
            }
        }
    }
    return { min, max }
}

function calcCCIExtremes(series: (number | undefined)[], range: VisibleRange): { min: number; max: number } {
    if (series.length === 0 || range.start >= series.length) {
        return { min: Infinity, max: -Infinity }
    }
    let min = Infinity
    let max = -Infinity
    const end = Math.min(range.end, series.length)
    for (let i = range.start; i < end; i++) {
        const v = series[i]
        if (v !== undefined) {
            min = Math.min(min, v)
            max = Math.max(max, v)
        }
    }
    return { min, max }
}

interface STOCHPoint { k: number; d: number }
function calcSTOCHExtremes(series: STOCHPoint[], range: VisibleRange): { min: number; max: number } {
    if (series.length === 0 || range.start >= series.length) {
        return { min: Infinity, max: -Infinity }
    }
    let min = Infinity
    let max = -Infinity
    const end = Math.min(range.end, series.length)
    for (let i = range.start; i < end; i++) {
        const p = series[i]
        if (p) {
            min = Math.min(min, p.k, p.d)
            max = Math.max(max, p.k, p.d)
        }
    }
    return { min, max }
}

function calcMOMExtremes(series: (number | undefined)[], range: VisibleRange): { min: number; max: number } {
    if (series.length === 0 || range.start >= series.length) {
        return { min: Infinity, max: -Infinity }
    }
    let min = Infinity
    let max = -Infinity
    const end = Math.min(range.end, series.length)
    for (let i = range.start; i < end; i++) {
        const v = series[i]
        if (v !== undefined) {
            min = Math.min(min, v)
            max = Math.max(max, v)
        }
    }
    return { min, max }
}

function calcWMSRExtremes(series: (number | undefined)[], range: VisibleRange): { min: number; max: number } {
    if (series.length === 0 || range.start >= series.length) {
        return { min: Infinity, max: -Infinity }
    }
    let min = Infinity
    let max = -Infinity
    const end = Math.min(range.end, series.length)
    for (let i = range.start; i < end; i++) {
        const v = series[i]
        if (v !== undefined) {
            min = Math.min(min, v)
            max = Math.max(max, v)
        }
    }
    return { min, max }
}

interface KSTPoint { kst: number; signal: number }
function calcKSTExtremes(series: KSTPoint[], range: VisibleRange): { min: number; max: number } {
    // 快速检查：空数据直接返回
    if (series.length === 0 || range.start >= series.length) {
        return { min: Infinity, max: -Infinity }
    }
    let min = Infinity
    let max = -Infinity
    const end = Math.min(range.end, series.length)
    for (let i = range.start; i < end; i++) {
        const p = series[i]
        if (p) {
            min = Math.min(min, p.kst, p.signal)
            max = Math.max(max, p.kst, p.signal)
        }
    }
    return { min, max }
}

function calcFASTKExtremes(series: (number | undefined)[], range: VisibleRange): { min: number; max: number } {
    if (series.length === 0 || range.start >= series.length) {
        return { min: Infinity, max: -Infinity }
    }
    let min = Infinity
    let max = -Infinity
    const end = Math.min(range.end, series.length)
    for (let i = range.start; i < end; i++) {
        const v = series[i]
        if (v !== undefined) {
            min = Math.min(min, v)
            max = Math.max(max, v)
        }
    }
    return { min, max }
}

interface MACDPoint { dif: number; dea: number; macd: number }
function calcMACDExtremes(series: MACDPoint[], range: VisibleRange): { min: number; max: number } {
    if (series.length === 0 || range.start >= series.length) {
        return { min: Infinity, max: -Infinity }
    }
    let min = Infinity
    let max = -Infinity
    const end = Math.min(range.end, series.length)
    for (let i = range.start; i < end; i++) {
        const p = series[i]
        if (p) {
            min = Math.min(min, p.dif, p.dea, p.macd)
            max = Math.max(max, p.dif, p.dea, p.macd)
        }
    }
    return { min, max }
}

function calcATRExtremes(series: (number | undefined)[], range: VisibleRange): { min: number; max: number } {
    return calcSparseExtremes(series, range)
}

function calcSparseExtremes(series: (number | undefined)[], range: VisibleRange): { min: number; max: number } {
    if (series.length === 0 || range.start >= series.length) {
        return { min: Infinity, max: -Infinity }
    }
    let min = Infinity
    let max = -Infinity
    const end = Math.min(range.end, series.length)
    for (let i = range.start; i < end; i++) {
        const v = series[i]
        if (v !== undefined) {
            min = Math.min(min, v)
            max = Math.max(max, v)
        }
    }
    return { min, max }
}

/**
 * 计算主图指标价格范围
 * 用于 Chart.draw() 中的 pane.updateRange
 */
export function computeMainIndicatorPriceRange(
    bundle: IndicatorSeriesBundle,
    visibleRange: VisibleRange,
    activeMainIndicators: Set<string>
): { min: number; max: number } | null {
    let min = Infinity
    let max = -Infinity
    const { start, end } = visibleRange

    // MA
    if (activeMainIndicators.has('ma') && Object.keys(bundle.ma.series).length > 0) {
        for (const values of Object.values(bundle.ma.series)) {
            for (let i = start; i < end && i < values.length; i++) {
                const v = values[i]
                if (v !== undefined) {
                    min = Math.min(min, v)
                    max = Math.max(max, v)
                }
            }
        }
    }

    // BOLL
    if (activeMainIndicators.has('boll') && bundle.boll.series.length > 0) {
        for (let i = start; i < end && i < bundle.boll.series.length; i++) {
            const p = bundle.boll.series[i]
            if (p) {
                min = Math.min(min, p.upper, p.middle, p.lower)
                max = Math.max(max, p.upper, p.middle, p.lower)
            }
        }
    }

    // EXPMA
    if (activeMainIndicators.has('expma') && bundle.expma.series.length > 0) {
        for (let i = start; i < end && i < bundle.expma.series.length; i++) {
            const p = bundle.expma.series[i]
            if (p) {
                min = Math.min(min, p.fast, p.slow)
                max = Math.max(max, p.fast, p.slow)
            }
        }
    }

    // ENE
    if (activeMainIndicators.has('ene') && bundle.ene.series.length > 0) {
        for (let i = start; i < end && i < bundle.ene.series.length; i++) {
            const p = bundle.ene.series[i]
            if (p) {
                min = Math.min(min, p.upper, p.middle, p.lower)
                max = Math.max(max, p.upper, p.middle, p.lower)
            }
        }
    }

    if (!Number.isFinite(min) || !Number.isFinite(max)) {
        return null
    }

    return { min, max }
}
