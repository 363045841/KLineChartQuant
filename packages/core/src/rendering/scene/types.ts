/**
 * Scene + Layer 类型契约。
 *
 * Scene 位于 core 依赖栈中 `render` 之上：
 *
 *     interaction → store → scene → render
 *
 * `Layer` 是自包含的绘制单元——candle、volume、indicator plot、drawing、
 * crosshair、component 全部遵循同一形状。Scene 组合 Layer、拥有排序、驱动
 * 每帧绘制分发；它通过泛型 `TFrame` 透传帧上下文，因此不知道 GPU 后端，
 * 也不依赖业务层的 `RenderContext`（分层由泛型保留）。
 *
 * 本文件是**纯类型**：`createScene.ts` 实现 `Scene`，这里的类型零运行时，
 * 框架适配层与指标控制器可直接编译而不引入实现。
 */

import type { Signal } from '../../foundation/reactivity/signal.js'
import type { Renderer } from '../render/Renderer.js'

/**
 * 绘制角色。Scene 按角色分组/过滤（例如 overlay 帧只画 overlay），
 * 也供其它子系统按语义定位 Layer（如命中测试忽略 background）。
 *
 * 角色映射到 main / drawing / overlay 合成目标；同一目标内由 z 决定顺序。
 */
export type LayerRole =
  | 'background' // grid, axes
  | 'primary' // candles, time-share line
  | 'indicator' // MA, BOLL, sub-pane volume, indicator-defined plots
  | 'component' // Volume Profile, Heatmap, Footprint
  | 'drawing' // user drawings
  | 'overlay' // crosshair, hover, legends

/**
 * Layer 所属的 pane 身份：
 * - `LAYER_PANE_GLOBAL`：绘制到每一个 pane（网格线等）；
 * - 具体 paneId（`'main'` / `'RSI_0'` / ...）：只绘制到该 pane。
 *
 * 用具体 id 而不是 `main|sub` 角色，使子图 Layer 的归属精确到 pane，
 * 不再需要绘制期靠比对 paneId 补偿。
 */
export type LayerPane = string

/** Layer 声明绘制到所有 pane 时使用的 pane 身份。 */
export const LAYER_PANE_GLOBAL: LayerPane = 'global'

/** 合成目标是固定的三个层带；z 只在目标内比较，避免 DOM 层序与 Scene 层序冲突。 */
export type ScenePaintTarget = 'main' | 'drawing' | 'overlay'
export const SCENE_TARGET_Z: Readonly<Record<ScenePaintTarget, number>> = {
  main: 0,
  drawing: 1,
  overlay: 2,
}
export const SCENE_PAINT_TARGETS: readonly ScenePaintTarget[] = ['main', 'drawing', 'overlay']

/** 角色到合成目标的唯一映射，Scene 与 DOM 使用相同层带语义。 */
export function scenePaintTarget(role: LayerRole): ScenePaintTarget {
  return role === 'drawing' ? 'drawing' : role === 'overlay' ? 'overlay' : 'main'
}

/**
 * 单个 pane 在一帧内的绘制输入：Scene 透传给每个命中该 pane 的 Layer。
 */
export interface FramePaint {
  /** 本帧构建的业务帧上下文（含 ctx/几何/主题），由 ChartRenderer 提供。 */
  context: unknown
  /** 本帧渲染后端；Layer 用它提交 GPU 画笔。 */
  renderer: Renderer
  /** 原始像素目标由 Pane 持有；未分配的 drawing 目标为 null。 */
  targets: Readonly<Record<ScenePaintTarget, CanvasRenderingContext2D | null>>
  /**
   * 该 pane 主图带的可见 GPU 表面。存在时纯增量图层直接写入它，不再做整张拷贝；
   * 缺省（Canvas 后端或直出不可用）时仍合成到 `targets.main`。
   */
  gpuSurface?: import('../primitives/types.js').PrimitiveSurface
  /** 本帧 DPR；直出表面按它投影，缺省为 1。 */
  dpr?: number
  /** 帧计数器，用于动画与跳帧检测。 */
  frameNumber: number
  /** 距离上一次绘制的时间（ms），首帧可能为 0。 */
  deltaMs: number
  /** 该 pane 本帧要绘制的角色集合；未提供表示画全部角色。 */
  roles?: ReadonlyArray<LayerRole>
  /** 是否在绘制该 pane 前清除其 canvas。 */
  clear: boolean
}

/**
 * 一次绘制调用传入的完整帧：覆盖所有可见 pane。
 *
 * Scene 按 `Layer.pane` 与每个 `FramePaint.paneId` 匹配后分发，
 * 因此一次 `paint()` 即可画完整帧，不需要业务层逐 pane 调用。
 */
export interface SceneFrame {
  panes: ReadonlyArray<FramePaint & { paneId: string }>
}

/**
 * 一帧绘制时逐 pane 传给 Layer 的上下文：业务帧上下文 + 本 pane 身份。
 * Layer 从 `context` 读取所需能力（数据/几何/主题）。
 */
