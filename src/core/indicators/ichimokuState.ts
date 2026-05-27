import type { BaseIndicatorState } from '@/plugin'
import { createIndicatorStateKey } from '@/plugin/stateKeys'

/**
 * 一目均衡表数据点：5 条线在同一根 K 线槽位
 * - tenkan (转换线) = (HH9 + LL9) / 2，当根 K 线计算
 * - kijun (基准线) = (HH26 + LL26) / 2，当根 K 线计算
 * - spanA (先行带 A) = (tenkan[t-displacement] + kijun[t-displacement]) / 2，前置位移
 * - spanB (先行带 B) = (HH52[t-displacement] + LL52[t-displacement]) / 2，前置位移
 * - chikou (迟行线) = close[t+displacement]，后置位移
 *
 * 任一字段都可能 undefined（数据不足或位移外）。
 */
export interface IchimokuPoint {
    tenkan?: number
    kijun?: number
    spanA?: number
    spanB?: number
    chikou?: number
}

export interface IchimokuRenderState extends BaseIndicatorState {
    timestamp: number
    series: (IchimokuPoint | undefined)[]
    params: {
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
    valueMin: number
    valueMax: number
    visibleMin: number
    visibleMax: number
}

export const createIchimokuStateKey = (paneId: string) =>
    createIndicatorStateKey('ichimoku', paneId)

export const DEFAULT_ICHIMOKU_TENKAN = 9
export const DEFAULT_ICHIMOKU_KIJUN = 26
export const DEFAULT_ICHIMOKU_SPAN_B = 52
export const DEFAULT_ICHIMOKU_DISPLACEMENT = 26

export const EMPTY_ICHIMOKU_STATE: IchimokuRenderState = {
    timestamp: 0,
    series: [],
    params: {
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
    valueMin: 0,
    valueMax: 1,
    visibleMin: Infinity,
    visibleMax: -Infinity,
}
