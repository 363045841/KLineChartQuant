import type { KLineData } from '@/types/price'

/**
 * MA 周期配置标志
 */
export type MAFlags = {
    ma5?: boolean
    ma10?: boolean
    ma20?: boolean
    ma30?: boolean
    ma60?: boolean
}

/**
 * 默认 MA 周期列表
 */
export const DEFAULT_MA_PERIODS = [5, 10, 20, 30, 60] as const

// ============================================================================
// BOLL 布林带
// ============================================================================

/**
 * BOLL 数据点
 */
export interface BOLLPoint {
    upper: number
    middle: number
    lower: number
}

/**
 * 默认 BOLL 参数
 */
export const DEFAULT_BOLL_PERIOD = 20
export const DEFAULT_BOLL_MULTIPLIER = 2

/**
 * 计算 BOLL 数据（使用滑动窗口优化）
 * @param data K线数据数组
 * @param period 周期（默认20）
 * @param multiplier 标准差倍数（默认2）
 * @returns 每个索引对应的BOLL值，前 period-1 个为 undefined
 */
export function calcBOLLData(
    data: KLineData[],
    period: number,
    multiplier: number
): BOLLPoint[] {
    const result: BOLLPoint[] = new Array(data.length)

    if (data.length < period) return result

    // 使用滑动窗口计算，避免重复求和
    let sum = 0
    const window: number[] = []

    // 初始化第一个窗口
    for (let i = 0; i < period; i++) {
        const item = data[i]
        if (!item) return result
        const close = item.close
        window.push(close)
        sum += close
    }

    // 计算每个点的 BOLL
    for (let i = period - 1; i < data.length; i++) {
        const item = data[i]
        if (!item) continue

        // 更新窗口求和
        if (i >= period) {
            const oldVal = window.shift()
            if (oldVal !== undefined) sum -= oldVal
            const close = item.close
            window.push(close)
            sum += close
        }

        const ma = sum / period

        // 计算标准差
        let variance = 0
        for (let j = 0; j < period; j++) {
            const wVal = window[j]
            if (wVal !== undefined) {
                variance += Math.pow(wVal - ma, 2)
            }
        }
        const stdDev = Math.sqrt(variance / period)

        result[i] = {
            upper: ma + multiplier * stdDev,
            middle: ma,
            lower: ma - multiplier * stdDev,
        }
    }

    return result
}

// ============================================================================
// EXPMA 指数平滑移动平均线
// ============================================================================

/**
 * EXPMA 数据点
 */
export interface EXPMAPoint {
    fast: number
    slow: number
}

/**
 * 默认 EXPMA 参数
 */
export const DEFAULT_EXPMA_FAST_PERIOD = 12
export const DEFAULT_EXPMA_SLOW_PERIOD = 50

/**
 * 计算 EXPMA 数据
 * 公式：EXPMA(i) = C(i) × K + EXPMA(i-1) × (1-K)，K = 2/(N+1)
 * @param data K线数据数组
 * @param fastPeriod 快线周期（默认12）
 * @param slowPeriod 慢线周期（默认50）
 * @returns 每个索引对应的EXPMA值（从 index 0 开始有值）
 */
export function calcEXPMAData(
    data: KLineData[],
    fastPeriod: number,
    slowPeriod: number
): EXPMAPoint[] {
    const result: EXPMAPoint[] = new Array(data.length)

    if (data.length === 0) return result

    const fastK = 2 / (fastPeriod + 1)
    const slowK = 2 / (slowPeriod + 1)

    // 第一个点的 EXPMA 等于第一天的收盘价
    const firstClose = data[0]!.close
    let fastEMA = firstClose
    let slowEMA = firstClose

    result[0] = { fast: fastEMA, slow: slowEMA }

    for (let i = 1; i < data.length; i++) {
        const close = data[i]!.close
        fastEMA = close * fastK + fastEMA * (1 - fastK)
        slowEMA = close * slowK + slowEMA * (1 - slowK)
        result[i] = { fast: fastEMA, slow: slowEMA }
    }

    return result
}

// ============================================================================
// ENE 轨道线
// ============================================================================

/**
 * ENE 数据点
 */
export interface ENEPoint {
    upper: number
    middle: number
    lower: number
}

/**
 * 默认 ENE 参数
 */
export const DEFAULT_ENE_PERIOD = 10
export const DEFAULT_ENE_DEVIATION = 11

/**
 * 计算 ENE 数据
 * 中轨 = MA(close, N)
 * 上轨 = 中轨 × (1 + M/100)
 * 下轨 = 中轨 × (1 - M/100)
 * @param data K线数据数组
 * @param period 周期（默认10）
 * @param deviation 偏离率百分比（默认11）
 * @returns 每个索引对应的ENE值，前 period-1 个为 undefined
 */
export function calcENEData(
    data: KLineData[],
    period: number,
    deviation: number
): ENEPoint[] {
    const result: ENEPoint[] = new Array(data.length)

    if (data.length < period) return result

    // 使用滑动窗口计算 MA
    let sum = 0

    // 初始化第一个窗口
    for (let i = 0; i < period; i++) {
        const item = data[i]
        if (!item) return result
        sum += item.close
    }

    // 第一个有效点
    const firstMA = sum / period
    const firstDeviation = deviation / 100
    result[period - 1] = {
        upper: firstMA * (1 + firstDeviation),
        middle: firstMA,
        lower: firstMA * (1 - firstDeviation),
    }

    // 滑动计算后续点
    for (let i = period; i < data.length; i++) {
        const prevItem = data[i - period]
        const currItem = data[i]
        if (!prevItem || !currItem) continue

        sum = sum - prevItem.close + currItem.close
        const ma = sum / period
        const dev = deviation / 100

        result[i] = {
            upper: ma * (1 + dev),
            middle: ma,
            lower: ma * (1 - dev),
        }
    }

    return result
}

/**
 * 计算指定周期的 MA 数据（使用滑动窗口优化，O(n) 复杂度）
 * @param data K线数据数组
 * @param period MA周期
 * @returns 每个索引对应的MA值，前 period-1 个为 undefined
 */
export function calcMAData(data: KLineData[], period: number): (number | undefined)[] {
    const result: (number | undefined)[] = new Array(data.length)

    if (data.length < period) return result

    // 滑动窗口求和
    let sum = 0

    // 初始化第一个窗口
    for (let i = 0; i < period; i++) {
        const item = data[i]
        if (!item) return result
        sum += item.close
    }

    // 第一个有效点
    result[period - 1] = sum / period

    // 滑动计算后续点
    for (let i = period; i < data.length; i++) {
        const prevItem = data[i - period]
        const currItem = data[i]
        if (!prevItem || !currItem) continue

        sum = sum - prevItem.close + currItem.close
        result[i] = sum / period
    }

    return result
}

// ============================================================================
// RSI 相对强弱指标
// ============================================================================

/**
 * 默认 RSI 参数
 */
export const DEFAULT_RSI_PERIOD1 = 6
export const DEFAULT_RSI_PERIOD2 = 12
export const DEFAULT_RSI_PERIOD3 = 24
export const DEFAULT_RSI_PERIODS = [6, 12, 24] as const

/**
 * 计算 RSI 数据
 * RSI = 100 - 100 / (1 + RS)
 * RS = 平均上涨幅度 / 平均下跌幅度
 * @param data K线数据数组
 * @param period RSI周期
 * @returns 每个索引对应的RSI值，前 period+1 个为 undefined（需要 period+1 个数据点计算初始平均）
 */
