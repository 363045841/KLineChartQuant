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
   * 主动买入量（基础资产数量）。
   *
   * 只有数据源按主动方向拆分的交易所才提供，例如 Binance K 线；缺省表示该数据源
   * 不区分主动买卖方向。指标据此决定算精确净额还是用其它方式估算。
   */
  buyVolume?: number
  /**
   * 该 K 线是否已收盘。
   * - 历史数据恒为 true
   * - 缺省视为 true
   * - 实时推送中，未收盘的 tick 为 false，收盘的最后一次推送为 true
   */
  closed?: boolean
}
