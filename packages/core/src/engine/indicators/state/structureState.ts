import type { BaseIndicatorState } from '@/foundation/plugin/index.js'

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