export function calcRSIData(data: KLineData[], period: number): (number | undefined)[] {
    const result: (number | undefined)[] = new Array(data.length)

    if (data.length < period + 1) return result

    // 计算价格变化
    const changes: number[] = []
    for (let i = 1; i < data.length; i++) {
        changes.push(data[i]!.close - data[i - 1]!.close)
    }

    // 初始化：计算前 period 天的平均涨跌
    let sumGain = 0
    let sumLoss = 0

    for (let i = 0; i < period; i++) {
        const change = changes[i]
        if (change !== undefined) {
            if (change > 0) sumGain += change
            else sumLoss += Math.abs(change)
        }
    }

    // 第一个 RSI 值
    let avgGain = sumGain / period
    let avgLoss = sumLoss / period

    if (avgLoss === 0) {
        result[period] = 100
    } else {
        const rs = avgGain / avgLoss
        result[period] = 100 - 100 / (1 + rs)
    }

    // 后续使用平滑计算（Wilder's smoothing）
    for (let i = period; i < changes.length; i++) {
        const change = changes[i]
        if (change === undefined) continue

        if (change > 0) {
            avgGain = (avgGain * (period - 1) + change) / period
            avgLoss = (avgLoss * (period - 1)) / period
        } else {
            avgGain = (avgGain * (period - 1)) / period
            avgLoss = (avgLoss * (period - 1) + Math.abs(change)) / period
        }

        if (avgLoss === 0) {
            result[i + 1] = 100
        } else {
            const rs = avgGain / avgLoss
            result[i + 1] = 100 - 100 / (1 + rs)
        }
    }

    return result
}

// ============================================================================
// CCI 顺势指标
// ============================================================================

export const DEFAULT_CCI_PERIOD = 14

export function calcCCIData(data: KLineData[], period: number): (number | undefined)[] {
    const result: (number | undefined)[] = new Array(data.length)

    if (data.length < period) return result

    // 计算 TP (Typical Price) = (H + L + C) / 3
    const tpValues: number[] = []
    for (const item of data) {
        tpValues.push((item.high + item.low + item.close) / 3)
    }

    // 计算 TP 的 SMA
    let sum = 0
    for (let i = 0; i < period; i++) {
        sum += tpValues[i]!
    }

    for (let i = period - 1; i < data.length; i++) {
        if (i >= period) {
            sum = sum - tpValues[i - period]! + tpValues[i]!
        }
        const sma = sum / period

        // 计算平均绝对偏差
        let meanDeviation = 0
        for (let j = 0; j < period; j++) {
            meanDeviation += Math.abs(tpValues[i - j]! - sma)
        }
        meanDeviation /= period

        if (meanDeviation === 0) {
            result[i] = 0
        } else {
            result[i] = (tpValues[i]! - sma) / (0.015 * meanDeviation)
        }
    }

    return result
}

// ============================================================================
// STOCH 随机指标
// ============================================================================

export const DEFAULT_STOCH_N = 9
export const DEFAULT_STOCH_M = 3

export interface STOCHPoint {
    k: number
    d: number
}

export function calcSTOCHData(data: KLineData[], n: number, m: number): STOCHPoint[] {
    const result: STOCHPoint[] = new Array(data.length)

    if (data.length < n) return result

    // 计算 RSV 和 K
    const kValues: (number | undefined)[] = new Array(data.length)

    for (let i = n - 1; i < data.length; i++) {
        let highest = -Infinity
        let lowest = Infinity

        for (let j = 0; j < n; j++) {
            const item = data[i - j]
            if (!item) continue
            highest = Math.max(highest, item.high)
            lowest = Math.min(lowest, item.low)
        }

        const close = data[i]!.close
        if (highest === lowest) {
            kValues[i] = 50
        } else {
            kValues[i] = ((close - lowest) / (highest - lowest)) * 100
        }
    }

    // 计算 D (K 的 M 日移动平均)
    for (let i = n - 1 + m - 1; i < data.length; i++) {
        const k = kValues[i]
        if (k === undefined) continue

        let sum = 0
        let validCount = 0
        for (let j = 0; j < m; j++) {
            const kv = kValues[i - j]
            if (kv !== undefined) {
                sum += kv
                validCount++
            }
        }

        if (validCount === m) {
            result[i] = { k, d: sum / m }
        }
    }

    return result
}

// ============================================================================
// MOM 动量指标
// ============================================================================

export const DEFAULT_MOM_PERIOD = 10

export function calcMOMData(data: KLineData[], period: number): (number | undefined)[] {
    const result: (number | undefined)[] = new Array(data.length)

    if (data.length < period + 1) return result

    for (let i = period; i < data.length; i++) {
        const currentClose = data[i]?.close
        const prevClose = data[i - period]?.close

        if (currentClose !== undefined && prevClose !== undefined) {
            result[i] = currentClose - prevClose
        }
    }

    return result
}

// ============================================================================
// WMSR 威廉指标
// ============================================================================

export const DEFAULT_WMSR_PERIOD = 14

export function calcWMSRData(data: KLineData[], period: number): (number | undefined)[] {
    const result: (number | undefined)[] = new Array(data.length)

    if (data.length < period) return result

    for (let i = period - 1; i < data.length; i++) {
        let highest = -Infinity
        let lowest = Infinity

        for (let j = 0; j < period; j++) {
            const item = data[i - j]
            if (!item) continue
            highest = Math.max(highest, item.high)
            lowest = Math.min(lowest, item.low)
        }

        const close = data[i]!.close
        if (highest === lowest) {
            result[i] = -50
        } else {
            result[i] = ((highest - close) / (highest - lowest)) * -100
        }
    }

    return result
}

// ============================================================================
// KST 确知指标
// ============================================================================

export const DEFAULT_KST_ROC1 = 10
export const DEFAULT_KST_ROC2 = 15
export const DEFAULT_KST_ROC3 = 20
export const DEFAULT_KST_ROC4 = 30
export const DEFAULT_KST_SIGNAL = 9

export interface KSTPoint {
    kst: number
    signal: number
}

function calcROCInternal(data: KLineData[], period: number): (number | undefined)[] {
    const result: (number | undefined)[] = new Array(data.length)

    if (data.length < period + 1) return result

    for (let i = period; i < data.length; i++) {
        const currentClose = data[i]?.close
        const prevClose = data[i - period]?.close

        if (currentClose !== undefined && prevClose !== undefined && prevClose !== 0) {
            result[i] = ((currentClose - prevClose) / prevClose) * 100
        }
    }

    return result
}

function calcSMAInternal(data: (number | undefined)[], period: number): (number | undefined)[] {
    const result: (number | undefined)[] = new Array(data.length)

    let sum = 0
    let count = 0

    for (let i = 0; i < data.length; i++) {
        const val = data[i]

        if (val !== undefined) {
            sum += val
            count++

            if (count > period) {
                const oldVal = data[i - period]
                if (oldVal !== undefined) {
                    sum -= oldVal
                    count--
                }
            }

            if (count === period) {
                result[i] = sum / period
            }
        }
    }

    return result
}

