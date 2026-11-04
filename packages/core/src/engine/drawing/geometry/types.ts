/**
 * geometry 子模块对外契约：指针落点锚点、坐标换算选项与线表类型。
 *
 * 仅存放跨子模块引用或被 barrel 公开的类型；几何实现细节留在 impl/。
 * 本文件不得 import 同子模块 impl/。
 */

import type { MagnetSnapConfig, SnapCandidate } from '../magnet/types.js'

/** 原始锚点输入（逻辑坐标：时间戳 + 价格） */
export interface InteractionDrawingAnchor {
  /** 对应的时间戳（ms）；未来槽位时为创建时最后一根 K 线的时间。 */
  time?: number
  /** 基准 K 线之后的未来时间轴槽位数。 */
  futureOffset?: number
  /** 价格 */
  price: number
}

/** 由屏幕坐标反解析出的逻辑锚点(时间戳 + 价格)，time 已确定为时间戳；解析失败整体返回 null，不会进入该类型。 */
export interface ResolvedInteractionAnchor extends InteractionDrawingAnchor {
  /** 对应的时间戳（ms），必填。 */
  time: number
}

/** 指针命中 Pane 后解析出的完整绘图锚点。 */
export interface DrawingPointerAnchor extends ResolvedInteractionAnchor {
  paneId: string
  /** Pane 局部 X（逻辑像素）。 */
  x: number
  /** Pane 局部 Y（逻辑像素）。 */
  y: number
  /** 本次落点命中的磁吸候选；未开启磁吸或未命中时为 null。 */
  snap: SnapCandidate | null
}

/** 指针位置的最小形状：只需 client 坐标，便于用缓存的指针位置重算命中。 */
export interface PointerCoordinates {
  clientX: number
  clientY: number
}

/** resolveDrawingPointer 的可选行为配置。 */
export interface ResolveDrawingPointerOptions {
  /**
   * OHLC 磁吸配置：在坐标反解析前把指针吸附到最近 K 线的价格极值。
   * 仅允许绘图落点/预览路径传入；cursor 命中、框选、标签等路径不得传入，
   * 否则点选命中与框选范围会随吸附漂移。
   */
  magnet?: MagnetSnapConfig
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
