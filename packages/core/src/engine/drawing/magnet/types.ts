/**
 * magnet 子模块对外契约：档位、吸附候选、候选源与吸附结果。
 *
 * 磁吸是「值轴吸附」：所有候选都落在同一个 X 上，各自给出一个可写回的价格，
 * 少数候选额外给出可写回的时间轴位置。选择阶段只比较屏幕距离，不再区分股种。
 * 实现留在 impl/；本文件不得 import 同子模块 impl/。
 */

/**
 * 磁吸档位常量表：运行时设置档位、构建工具栏都必须引用这里，
 * 禁止在业务代码中散落字符串字面量。
 */ export const MagnetMode = {
  /** 关闭磁吸。 */
  Off: 'off',
  /** 吸附半径内的候选。 */
  Weak: 'weak',
  /** 更大吸附半径的候选。 */
  Strong: 'strong',
} as const

/** 磁吸三态，由 MagnetMode 常量派生。 */
export type MagnetMode = (typeof MagnetMode)[keyof typeof MagnetMode]

/** 生效档位（off 已在调用方过滤，进入磁吸模块的必为吸附档）。 */
export type ActiveMagnetMode = Exclude<MagnetMode, typeof MagnetMode.Off>

/** weak 档吸附半径（屏幕逻辑像素）。 */
export const MAGNET_RADIUS_WEAK = 8

/**
 * strong 档吸附半径（屏幕逻辑像素）。
 *
 * strong 不是「无门槛」：它只是把可吸附范围放大到可以用余光去够的程度，
 * 指针离所有候选都很远时仍然自由落点，避免把落点拽到屏幕另一侧的线上。
 */
export const MAGNET_RADIUS_STRONG = 24

/**
 * 候选来源。只用于同距离时的稳定取舍与调试定位，不改变吸附语义：
 * 图元线与指标值优先于 OHLC，因为它们是用户显式画/加出来的参照。
 */
export const SnapSource = {
  /** 用户图元的线。 */
  Drawing: 'drawing',
  /** 指标输出值。 */
  Indicator: 'indicator',
  /** 当前 Bar 的 OHLC。 */
  Bar: 'bar',
} as const

/** 候选来源类型，由 SnapSource 常量派生。 */
export type SnapSource = (typeof SnapSource)[keyof typeof SnapSource]

/** 一条参与吸附的线段：契约由 foundation 的帧投影产出，这里只做重导出。 */
import type { SnapLine } from '@/foundation/plugin/index.js'

export type { SnapLine } from '@/foundation/plugin/index.js'

/** 指标在某个逻辑下标处的一个值。 */
export interface SnapIndicatorValue {
  /** 指标实例 id 与 plot id 的组合，保证候选身份稳定。 */
  readonly id: string
  readonly value: number
}

/**
 * 候选源：磁吸只做几何与距离判断，不感知文档、指标或工作区。
 *
 * 两个查询都必须返回「已提交层」的数据：正在拖拽的图元不在候选里，
 * 否则吸附会吸到自己，形成反馈回路。
 */
export interface MagnetSnapSources {
  /** 当前 Pane 已提交层的线。 */
  getLines(paneId: string): ReadonlyArray<SnapLine>
  /** 当前 Pane 在指定逻辑下标处的指标值。 */
  getIndicatorValues(paneId: string, barIndex: number): ReadonlyArray<SnapIndicatorValue>
}

/** 磁吸配置。 */
export interface MagnetSnapConfig {
  readonly mode: ActiveMagnetMode
  readonly sources: MagnetSnapSources
  /** 需要排除的图元（本次拖拽的对象）。 */
  readonly excludeDrawingIds: ReadonlyArray<string>
}

/**
 * 吸附候选：屏幕上的一点 + 可写回的领域值。
 *
 * `price` 与 `time` 至少一个非 null：两者都有表示点候选，只有价格表示值线，
 * 只有时间表示时间锚点。写回时直接取这里原值，不再用屏幕坐标反算。
 */
export interface SnapCandidate {
  /** Pane 局部 X。 */
  readonly x: number
  /** Pane 局部 Y。 */
  readonly y: number
  /** 可写回的价格；null 表示只提供时间轴。 */
  readonly price: number | null
  /** 可写回的时间戳；null 表示只提供价格轴。 */
  readonly time: number | null
  readonly source: SnapSource
  /** 稳定身份：同距离时按它定序，结果不随遍历顺序漂移。 */
  readonly id: string
}

/** 吸附结果：Pane 局部落点 + 命中的候选。 */
export interface SnapResult {
  /** Pane 局部 X。 */
  readonly x: number
  /** Pane 局部 Y。 */
  readonly y: number
  /** 命中的候选；null 表示没有候选命中，X 仍落 Bar 中心。 */
  readonly candidate: SnapCandidate | null
}