export function calcKSTData(
    data: KLineData[],
    roc1: number,
    roc2: number,
    roc3: number,
    roc4: number,
    signalPeriod: number
): KSTPoint[] {
    const result: KSTPoint[] = new Array(data.length)

    const roc1Data = calcROCInternal(data, roc1)
    const roc2Data = calcROCInternal(data, roc2)
    const roc3Data = calcROCInternal(data, roc3)
    const roc4Data = calcROCInternal(data, roc4)

    const sma1 = calcSMAInternal(roc1Data, 10)
    const sma2 = calcSMAInternal(roc2Data, 10)
    const sma3 = calcSMAInternal(roc3Data, 10)
    const sma4 = calcSMAInternal(roc4Data, 15)

    const kstValues: (number | undefined)[] = new Array(data.length)

    for (let i = 0; i < data.length; i++) {
        const v1 = sma1[i]
        const v2 = sma2[i]
        const v3 = sma3[i]
        const v4 = sma4[i]

        if (v1 !== undefined && v2 !== undefined && v3 !== undefined && v4 !== undefined) {
            kstValues[i] = v1 * 1 + v2 * 2 + v3 * 3 + v4 * 4
        }
    }

    const signalData = calcSMAInternal(kstValues, signalPeriod)

    for (let i = 0; i < data.length; i++) {
        const kst = kstValues[i]
        const signal = signalData[i]

        if (kst !== undefined && signal !== undefined) {
            result[i] = { kst, signal }
        }
    }

    return result
}

// ============================================================================
// FASTK 快速随机指标
// ============================================================================

export const DEFAULT_FASTK_PERIOD = 9

export function calcFASTKData(data: KLineData[], period: number): (number | undefined)[] {
    const result: (number | undefined)[] = new Array(data.length)

    if (data.length < period) return result

    for (let i = period - 1; i < data.length; i++) {
        let highest = -Infinity
        let lowest = Infinity

        for (let j = 0; j < period; j++) {
            const item = data[i - j]
            if (!item) continue
            highest = Math.max(highest, item.high)
            lowest = Math.min(lowest, item.low)
        }

        const close = data[i]!.close
        if (highest === lowest) {
            result[i] = 50
        } else {
            result[i] = ((close - lowest) / (highest - lowest)) * 100
        }
    }

    return result
}

// ============================================================================
// MACD 指数平滑异同移动平均线
// ============================================================================

/**
 * MACD 数据点
 */
export interface MACDPoint {
    /** DIF 线值 */
    dif: number
    /** DEA 线值 */
    dea: number
    /** MACD 柱状图值 */
    macd: number
}

/**
 * 默认 MACD 参数
 */
export const DEFAULT_MACD_FAST_PERIOD = 12
export const DEFAULT_MACD_SLOW_PERIOD = 26
export const DEFAULT_MACD_SIGNAL_PERIOD = 9

/**
 * 计算 EMA（指数移动平均）值
 * EMA(today) = close × K + EMA(yesterday) × (1 - K)
 * K = 2 / (period + 1)
 * @param data K线数据数组
 * @param period 周期
 * @returns EMA 值数组，第一个值使用第一个收盘价
 */
export function calcEMA(data: KLineData[], period: number): number[] {
    const result: number[] = new Array(data.length)
    const k = 2 / (period + 1)

    if (data.length === 0) return result

    // 第一个 EMA 值使用第一个收盘价
    result[0] = data[0]!.close

    for (let i = 1; i < data.length; i++) {
        const item = data[i]
        if (!item) continue
        result[i] = item.close * k + result[i - 1]! * (1 - k)
    }

    return result
}

/**
 * 基于数值数组计算 EMA
 * @param values 数值数组（可能包含 undefined）
 * @param period 周期
 * @returns EMA 值数组
 */
export function calcEMAFromArray(values: (number | undefined)[], period: number): (number | undefined)[] {
    const result: (number | undefined)[] = new Array(values.length)
    const k = 2 / (period + 1)

    const firstValid = values.findIndex(v => v !== undefined)
    if (firstValid === -1) return result

    result[firstValid] = values[firstValid]

    for (let i = firstValid + 1; i < values.length; i++) {
        const val = values[i]
        const prev = result[i - 1]
        if (val === undefined || prev === undefined) continue
        result[i] = val * k + prev * (1 - k)
    }

    return result
}

/**
 * 计算 MACD 数据
 * DIF = EMA(close, fastPeriod) - EMA(close, slowPeriod)
 * DEA = EMA(DIF, signalPeriod)
 * MACD = (DIF - DEA) × 2
 * @param data K线数据数组
 * @param fastPeriod 快线周期（默认12）
 * @param slowPeriod 慢线周期（默认26）
 * @param signalPeriod 信号线周期（默认9）
 * @returns MACD 数据点数组，前 slowPeriod-1 个可能为 undefined
 */
export function calcMACDData(
    data: KLineData[],
    fastPeriod: number,
    slowPeriod: number,
    signalPeriod: number
): MACDPoint[] {
    const result: MACDPoint[] = new Array(data.length)

    if (data.length < slowPeriod) return result

    // 计算 EMA12 和 EMA26
    const emaFast = calcEMA(data, fastPeriod)
    const emaSlow = calcEMA(data, slowPeriod)

    // 计算 DIF
    const dif: (number | undefined)[] = new Array(data.length)
    for (let i = 0; i < data.length; i++) {
        const fast = emaFast[i]
        const slow = emaSlow[i]
        if (fast !== undefined && slow !== undefined) {
            dif[i] = fast - slow
        }
    }

    // 计算 DEA（DIF 的 signalPeriod 日 EMA）
    const dea = calcEMAFromArray(dif, signalPeriod)

    // 计算 MACD 柱
    for (let i = 0; i < data.length; i++) {
        const d = dif[i]
        const e = dea[i]
        if (d !== undefined && e !== undefined) {
            result[i] = {
                dif: d,
                dea: e,
                macd: (d - e) * 2,
            }
        }
    }

    return result
}

// ============================================================================
// SoA (Structure of Arrays) 包装函数
// 用于验证 SoA 数据层与原始 AoS 计算的一致性
// ============================================================================

import type { KLineSoALayout } from './soa'
import { SharedKLineBuffer } from './soa'

/**
 * 从 SoA 布局计算 BOLL 数据（验证用包装函数）
 * @param layout SoA 布局
 * @param period 周期
 * @param multiplier 标准差倍数
 * @returns BOLL 数据点数组
 */
export function calcBOLLDataSoA(
    layout: KLineSoALayout,
    period: number,
    multiplier: number
): BOLLPoint[] {
    const data = SharedKLineBuffer.toKLineData(layout)
    return calcBOLLData(data, period, multiplier)
}

/**
 * 从 SoA 布局计算 EXPMA 数据（验证用包装函数）
 * @param layout SoA 布局
 * @param fastPeriod 快线周期
 * @param slowPeriod 慢线周期
 * @returns EXPMA 数据点数组
 */
export function calcEXPMADataSoA(
    layout: KLineSoALayout,
    fastPeriod: number,
    slowPeriod: number
): EXPMAPoint[] {
    const data = SharedKLineBuffer.toKLineData(layout)
    return calcEXPMAData(data, fastPeriod, slowPeriod)
}

/**
 * 从 SoA 布局计算 ENE 数据（验证用包装函数）
 * @param layout SoA 布局
 * @param period 周期
 * @param deviation 偏离率百分比
 * @returns ENE 数据点数组
 */
export function calcENEDataSoA(
    layout: KLineSoALayout,
    period: number,
    deviation: number
): ENEPoint[] {
    const data = SharedKLineBuffer.toKLineData(layout)
    return calcENEData(data, period, deviation)
}

/**
 * 从 SoA 布局计算 MA 数据（验证用包装函数）
 * @param layout SoA 布局
 * @param period MA周期
 * @returns MA 值数组
 */
