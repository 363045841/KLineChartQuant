/**
 * 序列视口记忆契约：按 K 线序列保存可见时间区间。
 *
 * 区间以时间描述，不保存像素或槽位，窗口宽度变化后仍表示同一段行情。
 */

/** 一份可恢复的可见区间；与 LayoutDocument.viewport 的落盘形状一致。 */
export interface SeriesViewportSnapshot {
  /** 可见窗口最早一根 K 线的时间。 */
  readonly fromTime: number
  /** 可见窗口最晚一根 K 线的时间。 */
  readonly toTime: number
}
