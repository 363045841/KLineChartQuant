/**
 * 行情 Bar 契约：指标计算的输入数据，历史与实时两个阶段通用。
 */

/** 单根 K 线。 */
export interface Bar {
  /** K 线开盘时间戳（毫秒，UTC）。 */
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
  /**
   * 该 K 线是否已收盘。
   * - 历史数据恒为 true
   * - 缺省视为 true
   * - 实时推送中，未收盘的 tick 为 false，收盘的最后一次推送为 true
   */
  closed?: boolean
}