export function calcMADataSoA(
    layout: KLineSoALayout,
    period: number
): (number | undefined)[] {
    const data = SharedKLineBuffer.toKLineData(layout)
    return calcMAData(data, period)
}

/**
 * 从 SoA 布局计算 RSI 数据（验证用包装函数）
 * @param layout SoA 布局
 * @param period RSI周期
 * @returns RSI 值数组
 */
export function calcRSIDataSoA(
    layout: KLineSoALayout,
    period: number
): (number | undefined)[] {
    const data = SharedKLineBuffer.toKLineData(layout)
    return calcRSIData(data, period)
}

/**
 * 从 SoA 布局计算 CCI 数据（验证用包装函数）
 * @param layout SoA 布局
 * @param period 周期
 * @returns CCI 值数组
 */
export function calcCCIDataSoA(
    layout: KLineSoALayout,
    period: number
): (number | undefined)[] {
    const data = SharedKLineBuffer.toKLineData(layout)
    return calcCCIData(data, period)
}

/**
 * 从 SoA 布局计算 STOCH 数据（验证用包装函数）
 * @param layout SoA 布局
 * @param n RSV周期
 * @param m K的M日移动平均周期
 * @returns STOCH 数据点数组
 */
export function calcSTOCHDataSoA(
    layout: KLineSoALayout,
    n: number,
    m: number
): STOCHPoint[] {
    const data = SharedKLineBuffer.toKLineData(layout)
    return calcSTOCHData(data, n, m)
}

/**
 * 从 SoA 布局计算 MOM 数据（验证用包装函数）
 * @param layout SoA 布局
 * @param period 周期
 * @returns MOM 值数组
 */
export function calcMOMDataSoA(
    layout: KLineSoALayout,
    period: number
): (number | undefined)[] {
    const data = SharedKLineBuffer.toKLineData(layout)
    return calcMOMData(data, period)
}

/**
 * 从 SoA 布局计算 WMSR 数据（验证用包装函数）
 * @param layout SoA 布局
 * @param period 周期
 * @returns WMSR 值数组
 */
export function calcWMSRDataSoA(
    layout: KLineSoALayout,
    period: number
): (number | undefined)[] {
    const data = SharedKLineBuffer.toKLineData(layout)
    return calcWMSRData(data, period)
}

/**
 * 从 SoA 布局计算 KST 数据（验证用包装函数）
 * @param layout SoA 布局
 * @param roc1 第一个ROC周期
 * @param roc2 第二个ROC周期
 * @param roc3 第三个ROC周期
 * @param roc4 第四个ROC周期
 * @param signalPeriod 信号线周期
 * @returns KST 数据点数组
 */
export function calcKSTDataSoA(
    layout: KLineSoALayout,
    roc1: number,
    roc2: number,
    roc3: number,
    roc4: number,
    signalPeriod: number
): KSTPoint[] {
    const data = SharedKLineBuffer.toKLineData(layout)
    return calcKSTData(data, roc1, roc2, roc3, roc4, signalPeriod)
}

/**
 * 从 SoA 布局计算 FASTK 数据（验证用包装函数）
 * @param layout SoA 布局
 * @param period 周期
 * @returns FASTK 值数组
 */
export function calcFASTKDataSoA(
    layout: KLineSoALayout,
    period: number
): (number | undefined)[] {
    const data = SharedKLineBuffer.toKLineData(layout)
    return calcFASTKData(data, period)
}

/**
 * 从 SoA 布局计算 MACD 数据（验证用包装函数）
 * @param layout SoA 布局
 * @param fastPeriod 快线周期
 * @param slowPeriod 慢线周期
 * @param signalPeriod 信号线周期
 * @returns MACD 数据点数组
 */
export function calcMACDDataSoA(
    layout: KLineSoALayout,
    fastPeriod: number,
    slowPeriod: number,
    signalPeriod: number
): MACDPoint[] {
    const data = SharedKLineBuffer.toKLineData(layout)
    return calcMACDData(data, fastPeriod, slowPeriod, signalPeriod)
}

// ============================================================================
// ATR — Wilder's Average True Range
// ============================================================================

export const DEFAULT_ATR_PERIOD = 14

/**
 * 计算 Wilder ATR。
 * TR(0) = H(0) - L(0)
 * TR(t) = max(H(t) - L(t), |H(t) - C(t-1)|, |L(t) - C(t-1)|)
 * ATR(period-1) = mean(TR[0..period-1])
 * ATR(t) = ((period-1) * ATR(t-1) + TR(t)) / period  for t >= period
 *
 * @param data K 线数组
 * @param period 周期，需 >= 1；若 <= 0 或 data.length < period，返回全 undefined
 */
export function calcATRData(data: KLineData[], period: number): (number | undefined)[] {
    const n = data.length
    const result: (number | undefined)[] = new Array(n).fill(undefined)
    if (n === 0 || period <= 0) return result

    if (period === 1) {
        const first = data[0]!
        result[0] = first.high - first.low
        let prevClose = first.close
        for (let i = 1; i < n; i++) {
            const cur = data[i]!
            const tr = Math.max(
                cur.high - cur.low,
                Math.abs(cur.high - prevClose),
                Math.abs(cur.low - prevClose),
            )
            result[i] = tr
            prevClose = cur.close
        }
        return result
    }

    if (n < period) return result

    const first = data[0]!
    let sumTR = first.high - first.low
    let prevClose = first.close

    for (let i = 1; i < period; i++) {
        const cur = data[i]!
        sumTR += Math.max(
            cur.high - cur.low,
            Math.abs(cur.high - prevClose),
            Math.abs(cur.low - prevClose),
        )
        prevClose = cur.close
    }

    let atr = sumTR / period
    result[period - 1] = atr

    const periodMinusOne = period - 1
    for (let i = period; i < n; i++) {
        const cur = data[i]!
        const tr = Math.max(
            cur.high - cur.low,
            Math.abs(cur.high - prevClose),
            Math.abs(cur.low - prevClose),
        )
        atr = (periodMinusOne * atr + tr) / period
        result[i] = atr
        prevClose = cur.close
    }

    return result
}

/**
 * 从 SoA 布局计算 ATR（包装函数，对齐其他指标的 SoA 入口）
 */
export function calcATRDataSoA(
    layout: KLineSoALayout,
    period: number,
): (number | undefined)[] {
    const data = SharedKLineBuffer.toKLineData(layout)
    return calcATRData(data, period)
}

// ============================================================================
// WMA — Weighted Moving Average (linear weights)
// 权重: w_i = i (i=1..period)，分母 = period*(period+1)/2
// 滞后 = (period-1)/3 (相比 SMA 更快响应)
// ============================================================================

export const DEFAULT_WMA_PERIOD = 9

function _computeWMAOnNumbers(values: (number | undefined)[], period: number): (number | undefined)[] {
    const n = values.length
    const result: (number | undefined)[] = new Array(n).fill(undefined)
    if (n === 0 || period <= 0 || n < period) return result

    const denom = (period * (period + 1)) / 2

    for (let t = period - 1; t < n; t++) {
        let sw = 0
        let valid = true
        for (let k = 0; k < period; k++) {
            const v = values[t - period + 1 + k]
            if (v === undefined) {
                valid = false
                break
            }
            sw += (k + 1) * v
        }
        if (valid) result[t] = sw / denom
    }
    return result
}

export function calcWMAData(data: KLineData[], period: number): (number | undefined)[] {
    if (data.length === 0 || period <= 0) {
        return new Array(data.length).fill(undefined)
    }
    const closes = new Array<number | undefined>(data.length)
    for (let i = 0; i < data.length; i++) closes[i] = data[i]!.close
    return _computeWMAOnNumbers(closes, period)
}

