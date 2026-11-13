/** pane 模块对外契约：pane 布局、分层画布、实例迁移命令与副图投影的公共类型。 */
import type { PaneCapabilities, PaneRole } from '../../foundation/plugin/index.js'
import type { IndicatorMetadata } from '../indicators/indicatorMetadata.js'
import type { IndicatorInstancePatch, IndicatorStateModule } from '../state/indicatorState.js'
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

/** Pane 的布局规格与角色能力；轴由实例派生，不进入持久化配置。 */
export type PaneSpec = {
  id: string
  ratio: number
  visible?: boolean
  minHeightPx?: number
  role?: PaneRole
  capabilities?: Partial<PaneCapabilities>
}

/** 已提交的可见 Pane 几何，坐标相对绘图区，单位为 CSS 像素；不持久化。 */
export interface PaneGeometry {
  readonly id: string
  readonly top: number
  readonly height: number
  readonly primaryAxisWidth: number
}

/** 拖拽期间总位移始终相对按下时的布局，外部布局变化后会话失效。 */
export interface PaneBoundaryResizeSession {
  resize(totalDeltaY: number): boolean
}

/**
 * 单个 Pane 所持有的分层 canvas DOM 集合。
 *
 * main/overlay/右轴为常驻表面；正式图元与左轴表面按需创建，未创建时为 undefined。
 */
export type PaneRendererDom = {
  mainCanvas: HTMLCanvasElement
  /** 主图带的可见 GPU 表面；仅在 GPU 后端且需要直出时创建。 */
  mainGpuCanvas?: HTMLCanvasElement
  /** 正式图元独立表面；仅当该 pane 有正式图元时创建。拖拽和预览使用 overlayCanvas。 */
  drawingCanvas?: HTMLCanvasElement
  overlayCanvas: HTMLCanvasElement
  yAxisCanvas: HTMLCanvasElement
  /** 轴区动态层（最新价标签、十字线价签），叠在 yAxisCanvas 上 */
  yAxisOverlayCanvas: HTMLCanvasElement
  /** 左轴静态层；仅在左轴可见时存在。 */
  leftYAxisCanvas?: HTMLCanvasElement
  /** 左轴动态层；与静态层同生命周期。 */
  leftYAxisOverlayCanvas?: HTMLCanvasElement
}

/** 按需表面的创建入口：负责 DOM 身份、样式与插入位置，尺寸由 PaneRenderer 写入。 */
export interface PaneSurfaceFactory {
  /** 创建主图带的可见 GPU 表面，并插在同 pane 的 2D 主画布之下。 */
  createMainGpuCanvas(): HTMLCanvasElement
  /** 创建正式图元表面，并插入到同 pane overlay 表面之下。 */
  createDrawingCanvas(): HTMLCanvasElement
  /** 创建左轴静态与动态表面，并挂到左轴宿主。 */
  createLeftAxisCanvases(): { base: HTMLCanvasElement; overlay: HTMLCanvasElement }
  /** 左轴宿主是否为专用左轴层；只有专用层的宽度才代表轴宽。 */
  readonly leftAxisHostMeasurable: boolean
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

/** 实例移动目标的判别值；菜单、命令、Agent 与测试共用同一份定义。 */
export const INSTANCE_MOVE_KIND = {
  MAIN: 'main',
  PANE: 'pane',
  NEW_PANE: 'newPane',
} as const

/** 实例移动目标种类；由 {@link INSTANCE_MOVE_KIND} 派生。 */
export type InstanceMoveKind = (typeof INSTANCE_MOVE_KIND)[keyof typeof INSTANCE_MOVE_KIND]

/**
 * 实例移动目标。菜单项、公开命令与 Agent 工具共用同一形状。
 *
 * 目标 pane 与当前 pane 相同即为同一 Pane 内重排；`index` 是目标 Pane 内
 * 自底层起的位置，缺省放到该 Pane 末尾（视觉最上层）。
 */
export type InstanceMoveTarget =
  | { readonly kind: typeof INSTANCE_MOVE_KIND.MAIN; readonly index?: number }
  | {
      readonly kind: typeof INSTANCE_MOVE_KIND.PANE
      readonly paneId: string
      readonly index?: number
    }
  | {
      readonly kind: typeof INSTANCE_MOVE_KIND.NEW_PANE
      readonly anchorPaneId: string
      readonly placement: 'above' | 'below'
    }

/** Core 投影给菜单的目标项；UI 只渲染，不自行推导可用性。 */
export interface InstanceMoveOption {
  readonly target: InstanceMoveTarget
  readonly label: string
  readonly enabled: boolean
}

/** 实例布局命令：主图与副图共用同一套身份与写入语义。 */
export interface PaneLayoutCommands {
  /** 按定义创建实例；target 省略时主图定义进主图，其余进新副图。 */
  add(
    definitionId: string,
    params?: Readonly<Record<string, unknown>>,
    target?: InstanceMoveTarget,
  ): string | null
  /** 迁移实例归属或在同一 Pane 内换位；源副图变空时自动回收。 */
  moveInstance(instanceId: string, target: InstanceMoveTarget): boolean
  /** 删除实例；空副图一并回收。 */
  removeInstance(instanceId: string): boolean
  /** 删除指定定义创建的全部实例；空副图一并回收。 */
  removeInstancesByDefinition(definitionId: string): void
  /** 删除当前工作区全部实例；副图一并回收，主图与系统 Pane 保留。 */
  clearAllIndicators(): void
  /** 更新实例参数、显隐、排序或定义；身份不变。 */
  updateInstance(instanceId: string, patch: IndicatorInstancePatch): boolean
  /** Pane 容器操作，不改变实例归属。 */
  updatePane(paneId: string, patch: PanePatch): boolean
  movePane(paneId: string, targetIndex: number): boolean
  /** 按 pane 身份提交完整顺序，不改变内容或主图位置规则。 */
  reorderPanes(paneIds: ReadonlyArray<string>): boolean
  removePane(paneId: string): boolean
  clearPanes(): void
  importLayout(specs: ReadonlyArray<PaneSpec>): void
  getLayoutSpecs(): PaneSpec[]
  hasPane(paneId: string): boolean
}

/** PaneManager 的领域依赖，仅依赖业务状态而不依赖 DOM 或 renderer。 */
export interface PaneManagerDependencies {
  readonly pane: PaneStateModule
  readonly indicator: IndicatorStateModule
  readonly getDefinition: (indicatorId: string) => IndicatorMetadata | undefined
}
