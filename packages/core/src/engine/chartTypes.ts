import type { PaneRole, PaneCapabilities } from '../plugin'

export type ChartDom = {
  container: HTMLDivElement
  scrollContent?: HTMLDivElement
  canvasLayer: HTMLDivElement
  rightAxisLayer: HTMLDivElement
  xAxisCanvas: HTMLCanvasElement
}

export type PaneSpec = {
  id: string
  ratio: number
  visible?: boolean
  minHeightPx?: number
  role?: PaneRole
  capabilities?: Partial<PaneCapabilities>
}

export type PaneRendererDom = {
  mainCanvas: HTMLCanvasElement
  overlayCanvas: HTMLCanvasElement
  yAxisCanvas: HTMLCanvasElement
}

export type ChartOptions = {
  kWidth?: number
  kGap?: number
  yPaddingPx: number
  rightAxisWidth: number
  bottomAxisHeight: number
  minKWidth: number
  maxKWidth: number
  panes: PaneSpec[]
  paneGap?: number
  priceLabelWidth?: number
  defaultPaneMinHeightPx?: number
  zoomLevels?: number
  initialZoomLevel?: number
}

export type KLinePositions = number[]

export type Viewport = {
  viewWidth: number
  viewHeight: number
  plotWidth: number
  plotHeight: number
  scrollLeft: number
  dpr: number
}

export type ViewportState = {
  zoomLevel: number
  plotWidth: number
  plotHeight: number
  dpr: number
  visibleFrom: number
  visibleTo: number
  kWidth: number
  kGap: number
}

export type IndicatorRole = 'main' | 'sub'

export interface IndicatorInstance {
  id: string
  definitionId: string
  label: string
  name: string
  role: IndicatorRole
  paneId?: string
  params: Record<string, unknown>
}

export interface SubPaneInfo {
  paneId: string
  indicatorId: string
  params: Record<string, unknown>
  ratio: number
}

export type DrawingToolType = 'trendline' | 'horizontal' | 'fib' | 'rectangle' | 'arrow'

export interface DrawingObject {
  id: string
  type: DrawingToolType
}