export function calcWMADataSoA(layout: KLineSoALayout, period: number): (number | undefined)[] {
    const data = SharedKLineBuffer.toKLineData(layout)
    return calcWMAData(data, period)
}

// ============================================================================
// EMA helper（DEMA / TEMA 复用，沿用 EXPMA 的 first-close seed 习惯）
// alpha = 2 / (period + 1)
// ============================================================================

function _computeEMASeries(values: (number | undefined)[], period: number): (number | undefined)[] {
    const n = values.length
    const result: (number | undefined)[] = new Array(n).fill(undefined)
    if (n === 0 || period <= 0) return result

    const alpha = 2 / (period + 1)

    let i = 0
    while (i < n && values[i] === undefined) i++
    if (i >= n) return result

    let ema = values[i]!
    result[i] = ema
    for (let t = i + 1; t < n; t++) {
        const v = values[t]
        if (v === undefined) continue
        ema = v * alpha + ema * (1 - alpha)
        result[t] = ema
    }
    return result
}

// ============================================================================
// DEMA — Double Exponential Moving Average
// 公式: DEMA(t) = 2*EMA(t) - EMA(EMA)(t)
// 性质: 对线性输入零滞后（稳态），warmup ~ 2*(period-1)
// ============================================================================

export const DEFAULT_DEMA_PERIOD = 20

export function calcDEMAData(data: KLineData[], period: number): (number | undefined)[] {
    const n = data.length
    const result: (number | undefined)[] = new Array(n).fill(undefined)
    if (n === 0 || period <= 0) return result

    const closes = new Array<number | undefined>(n)
    for (let i = 0; i < n; i++) closes[i] = data[i]!.close

    const ema1 = _computeEMASeries(closes, period)
    const ema2 = _computeEMASeries(ema1, period)

    for (let i = 0; i < n; i++) {
        const e1 = ema1[i]
        const e2 = ema2[i]
        if (e1 === undefined || e2 === undefined) continue
        result[i] = 2 * e1 - e2
    }
    return result
}

export function calcDEMADataSoA(layout: KLineSoALayout, period: number): (number | undefined)[] {
    const data = SharedKLineBuffer.toKLineData(layout)
    return calcDEMAData(data, period)
}

// ============================================================================
// TEMA — Triple Exponential Moving Average
// 公式: TEMA(t) = 3*EMA(t) - 3*EMA(EMA)(t) + EMA(EMA(EMA))(t)
// 性质: 对二次多项式输入零滞后（稳态），warmup ~ 3*(period-1)
// ============================================================================

export const DEFAULT_TEMA_PERIOD = 20

export function calcTEMAData(data: KLineData[], period: number): (number | undefined)[] {
    const n = data.length
    const result: (number | undefined)[] = new Array(n).fill(undefined)
    if (n === 0 || period <= 0) return result

    const closes = new Array<number | undefined>(n)
    for (let i = 0; i < n; i++) closes[i] = data[i]!.close

    const ema1 = _computeEMASeries(closes, period)
    const ema2 = _computeEMASeries(ema1, period)
    const ema3 = _computeEMASeries(ema2, period)

    for (let i = 0; i < n; i++) {
        const e1 = ema1[i]
        const e2 = ema2[i]
        const e3 = ema3[i]
        if (e1 === undefined || e2 === undefined || e3 === undefined) continue
        result[i] = 3 * e1 - 3 * e2 + e3
    }
    return result
}

export function calcTEMADataSoA(layout: KLineSoALayout, period: number): (number | undefined)[] {
    const data = SharedKLineBuffer.toKLineData(layout)
    return calcTEMAData(data, period)
}

// ============================================================================
// HMA — Hull Moving Average
// 公式: HMA(n) = WMA( 2*WMA(close, n/2) - WMA(close, n), sqrt(n) )
// 性质: 平滑性高于 WMA，滞后远低于同期 SMA
// warmup ≈ period - 1 + round(sqrt(period)) - 1
// ============================================================================

export const DEFAULT_HMA_PERIOD = 9

export function calcHMAData(data: KLineData[], period: number): (number | undefined)[] {
    const n = data.length
    const result: (number | undefined)[] = new Array(n).fill(undefined)
    if (n === 0 || period <= 0) return result

    const closes = new Array<number | undefined>(n)
    for (let i = 0; i < n; i++) closes[i] = data[i]!.close

    const halfPeriod = Math.max(1, Math.floor(period / 2))
    const sqrtPeriod = Math.max(1, Math.round(Math.sqrt(period)))

    const wmaHalf = _computeWMAOnNumbers(closes, halfPeriod)
    const wmaFull = _computeWMAOnNumbers(closes, period)

    const raw: (number | undefined)[] = new Array(n).fill(undefined)
    for (let i = 0; i < n; i++) {
        const h = wmaHalf[i]
        const f = wmaFull[i]
        if (h === undefined || f === undefined) continue
        raw[i] = 2 * h - f
    }
    return _computeWMAOnNumbers(raw, sqrtPeriod)
}

export function calcHMADataSoA(layout: KLineSoALayout, period: number): (number | undefined)[] {
    const data = SharedKLineBuffer.toKLineData(layout)
    return calcHMAData(data, period)
}

// ============================================================================
// KAMA — Kaufman's Adaptive Moving Average
// 自适应：在趋势强时跟得紧（接近 fast EMA），在震荡时跟得慢（接近 slow EMA）。
// ER (efficiency ratio) = |close[t] - close[t-n]| / sum(|close[i] - close[i-1]|, i=t-n+1..t)
// SC = (ER * (2/(fast+1) - 2/(slow+1)) + 2/(slow+1))^2
// KAMA(t) = KAMA(t-1) + SC * (close[t] - KAMA(t-1))
// 种子 KAMA(n-1) = close[n-1]（或 SMA(n)；这里采用 close 种子以保持与项目内 EMA 系列一致）
// ============================================================================

export const DEFAULT_KAMA_PERIOD = 10
export const DEFAULT_KAMA_FAST_PERIOD = 2
export const DEFAULT_KAMA_SLOW_PERIOD = 30

export function calcKAMAData(
    data: KLineData[],
    period: number,
    fastPeriod: number,
    slowPeriod: number,
): (number | undefined)[] {
    const n = data.length
    const result: (number | undefined)[] = new Array(n).fill(undefined)
    if (n === 0 || period <= 0 || fastPeriod <= 0 || slowPeriod <= 0 || n <= period) return result

    const fastSC = 2 / (fastPeriod + 1)
    const slowSC = 2 / (slowPeriod + 1)
    const scRange = fastSC - slowSC

    // 维护滚动求和：sum(|close[i] - close[i-1]|, i=t-period+1..t)
    let volSum = 0
    for (let i = 1; i <= period; i++) {
        volSum += Math.abs(data[i]!.close - data[i - 1]!.close)
    }

    let kama = data[period - 1]!.close
    result[period - 1] = kama

    for (let t = period; t < n; t++) {
        const close = data[t]!.close
        const closeNPeriodsAgo = data[t - period]!.close
        const direction = Math.abs(close - closeNPeriodsAgo)

        const er = volSum > 0 ? direction / volSum : 0
        const sc = (er * scRange + slowSC) ** 2

        kama = kama + sc * (close - kama)
        result[t] = kama

        // 滚动 volSum：减去最旧的 |close[t-period+1] - close[t-period]|，加上最新的 |close[t+1] - close[t]|
        if (t < n - 1) {
            volSum -= Math.abs(data[t - period + 1]!.close - data[t - period]!.close)
            volSum += Math.abs(data[t + 1]!.close - data[t]!.close)
        }
    }

    return result
}

