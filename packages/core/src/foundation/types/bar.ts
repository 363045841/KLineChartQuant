/**
 * 行情数据的基本形状：K 线与分时。
 *
 * 数据层、计算层与渲染层共用同一份定义；这里不包含任何图表几何或宿主类型。
 */

/** 单根 K 线；时间戳为 UTC 毫秒。 */
export interface KLineData {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume?: number
  turnover?: number
  symbol?: string
  /** 上游日线数据附带的本地日期字符串；不参与计算。 */
  date?: string
  amplitude?: number
  changePercent?: number
  changeAmount?: number
  turnoverRate?: number
}

/** 单个分时点；`volume` 单位为手，`amount` 单位为元。 */
export interface TimeShareData {
  timestamp: number
  price: number
  average: number
  /** 分时成交量，单位手；上游未提供时缺失。 */
  volume?: number
  /** 分时成交额，单位元；上游未提供时缺失。 */
  amount?: number
}
