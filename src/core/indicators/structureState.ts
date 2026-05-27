import type { BaseIndicatorState } from '@/plugin'
import { createIndicatorStateKey } from '@/plugin/stateKeys'

export interface SwingPoint {
    index: number
    price: number
    kind: 'high' | 'low'
    label: 'HH' | 'HL' | 'LH' | 'LL'
    confirmed: boolean
}

export type StructureEventKind = 'BOS' | 'CHOCH'

export interface StructureEvent {
    kind: StructureEventKind
    index: number
    triggerPrice: number
    brokenLevel: number
    brokenSwingIndex: number
    direction: 'up' | 'down'
}

export interface StructureSnapshot {
    swings: SwingPoint[]
    events: StructureEvent[]
    trend: 'up' | 'down' | 'range'
}

export interface StructureRenderState extends BaseIndicatorState {
    timestamp: number
    series: StructureSnapshot
    params: {
        leftWindow: number
        rightWindow: number
        breakoutSource: 'close' | 'wick'
        showSwingLabels: boolean
        showBOS: boolean
        showCHOCH: boolean
        showProvisional: boolean
    }
    valueMin: number
    valueMax: number
    visibleMin: number
    visibleMax: number
}

export const createStructureStateKey = (paneId: string) =>
    createIndicatorStateKey('structure', paneId)

export const DEFAULT_STRUCTURE_LEFT = 2
export const DEFAULT_STRUCTURE_RIGHT = 2

export const EMPTY_STRUCTURE_STATE: StructureRenderState = {
    timestamp: 0,
    series: { swings: [], events: [], trend: 'range' },
    params: {
        leftWindow: DEFAULT_STRUCTURE_LEFT,
        rightWindow: DEFAULT_STRUCTURE_RIGHT,
        breakoutSource: 'close',
        showSwingLabels: true,
        showBOS: true,
        showCHOCH: true,
        showProvisional: false,
    },
    valueMin: 0,
    valueMax: 1,
    visibleMin: Infinity,
    visibleMax: -Infinity,
}