export function calcKAMADataSoA(
    layout: KLineSoALayout,
    period: number,
    fastPeriod: number,
    slowPeriod: number,
): (number | undefined)[] {
    const data = SharedKLineBuffer.toKLineData(layout)
    return calcKAMAData(data, period, fastPeriod, slowPeriod)
}

// ============================================================================
// SAR — Parabolic Stop and Reverse
// 经典 Wilder 公式：SAR(t+1) = SAR(t) + AF * (EP - SAR(t))，AF 在每次创出新极端时 +step（上限 maxStep）
// 趋势翻转条件：上升趋势中 SAR 越过 low（或反之）
// 种子：从 bar[1] 起，初始 trend=up，SAR=low[0]，EP=high[0]，AF=step
// 返回每根 K 线对应的 SAR 点（带方向）
// ============================================================================

export interface SARPoint {
    value: number
    trend: 'up' | 'down'
}

export const DEFAULT_SAR_STEP = 0.02
export const DEFAULT_SAR_MAX_STEP = 0.2

export function calcSARData(
    data: KLineData[],
    step: number,
    maxStep: number,
): (SARPoint | undefined)[] {
    const n = data.length
    const result: (SARPoint | undefined)[] = new Array(n).fill(undefined)
    if (n < 2 || step <= 0 || maxStep <= 0) return result

    let trend: 'up' | 'down' = data[1]!.close >= data[0]!.close ? 'up' : 'down'
    let sar = trend === 'up' ? data[0]!.low : data[0]!.high
    let ep = trend === 'up' ? data[0]!.high : data[0]!.low
    let af = step

    result[0] = { value: sar, trend }

    for (let t = 1; t < n; t++) {
        const bar = data[t]!
        // 先按当前趋势推进 SAR
        sar = sar + af * (ep - sar)

        // 边界约束：SAR 不能穿透前两根 K 线的极端
        if (trend === 'up') {
            const cap1 = data[t - 1]!.low
            const cap2 = t >= 2 ? data[t - 2]!.low : cap1
            sar = Math.min(sar, cap1, cap2)
        } else {
            const cap1 = data[t - 1]!.high
            const cap2 = t >= 2 ? data[t - 2]!.high : cap1
            sar = Math.max(sar, cap1, cap2)
        }

        // 检测翻转
        if (trend === 'up' && bar.low < sar) {
            trend = 'down'
            sar = ep
            ep = bar.low
            af = step
        } else if (trend === 'down' && bar.high > sar) {
            trend = 'up'
            sar = ep
            ep = bar.high
            af = step
        } else {
            // 同趋势：更新 EP / AF
            if (trend === 'up' && bar.high > ep) {
                ep = bar.high
                af = Math.min(af + step, maxStep)
            } else if (trend === 'down' && bar.low < ep) {
                ep = bar.low
                af = Math.min(af + step, maxStep)
            }
        }

        result[t] = { value: sar, trend }
    }

    return result
}

export function calcSARDataSoA(
    layout: KLineSoALayout,
    step: number,
    maxStep: number,
): (SARPoint | undefined)[] {
    const data = SharedKLineBuffer.toKLineData(layout)
    return calcSARData(data, step, maxStep)
}

// ============================================================================
// SuperTrend — ATR-based trend-following stop/band
// ============================================================================

export interface SuperTrendPoint {
    value: number
    trend: 'up' | 'down'
}

export const DEFAULT_SUPERTREND_ATR_PERIOD = 10
export const DEFAULT_SUPERTREND_MULTIPLIER = 3

export function calcSuperTrendData(
    data: KLineData[],
    atrPeriod: number,
    multiplier: number,
): (SuperTrendPoint | undefined)[] {
    const n = data.length
    const result: (SuperTrendPoint | undefined)[] = new Array(n).fill(undefined)
    if (n === 0 || atrPeriod <= 0 || multiplier <= 0) return result

    const atr = calcATRData(data, atrPeriod)

    let trend: 'up' | 'down' = 'up'
    let prevUpper = Infinity
    let prevLower = -Infinity

    for (let t = 0; t < n; t++) {
        const bar = data[t]!
        const a = atr[t]
        if (a === undefined) continue

        const hl2 = (bar.high + bar.low) / 2
        const upperBasic = hl2 + multiplier * a
        const lowerBasic = hl2 - multiplier * a

        // Smoothing: keep the previous band unless price has broken through it
        const prevClose = t > 0 ? data[t - 1]!.close : bar.close
        const upper = (upperBasic < prevUpper || prevClose > prevUpper) ? upperBasic : prevUpper
        const lower = (lowerBasic > prevLower || prevClose < prevLower) ? lowerBasic : prevLower

        // Trend update
        if (trend === 'up' && bar.close < lower) {
            trend = 'down'
        } else if (trend === 'down' && bar.close > upper) {
            trend = 'up'
        }

        result[t] = { value: trend === 'up' ? lower : upper, trend }

        prevUpper = upper
        prevLower = lower
    }

    return result
}

export function calcSuperTrendDataSoA(
    layout: KLineSoALayout,
    atrPeriod: number,
    multiplier: number,
): (SuperTrendPoint | undefined)[] {
    const data = SharedKLineBuffer.toKLineData(layout)
    return calcSuperTrendData(data, atrPeriod, multiplier)
}

// ============================================================================
// Keltner Channel — EMA ± multiplier × ATR
// ============================================================================

export interface KeltnerPoint {
    upper: number
    middle: number
    lower: number
}

export const DEFAULT_KELTNER_EMA_PERIOD = 20
export const DEFAULT_KELTNER_ATR_PERIOD = 10
export const DEFAULT_KELTNER_MULTIPLIER = 2

export function calcKeltnerData(
    data: KLineData[],
    emaPeriod: number,
    atrPeriod: number,
    multiplier: number,
): (KeltnerPoint | undefined)[] {
    const n = data.length
    const result: (KeltnerPoint | undefined)[] = new Array(n).fill(undefined)
    if (n === 0 || emaPeriod <= 0 || atrPeriod <= 0) return result

    const closes = new Array<number | undefined>(n)
    for (let i = 0; i < n; i++) closes[i] = data[i]!.close

    const ema = _computeEMASeries(closes, emaPeriod)
    const atr = calcATRData(data, atrPeriod)

    for (let t = 0; t < n; t++) {
        const m = ema[t]
        const a = atr[t]
        if (m === undefined || a === undefined) continue
        result[t] = {
            upper: m + multiplier * a,
            middle: m,
            lower: m - multiplier * a,
        }
    }
    return result
}

export function calcKeltnerDataSoA(
    layout: KLineSoALayout,
    emaPeriod: number,
    atrPeriod: number,
    multiplier: number,
): (KeltnerPoint | undefined)[] {
    const data = SharedKLineBuffer.toKLineData(layout)
    return calcKeltnerData(data, emaPeriod, atrPeriod, multiplier)
}

// ============================================================================
// Donchian Channel — rolling max(high) / min(low) over period
// ============================================================================

export interface DonchianPoint {
    upper: number
    middle: number
    lower: number
}

export const DEFAULT_DONCHIAN_PERIOD = 20

