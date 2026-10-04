/** chart 模块对外契约：图表装配层所需的 DOM、选项、视口与指标实例类型。 */

import type { PaneSpec } from '../pane/types.js'
import type { IndicatorInstanceRole } from '../state/indicatorState.js'

export type ChartDom = {
  container: HTMLDivElement
  scrollContent?: HTMLDivElement
  canvasLayer: HTMLDivElement
  rightAxisLayer: HTMLDivElement
  leftAxisLayer?: HTMLDivElement
  xAxisCanvas: HTMLCanvasElement
}

export type ChartOptions = {
  kWidth?: number
  kGap?: number
  yPaddingPx: number
  rightAxisWidth: number
  leftAxisWidth: number
  bottomAxisHeight: number
  minKWidth: number
  maxKWidth: number
  panes: PaneSpec[]
  paneGap?: number
  priceLabelWidth?: number
  defaultPaneMinHeightPx?: number
  zoomLevels?: number
  initialZoomLevel?: number
  /** 主图 DOM 图例配置，由 options 状态统一管理。 */
  legend?: import('../renderers/Indicator/mainIndicatorLegend/types.js').LegendOptions
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
  /** 可索引可见起点（已 clamp start>=0） */
  visibleFrom: number
  /** 可索引可见终点（开区间） */
  visibleTo: number
  kWidth: number
  kGap: number
}

/** 指标实例角色，复用引擎状态层的唯一取值定义。 */
export type IndicatorRole = IndicatorInstanceRole

export interface IndicatorInstance {
  id: string
  definitionId: string
  label: string
  name: string
  role: IndicatorRole
  paneId?: string
  ordinal: number
  params: Record<string, unknown>
}

export interface SubPaneInfo {
  instanceId: string
  paneId: string
  indicatorId: string
  ordinal: number
  params: Record<string, unknown>
  ratio: number
}
