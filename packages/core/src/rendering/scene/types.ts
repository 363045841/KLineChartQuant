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
 * 渲染对象分类。
 *
 * 系统对象是图表自带的绘制内容（K 线、对比线、Footprint 等），指标与绘图
 * 是用户对象；分类用于对象树展示与领域命令归属，UI 是否可操作只看能力。
 */
export type RenderObjectKind = 'system' | 'indicator' | 'drawing'

/**
 * 对象树允许发起的操作集合。
 *
 * 能力由创建者按对象事实声明，UI 与 Agent 只读取能力，不按 kind 推断；
 * 典型差异：K 线不可删除、系统对象不可跨 pane。
 */
export interface RenderObjectCapabilities {
  /** 可删除。 */
  readonly removable: boolean
  /** 可切换显隐；锁定不改变该能力。 */
  readonly hideable: boolean
  /** 可在所属层带内重排。 */
  readonly orderable: boolean
  /** 可迁移到其他 pane。 */
  readonly movable: boolean
  /** 可锁定；没有任何可锁动作的对象为 false。 */
  readonly lockable: boolean
}

/** 对象的移动目标：pane 身份 + 层带内的插入位置。 */
export interface RenderObjectMoveTarget {
  /** 目标 pane；必须能承载该对象，否则命令返回 false。 */
  readonly paneId: string
  /** 同层带内自底层起的插入位置；缺省表示该层带顶部。 */
  readonly index?: number
}

/**
 * 对象的领域命令面：对象树与图例的唯一写入口。
 *
 * 命令在创建对象时闭包到所属领域（指标实例、绘图文档、settings），
 * Scene 从不调用它们，也不持有第二份状态。
 */
export interface RenderObjectCommands {
  /** 切换显隐；锁定不阻止该操作。 */
  setVisible(visible: boolean): boolean
  /** 切换锁定；锁定只阻止删除、画布拖动与跨 pane 迁移。 */
  setLocked(locked: boolean): boolean
  /** 重排或迁移；能力不允许、目标非法时返回 false，不产生中间态。 */
  move(target: RenderObjectMoveTarget): boolean
  /** 删除对象及其领域记录；不可删或已锁定时返回 false。 */
  remove(): boolean
}

/** 渲染对象的业务身份与命令声明；只有业务对象声明它。 */
export interface RenderObjectDescriptor {
  readonly kind: RenderObjectKind
  /** 对象树显示名；由创建者按当前状态生成，不做二次拼接。 */
  readonly label: string
  readonly capabilities: RenderObjectCapabilities
  readonly commands: RenderObjectCommands
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
  /** GPU 直出失败时同帧恢复完整 2D 目标；正常帧无需分配它的像素。 */
  ensureMainTarget?: () => CanvasRenderingContext2D | null
  /** 指令覆盖层首次提交时分配，帧结束无提交则释放；自定义 context 层在进入前分配。 */
  ensureOverlayTarget?: () => CanvasRenderingContext2D | null
  finishOverlay?: (used: boolean) => void
  /** Pane 提供稀疏文字表面；仅接收 main GPU 直出通道拆出的文字。 */
  paintText?: (
    primitives: readonly import('../primitives/types.js').TextPaintPrimitive[],
    dpr: number,
    bounds: Readonly<{ width: number; height: number }>,
  ) => void
  /** 本帧 DPR；直出表面按它投影，缺省为 1。 */
  dpr?: number
  /**
   * Pane 的完整尺寸（逻辑像素），Scene 据此生成从 (0, 0) 开始的绘制边界。
   * 不接收价格坐标留白或图例高度，避免把映射范围误用为裁剪范围。
   */
  bounds: Readonly<{ width: number; height: number }>
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
interface LayerBase<_TFrame> {
  readonly id: string
  readonly role: LayerRole
  /** 绘制目标 pane：具体 paneId 或 LAYER_PANE_GLOBAL。 */
  readonly pane: LayerPane
  /**
   * 同一合成目标内 z 小者先画；相同 z 按注册顺序。
   *
   * 业务对象由所属领域顺序决定该值（指标 ordinal、绘图 zIndex、系统固定），
   * 领域命令写回后刷新这里；Scene 只读，不做二次换算。
   */
  z: number
  /** 运行时开关，不改变图层成员关系；锁定不影响该值。 */
  visible: boolean
  /**
   * 锁定状态：禁止删除、画布拖动与跨 pane 迁移，不禁止显隐与排序。
   *
   * 由所属领域投影而来，缺省视为未锁定。
   */
  locked?: boolean
  /**
   * 业务对象身份与命令。
   *
   * 网格、坐标轴、刻度、十字线等装饰层不声明该字段，因此不会进入对象树；
   * 声明后 Layer 即 {@link RenderObject}。
   */
  readonly object?: RenderObjectDescriptor
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
 * - `z` / `visible` / `locked` 是所属领域状态的投影：唯一写入口是
 *   `object.commands`，Scene 只读，不直接改写业务对象的这三个字段。
 * - `pane` 声明绘制目标，`LAYER_PANE_GLOBAL` 表示所有 pane。
 *
 * 判别联合决定合成边界：`draw-list` 拿不到 ctx，只能增量提交；`context` 保留完整
 * ctx，Scene 在其前后各自合成。泛型 `TFrame` 由使用方实例化为具体帧上下文
 * （图表侧为 `RenderContext`），Scene 只透传，不感知其结构。
 */
export type Layer<TFrame = unknown> = DrawListLayer<TFrame> | ContextLayer<TFrame>

/**
 * 渲染对象：声明了业务身份的 Layer，对象树与命令面都作用于它。
 *
 * 契约：
 * - 身份即 `Layer.id`，对象树与命令都按它寻址，不再另设对象 ID；
 * - `object.commands` 是唯一写入口，命令落回所属领域，领域状态再投影回
 *   `z` / `visible` / `locked`；
 * - Scene 只读身份、顺序、显隐与 `paint`，从不调用领域命令；
 * - 只有业务对象声明 `object`，装饰层保持普通 Layer。
 */
export type RenderObject<TFrame = unknown> = Layer<TFrame> & {
  readonly object: RenderObjectDescriptor
}

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
