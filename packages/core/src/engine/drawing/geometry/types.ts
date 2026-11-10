/**
 * geometry 子模块对外契约：指针落点锚点、落点约束选项与线表类型。
 *
 * 仅存放跨子模块引用或被 barrel 公开的类型与常量；几何实现细节留在 impl/。
 * 本文件不得 import 同子模块 impl/。
 */

import type { Point } from '@/foundation/geometry/index.js'
import type { MagnetSnapConfig, SnapCandidate } from '../magnet/types.js'
import type { PersistedDrawingAnchor } from '../types.js'

/**
 * 可投影为屏幕坐标的锚点形状。
 *
 * 投影只读取类型、时间与价格；持久化锚点与交互期待定锚点都满足它，
 * 因此取参考点时不需要为待定锚点伪造持久化 id。
 */
export type ProjectableAnchor = Omit<PersistedDrawingAnchor, 'id'> & { id?: string }

/** 原始锚点输入（逻辑坐标：时间戳 + 价格） */
export interface InteractionDrawingAnchor {
  /** 稳定的绝对时间戳（ms），未来位置同样由公开坐标服务解析为时间。 */
  time?: number
  /** 价格 */
  price: number
}

/** 由屏幕坐标反解析出的逻辑锚点(时间戳 + 价格)，time 已确定为时间戳；解析失败整体返回 null，不会进入该类型。 */
export interface ResolvedInteractionAnchor extends InteractionDrawingAnchor {
  /** 对应的时间戳（ms），必填。 */
  time: number
}

/** 指针所在 Pane 的几何位置；只读命中不依赖该位置是否已有行情时间。 */
export interface DrawingPointerLocation {
  paneId: string
  /** Pane 局部 X（逻辑像素）。 */
  x: number
  /** Pane 局部 Y（逻辑像素）。 */
  y: number
}

/** 指针命中 Pane 后解析出的完整绘图锚点。 */
export interface DrawingPointerAnchor extends ResolvedInteractionAnchor, DrawingPointerLocation {
  /** 本次落点命中的磁吸候选；未开启磁吸或未命中时为 null。 */
  snap: SnapCandidate | null
}

/** 指针位置的最小形状：只需 client 坐标，便于用缓存的指针位置重算命中。 */
export interface PointerCoordinates {
  clientX: number
  clientY: number
}

/** 锁角档位：90° / 2，整个圆周 8 个方向（含水平与垂直）。 */
export const ANGLE_LOCK_STEP = Math.PI / 4

/**
 * 锁角生效的最小位移（Pane 局部逻辑像素）。
 *
 * 离参考点太近时方向噪声大于意义，低于该值保持自由落点，避免参考点附近抖动。
 */
export const ANGLE_LOCK_MIN_DELTA = 4

/**
 * Shift 锁角：把落点绕参考点投影到最近的 45° 倍数方向上，距离不变。
 *
 * 这是方向约束，与磁吸的值吸附是两个维度：没有候选集合，也没有领域原值，
 * 只改写落点的屏幕向量。参考点由调用方按会话给出（绘制中是上一锚点，
 * 编辑中是同一图元的另一个锚点）。
 */
export interface AngleLockOptions {
  /** 锁角参考点（Pane 局部逻辑像素）。 */
  readonly origin: Point
}

/**
 * resolveDrawingPointer 的可选行为配置。
 *
 * `magnet` 与 `angleLock` 互斥：值吸附会改写方向约束的结果，两者同时给出时锁角优先。
 * 修饰键到这两者的映射由交互层统一决策，宿主只透传 PointerEvent。
 */
export interface ResolveDrawingPointerOptions {
  /** 创建或拖动锚点时吸附当前周期槽位；只读命中和整体平移保留连续坐标。 */
  snapToSlot?: boolean
  /**
   * OHLC 磁吸配置：在坐标反解析前把指针吸附到最近 K 线的价格极值。
   * 仅允许绘图落点/预览路径传入；cursor 命中、框选、标签等路径不得传入，
   * 否则点选命中与框选范围会随吸附漂移。
   */
  magnet?: MagnetSnapConfig
  /** Shift 锁角配置；与 `magnet` 互斥，同时给出时锁角优先。 */
  angleLock?: AngleLockOptions
  /**
   * 出界钳制目标 Pane：指针超出绘图区或该 Pane 时，把落点贴到 Pane 边界后继续解析，
   * 供进行中的多锚点图元保持预览（橡皮筋式贴边）。
   * 命中、框选、标签等只读路径不得传入，否则会在画布外产生假命中。
   */
  clampPaneId?: string
  /** 落点限制在已有数据的右边界，供依赖 K 线区间计算的图元使用。 */
  clampDataEnd?: boolean
}

/** 线中点手柄的拖拽轴：price 上下平移整条线，time 左右平移整条线。 */
export type LineHandleAxis = 'price' | 'time'

/** 图元的一条线：由两个持久化锚点下标定义。 */
export interface DrawingLine {
  /** 起点锚点下标。 */
  readonly from: number
  /** 终点锚点下标。 */
  readonly to: number
  /** 该线中点手柄的拖拽轴；null 表示这条线不开手柄。 */
  readonly handle: LineHandleAxis | null
}

/** 开启中点手柄的线：在所属图元线表中的下标、两端锚点下标与拖拽轴。 */
export interface LineHandle {
  /** 在 {@link getLineHandles} 返回数组中的下标，命中与拖拽以此定位。 */
  readonly index: number
  readonly from: number
  readonly to: number
  /** 拖拽该线时平移的坐标轴。 */
  readonly axis: LineHandleAxis
}