export function calcDonchianData(
    data: KLineData[],
    period: number,
): (DonchianPoint | undefined)[] {
    const n = data.length
    const result: (DonchianPoint | undefined)[] = new Array(n).fill(undefined)
    if (n === 0 || period <= 0 || n < period) return result

    for (let t = period - 1; t < n; t++) {
        let hi = -Infinity
        let lo = Infinity
        for (let k = 0; k < period; k++) {
            const bar = data[t - k]!
            if (bar.high > hi) hi = bar.high
            if (bar.low < lo) lo = bar.low
        }
        result[t] = { upper: hi, middle: (hi + lo) / 2, lower: lo }
    }
    return result
}

export function calcDonchianDataSoA(
    layout: KLineSoALayout,
    period: number,
): (DonchianPoint | undefined)[] {
    const data = SharedKLineBuffer.toKLineData(layout)
    return calcDonchianData(data, period)
}

// ============================================================================
// Ichimoku Kinko Hyo — 一目均衡表
// 5 线 + 云图（spanA/B 前置位移构成）：
//   tenkan(t) = (max(high[t-tenkanPeriod+1..t]) + min(low[t-tenkanPeriod+1..t])) / 2
//   kijun(t)  = 同公式但用 kijunPeriod
//   spanA(t)  = (tenkan(t-displacement) + kijun(t-displacement)) / 2   ← 前置 displacement
//   spanB(t)  = 用 spanBPeriod 计算后再前置 displacement
//   chikou(t) = close(t+displacement)                                  ← 后置 displacement
// 注：不做未来云的延伸（输出长度 = data.length；最后 displacement 根没 spanA/B；前 displacement 根没 chikou）
// ============================================================================

export interface IchimokuPoint {
    tenkan?: number
    kijun?: number
    spanA?: number
    spanB?: number
    chikou?: number
}

export const DEFAULT_ICHIMOKU_TENKAN = 9
export const DEFAULT_ICHIMOKU_KIJUN = 26
export const DEFAULT_ICHIMOKU_SPAN_B = 52
export const DEFAULT_ICHIMOKU_DISPLACEMENT = 26

function _rollingMidline(data: KLineData[], period: number): (number | undefined)[] {
    const n = data.length
    const result: (number | undefined)[] = new Array(n).fill(undefined)
    if (n < period || period <= 0) return result
    for (let t = period - 1; t < n; t++) {
        let hi = -Infinity
        let lo = Infinity
        for (let k = 0; k < period; k++) {
            const bar = data[t - k]!
            if (bar.high > hi) hi = bar.high
            if (bar.low < lo) lo = bar.low
        }
        result[t] = (hi + lo) / 2
    }
    return result
}

export function calcIchimokuData(
    data: KLineData[],
    tenkanPeriod: number,
    kijunPeriod: number,
    spanBPeriod: number,
    displacement: number,
): (IchimokuPoint | undefined)[] {
    const n = data.length
    const result: (IchimokuPoint | undefined)[] = new Array(n).fill(undefined)
    if (n === 0 || tenkanPeriod <= 0 || kijunPeriod <= 0 || spanBPeriod <= 0) return result

    const tenkan = _rollingMidline(data, tenkanPeriod)
    const kijun = _rollingMidline(data, kijunPeriod)
    const spanBSource = _rollingMidline(data, spanBPeriod)

    for (let t = 0; t < n; t++) {
        const point: IchimokuPoint = {}
        if (tenkan[t] !== undefined) point.tenkan = tenkan[t]
        if (kijun[t] !== undefined) point.kijun = kijun[t]

        // spanA / spanB 由 displacement 根之前的值填到当前槽位
        const src = t - displacement
        if (src >= 0) {
            if (tenkan[src] !== undefined && kijun[src] !== undefined) {
                point.spanA = (tenkan[src]! + kijun[src]!) / 2
            }
            if (spanBSource[src] !== undefined) {
                point.spanB = spanBSource[src]
            }
        }

        // chikou：当前 close 后置 displacement 根（即存到 t - displacement 槽位上 close[t]）
        // 这里改成：存当前槽位的 chikou = close[t + displacement]，需 future 数据；不可用时 undefined
        const future = t + displacement
        if (future < n) point.chikou = data[future]!.close

        result[t] = point
    }

    return result
}

export function calcIchimokuDataSoA(
    layout: KLineSoALayout,
    tenkanPeriod: number,
    kijunPeriod: number,
    spanBPeriod: number,
    displacement: number,
): (IchimokuPoint | undefined)[] {
    const data = SharedKLineBuffer.toKLineData(layout)
    return calcIchimokuData(data, tenkanPeriod, kijunPeriod, spanBPeriod, displacement)
}

// ============================================================================
// ROC — Rate of Change
// ROC(t) = (close[t] - close[t-period]) / close[t-period] * 100
// ============================================================================

export const DEFAULT_ROC_PERIOD = 12

export function calcROCData(data: KLineData[], period: number): (number | undefined)[] {
    const n = data.length
    const result: (number | undefined)[] = new Array(n).fill(undefined)
    if (n === 0 || period <= 0) return result
    for (let t = period; t < n; t++) {
        const prev = data[t - period]!.close
        if (prev === 0) continue
        result[t] = (data[t]!.close - prev) / prev * 100
    }
    return result
}

export function calcROCDataSoA(layout: KLineSoALayout, period: number): (number | undefined)[] {
    const data = SharedKLineBuffer.toKLineData(layout)
    return calcROCData(data, period)
}

// ============================================================================
// TRIX — Triple Exponential Smoothing Oscillator
// EMA3 = EMA(EMA(EMA(close, p), p), p)
// TRIX(t) = (EMA3[t] - EMA3[t-1]) / EMA3[t-1] * 100
// Signal(t) = EMA(TRIX, signalPeriod) —— 配合金叉/死叉
// ============================================================================

export interface TRIXResult {
    series: (number | undefined)[]
    signalSeries: (number | undefined)[]
}

export const DEFAULT_TRIX_PERIOD = 15
export const DEFAULT_TRIX_SIGNAL_PERIOD = 9

export function calcTRIXData(
    data: KLineData[],
    period: number,
    signalPeriod: number,
): TRIXResult {
    const n = data.length
    const series: (number | undefined)[] = new Array(n).fill(undefined)
    const signalSeries: (number | undefined)[] = new Array(n).fill(undefined)
    if (n === 0 || period <= 0) return { series, signalSeries }

    const closes = new Array<number | undefined>(n)
    for (let i = 0; i < n; i++) closes[i] = data[i]!.close

    const ema1 = _computeEMASeries(closes, period)
    const ema2 = _computeEMASeries(ema1, period)
    const ema3 = _computeEMASeries(ema2, period)

    for (let t = 1; t < n; t++) {
        const cur = ema3[t]
        const prev = ema3[t - 1]
        if (cur === undefined || prev === undefined || prev === 0) continue
        series[t] = (cur - prev) / prev * 100
    }

    if (signalPeriod > 0) {
        const smoothed = _computeEMASeries(series, signalPeriod)
        for (let i = 0; i < n; i++) signalSeries[i] = smoothed[i]
    }

    return { series, signalSeries }
}

export function calcTRIXDataSoA(
    layout: KLineSoALayout,
    period: number,
    signalPeriod: number,
): TRIXResult {
    const data = SharedKLineBuffer.toKLineData(layout)
    return calcTRIXData(data, period, signalPeriod)
}

// ============================================================================
// HV — Historical Volatility (close-to-close log returns)
// HV(t) = stdDev(log(close[i]/close[i-1]), i=t-period+1..t) * sqrt(annualization)
// 输出年化波动率（百分比形式 × 100）
// ============================================================================

