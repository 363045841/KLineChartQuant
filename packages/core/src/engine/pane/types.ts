/** pane 模块对外契约：pane 布局、分层画布、副图投影与领域写操作的公共类型。 */
import type { PaneCapabilities, PaneRole, RenderContext } from '../../foundation/plugin/index.js'
import type { Layer } from '../../rendering/scene/types.js'
import type { IndicatorStateModule, SubPaneInput, SubPaneSpec } from '../state/indicatorState.js'
import type { PaneStateModule } from '../state/paneState.js'

/** Pane 左上角标题与右上角操作控件共用的逻辑像素内边距。 */
export const PANE_HEADER_INSET_PX = 12

/** 未显式配置价格标签宽度时的默认逻辑像素宽度。 */
export const DEFAULT_PRICE_LABEL_WIDTH = 60

/**
 * 主图 pane 的唯一标识。
 * 与渲染器的 GLOBAL_PANE_ID（Symbol，表示渲染到所有 pane）语义不同，二者不会冲突。
 */
export const MAIN_PANE_ID = 'main' as const

/** Pane 的布局规格与角色能力。 */
export type PaneSpec = {
  id: string
  ratio: number
  visible?: boolean
  minHeightPx?: number
  role?: PaneRole
  capabilities?: Partial<PaneCapabilities>
}

/** 单个 Pane 所持有的分层 canvas DOM 集合。 */
export type PaneRendererDom = {
  mainCanvas: HTMLCanvasElement
  /** 正式图元独立表面；拖拽和预览使用 overlayCanvas。 */
  drawingCanvas: HTMLCanvasElement
  overlayCanvas: HTMLCanvasElement
  yAxisCanvas: HTMLCanvasElement
  /** 轴区动态层（最新价标签、十字线价签），叠在 yAxisCanvas 上 */
  yAxisOverlayCanvas: HTMLCanvasElement
  leftYAxisCanvas?: HTMLCanvasElement
  leftYAxisOverlayCanvas?: HTMLCanvasElement
}

/** 单个 Pane 的绘图上下文集合，价格轴与左右摆放位置无关。 */
export type PaneRendererContexts = {
  mainCtx: CanvasRenderingContext2D | null
  drawingCtx: CanvasRenderingContext2D | null
  overlayCtx: CanvasRenderingContext2D | null
  yAxisCtx: CanvasRenderingContext2D | null
  yAxisOverlayCtx: CanvasRenderingContext2D | null
  leftAxisCtx: CanvasRenderingContext2D | null
  leftAxisOverlayCtx: CanvasRenderingContext2D | null
}

/** PaneRenderer 的尺寸参数。 */
export type PaneRendererOptions = {
  rightAxisWidth: number
  leftAxisWidth: number
  yPaddingPx: number
  priceLabelWidth?: number
}

/** 已解析的 PaneRenderer 参数：priceLabelWidth 已填默认值。 */
export type ResolvedPaneRendererOptions = Omit<PaneRendererOptions, 'priceLabelWidth'> & {
  priceLabelWidth: number
}

/** 可由用户界面和 Agent 共同提交的 pane 可更新字段。 */
export type PanePatch = Partial<Omit<PaneSpec, 'id'>>

/** PaneManager 的领域依赖，仅依赖业务状态而不依赖 DOM 或 renderer。 */
export interface PaneManagerDependencies {
  readonly pane: PaneStateModule
  readonly indicator: IndicatorStateModule
}

/** 创建副图 pane 所需的内容；实例身份由 PaneManager 生成。 */
export type CreatePaneInput = Omit<SubPaneInput, 'instanceId' | 'ordinal'>

/** 副图投影所需的完整 renderer 资源标识。 */
export interface SubPaneResources {
  readonly paneId: string
  readonly indicatorId: string
  readonly rendererName: string
  readonly scaleRendererName: string
  readonly paneTitleRendererName: string
  readonly layerId: string
  readonly scaleLayerId: string
  readonly paneTitleLayerId: string
}

/** 已解析副图 renderer 元数据的副图条目。 */
export interface SubPaneEntry extends SubPaneSpec {
  readonly rendererName?: string
  readonly scaleRendererName?: string
  readonly paneTitleRendererName?: string
  readonly layerId?: string
  readonly scaleLayerId?: string
  readonly paneTitleLayerId?: string
}

/** 副图 renderer/layer 的运行时投影依赖。 */
export interface SubPaneContext {
  /** 副图增删改后通知实例链路重建渲染投影。 */
  onPaneProjectionChanged: () => void
  getRenderer: (id: string) => Layer<RenderContext> | undefined
  useRenderer: (layer: Layer<RenderContext>) => void
  removeRenderer: (id: string) => void
  getOption: () => {
    rightAxisWidth: number
    priceLabelWidth?: number
    yPaddingPx: number
  }
  getCrosshairPos: () => { x: number; y: number } | null
  getCrosshairPrice: () => number | null
  getActivePaneId: () => string | null
}
