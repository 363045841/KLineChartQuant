import type { BaseIndicatorState } from '@/plugin'
import { createIndicatorStateKey } from '@/plugin/stateKeys'

/**
 * SAR 点：value 是 SAR 价格，trend = 'up' 表示 SAR 在 K 线下方（多头止损）
 * 'down' 表示 SAR 在 K 线上方（空头止损）。
 */
export interface SARPoint {
    value: number
    trend: 'up' | 'down'
}

export interface SARRenderState extends BaseIndicatorState {
    timestamp: number
    series: (SARPoint | undefined)[]
    params: { step: number; maxStep: number; showSAR: boolean }
    valueMin: number
    valueMax: number
    visibleMin: number
    visibleMax: number
}

export const createSARStateKey = (paneId: string) =>
    createIndicatorStateKey('sar', paneId)

export const DEFAULT_SAR_STEP = 0.02
export const DEFAULT_SAR_MAX_STEP = 0.2

export const EMPTY_SAR_STATE: SARRenderState = {
    timestamp: 0,
    series: [],
    params: {
        step: DEFAULT_SAR_STEP,
        maxStep: DEFAULT_SAR_MAX_STEP,
        showSAR: true,
    },
    valueMin: 0,
    valueMax: 1,
    visibleMin: Infinity,
    visibleMax: -Infinity,
}