export const DEFAULT_HV_PERIOD = 20
export const DEFAULT_HV_ANNUALIZATION = 252

export function calcHVData(
    data: KLineData[],
    period: number,
    annualizationFactor: number,
): (number | undefined)[] {
    const n = data.length
    const result: (number | undefined)[] = new Array(n).fill(undefined)
    if (n < 2 || period <= 0 || annualizationFactor <= 0) return result

    const logReturns: number[] = new Array(n)
    logReturns[0] = 0
    for (let t = 1; t < n; t++) {
        const prev = data[t - 1]!.close
        const cur = data[t]!.close
        logReturns[t] = (prev > 0 && cur > 0) ? Math.log(cur / prev) : 0
    }

    const annScale = Math.sqrt(annualizationFactor)
    for (let t = period; t < n; t++) {
        let sum = 0
        for (let k = 1; k <= period; k++) sum += logReturns[t - period + k]!
        const mean = sum / period
        let varSum = 0
        for (let k = 1; k <= period; k++) {
            const diff = logReturns[t - period + k]! - mean
            varSum += diff * diff
        }
        const std = Math.sqrt(varSum / (period - 1 > 0 ? period - 1 : 1))
        result[t] = std * annScale * 100
    }

    return result
}

export function calcHVDataSoA(
    layout: KLineSoALayout,
    period: number,
    annualizationFactor: number,
): (number | undefined)[] {
    const data = SharedKLineBuffer.toKLineData(layout)
    return calcHVData(data, period, annualizationFactor)
}

// ============================================================================
// Parkinson Volatility — high-low range volatility
// PV(t) = sqrt(  (1/(4*ln(2))) * mean(ln(high[i]/low[i])^2) * annualization  ) * 100
// ============================================================================

export const DEFAULT_PARKINSON_PERIOD = 20
export const DEFAULT_PARKINSON_ANNUALIZATION = 252

export function calcParkinsonData(
    data: KLineData[],
    period: number,
    annualizationFactor: number,
): (number | undefined)[] {
    const n = data.length
    const result: (number | undefined)[] = new Array(n).fill(undefined)
    if (n === 0 || period <= 0 || annualizationFactor <= 0 || n < period) return result

    const factor = 1 / (4 * Math.log(2))
    const annScale = Math.sqrt(annualizationFactor)

    const hlLogSq: number[] = new Array(n)
    for (let i = 0; i < n; i++) {
        const bar = data[i]!
        if (bar.high > 0 && bar.low > 0) {
            const ln = Math.log(bar.high / bar.low)
            hlLogSq[i] = ln * ln
        } else {
            hlLogSq[i] = 0
        }
    }

    for (let t = period - 1; t < n; t++) {
        let sum = 0
        for (let k = 0; k < period; k++) sum += hlLogSq[t - k]!
        const mean = sum / period
        result[t] = Math.sqrt(factor * mean) * annScale * 100
    }

    return result
}

export function calcParkinsonDataSoA(
    layout: KLineSoALayout,
    period: number,
    annualizationFactor: number,
): (number | undefined)[] {
    const data = SharedKLineBuffer.toKLineData(layout)
    return calcParkinsonData(data, period, annualizationFactor)
}

// ============================================================================
// Chaikin Volatility — EMA(high-low) 的 ROC
// ChaikinVol(t) = (EMA(H-L, p)[t] - EMA(H-L, p)[t-rocPeriod]) / EMA(H-L, p)[t-rocPeriod] * 100
// ============================================================================

export const DEFAULT_CHAIKIN_VOL_EMA_PERIOD = 10
export const DEFAULT_CHAIKIN_VOL_ROC_PERIOD = 10

export function calcChaikinVolData(
    data: KLineData[],
    emaPeriod: number,
    rocPeriod: number,
): (number | undefined)[] {
    const n = data.length
    const result: (number | undefined)[] = new Array(n).fill(undefined)
    if (n === 0 || emaPeriod <= 0 || rocPeriod <= 0) return result

    const hl: (number | undefined)[] = new Array(n)
    for (let i = 0; i < n; i++) hl[i] = data[i]!.high - data[i]!.low

    const emaSeries = _computeEMASeries(hl, emaPeriod)

    for (let t = rocPeriod; t < n; t++) {
        const cur = emaSeries[t]
        const prev = emaSeries[t - rocPeriod]
        if (cur === undefined || prev === undefined || prev === 0) continue
        result[t] = (cur - prev) / prev * 100
    }

    return result
}

export function calcChaikinVolDataSoA(
    layout: KLineSoALayout,
    emaPeriod: number,
    rocPeriod: number,
): (number | undefined)[] {
    const data = SharedKLineBuffer.toKLineData(layout)
    return calcChaikinVolData(data, emaPeriod, rocPeriod)
}

// ============================================================================
// VMA — Volume Moving Average (SMA of volume)
// ============================================================================

export const DEFAULT_VMA_PERIOD = 5

export function calcVMAData(data: KLineData[], period: number): (number | undefined)[] {
    const n = data.length
    const result: (number | undefined)[] = new Array(n).fill(undefined)
    if (n === 0 || period <= 0 || n < period) return result
    let sum = 0
    for (let i = 0; i < period; i++) sum += data[i]!.volume
    result[period - 1] = sum / period
    for (let t = period; t < n; t++) {
        sum += data[t]!.volume - data[t - period]!.volume
        result[t] = sum / period
    }
    return result
}

export function calcVMADataSoA(layout: KLineSoALayout, period: number): (number | undefined)[] {
    const data = SharedKLineBuffer.toKLineData(layout)
    return calcVMAData(data, period)
}

// ============================================================================
// OBV — On Balance Volume (cumulative)
// close[t] > close[t-1] → OBV += volume[t]
// close[t] < close[t-1] → OBV -= volume[t]
// else → OBV unchanged
// ============================================================================

export function calcOBVData(data: KLineData[]): (number | undefined)[] {
    const n = data.length
    const result: (number | undefined)[] = new Array(n).fill(undefined)
    if (n === 0) return result
    let obv = 0
    result[0] = 0
    for (let t = 1; t < n; t++) {
        const cur = data[t]!
        const prev = data[t - 1]!
        if (cur.close > prev.close) obv += cur.volume
        else if (cur.close < prev.close) obv -= cur.volume
        result[t] = obv
    }
    return result
}

export function calcOBVDataSoA(layout: KLineSoALayout): (number | undefined)[] {
    const data = SharedKLineBuffer.toKLineData(layout)
    return calcOBVData(data)
}

// ============================================================================
// PVT — Price Volume Trend (cumulative)
// PVT(t) = PVT(t-1) + ((close[t] - close[t-1]) / close[t-1]) * volume[t]
// ============================================================================

export function calcPVTData(data: KLineData[]): (number | undefined)[] {
    const n = data.length
    const result: (number | undefined)[] = new Array(n).fill(undefined)
    if (n === 0) return result
    let pvt = 0
    result[0] = 0
    for (let t = 1; t < n; t++) {
        const prevClose = data[t - 1]!.close
        if (prevClose === 0) {
            result[t] = pvt
            continue
        }
        pvt += ((data[t]!.close - prevClose) / prevClose) * data[t]!.volume
        result[t] = pvt
    }
    return result
}

export function calcPVTDataSoA(layout: KLineSoALayout): (number | undefined)[] {
    const data = SharedKLineBuffer.toKLineData(layout)
    return calcPVTData(data)
}