export type LayerPaint<TFrame> = TFrame & {
  /** Scene 已根据图层角色选择目标，业务层不得另行选择输出画布。 */
  ctx: CanvasRenderingContext2D
  /** 当前 pane id；由 Scene 注入。 */
  paneId?: string
  /** 本帧是否清除该 pane 的 canvas；由 Scene 注入。 */
  clear?: boolean
  /** 本帧渲染后端；由 Scene 注入，直接绘制（测试）时可缺省。 */
  sceneRenderer?: Renderer
  /** 本帧已绑定输出目标的原语提交器；Scene 注入，图层不得另行选择画布。 */
  primitives?: import('../primitives/types.js').PrimitivePaint
}

/**
 * 纯增量图层的绘制上下文：**没有 ctx**，只能提交原语。
 *
 * 类型上因此写不出 clip / clear / 读回 / 改坐标系，合批边界由构造保证，
 * 不再依赖"图层承诺不碰状态"的口头约定。
 */
export type PrimitiveDrawContext<TFrame> = Omit<TFrame, 'ctx'> & {
  /** 目标已绑定的原语提交入口；Scene 必注入，直接绘制的测试上下文可缺省。 */
  primitives?: import('../primitives/types.js').PrimitivePaint
  /** 仅用于文字度量；禁止用于绘制。 */
  measureContext?: CanvasRenderingContext2D
  /** 当前 pane id；由 Scene 注入。 */
  paneId?: string
  /** 本帧是否清除该 pane 的 canvas；由 Scene 注入。 */
  clear?: boolean
  /** 本帧渲染后端；由 Scene 注入。 */
  sceneRenderer?: Renderer
}

/** 所有 Layer 的公共身份与生命周期。 */
interface LayerBase<TFrame> {
  readonly id: string
  readonly role: LayerRole
  /** 绘制目标 pane：具体 paneId 或 LAYER_PANE_GLOBAL。 */
  readonly pane: LayerPane
  /** 同一合成目标内 z 小者先画；相同 z 按注册顺序。 */
  readonly z: number
  /** 运行时开关，不改变图层成员关系。 */
  visible: boolean
  dispose(): void
}

/** 只输出纯增量原语：拿不到 ctx，可与相邻同类图层合并成一次合成。 */
export interface DrawListLayer<TFrame = unknown> extends LayerBase<TFrame> {
  readonly kind: 'draw-list'
  paint(context: PrimitiveDrawContext<TFrame>): void
}

/** 允许自行改状态或直接写 canvas：Scene 在其前后立即合成。 */
export interface ContextLayer<TFrame = unknown> extends LayerBase<TFrame> {
  readonly kind?: 'context'
  paint(context: LayerPaint<TFrame>): void
}

/**
 * Layer 是自包含绘制单元。
 *
 * 契约：
 * - `paint()` 是纯函数式绘制：给定上下文产出绘制指令，不修改其它 Layer 可见的共享状态；
 *   Layer 私有状态（缓存 buffer、上次帧号）允许。
 * - `paint()` 按 Scene 定义的顺序执行；z 小者先画，视觉上被 z 大者覆盖。
 * - `dispose()` 释放 Layer 申请的资源；dispose 后 Scene 不会再调用 paint。
 * - `visible` 是运行时开关；不可见的 Layer 被 Scene 跳过（不调用 paint）。
 * - `pane` 声明绘制目标，`LAYER_PANE_GLOBAL` 表示所有 pane。
 *
 * 判别联合决定合成边界：`draw-list` 拿不到 ctx，只能增量提交；`context` 保留完整
 * ctx，Scene 在其前后各自合成。泛型 `TFrame` 由使用方实例化为具体帧上下文
 * （图表侧为 `RenderContext`），Scene 只透传，不感知其结构。
 */
export type Layer<TFrame = unknown> = DrawListLayer<TFrame> | ContextLayer<TFrame>

/**
 * Scene 组合 Layer，并通过 Signal 暴露给订阅方。
 *
 * add/remove 都产生**新数组**，绝不原地修改旧值——框架适配层用 `Object.is`
 * 比较引用，必须保持不可变。
 *
 * `paint` 是唯一绘制入口：按 paneId 过滤、丢弃不可见 Layer、在 z 上升序稳定排序后
 * 逐层调用，并对每个 Layer 做异常隔离（单个 Layer 抛错不中断同 pane 其它 Layer）。
 *
 * `dispose` 拆除全部 Layer 并冻结 Scene——之后的 add/remove/setLayerVisibility/paint
 * 都是静默 no-op。
 */
export interface Scene<TFrame = unknown> {
  readonly layers: Signal<ReadonlyArray<Layer<TFrame>>>

  addLayer(layer: Layer<TFrame>): void
  /** 移除并释放指定 Layer；不存在或已销毁时返回 false。 */
  removeLayer(id: string): boolean
  getLayer(id: string): Layer<TFrame> | null
  setLayerVisibility(id: string, visible: boolean): boolean

  /** 绘制一整帧（覆盖所有 pane），逐 Layer 异常隔离。 */
  paint(frame: SceneFrame): void

  dispose(): void
}
