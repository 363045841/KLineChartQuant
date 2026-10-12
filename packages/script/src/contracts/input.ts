/**
 * 输入契约：行情数据源与单根 K 线
 *
 * Bar 类型在历史与实时两个阶段通用，但引擎对两个阶段的执行方式不同：
 * - history：每根 K 线只执行一次
 * - subscribe：同一根 K 线可能被多次推送，引擎会覆盖重算
 */

/** 单根 K 线 */
export interface Bar {
  /** K 线开盘时间戳（毫秒，UTC） */
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
  /**
   * 该 K 线是否已收盘
   * - 历史数据恒为 true
   * - 缺省视为 true
   * - 实时推送中，未收盘的 tick 为 false，收盘的最后一次推送为 true
   */
  closed?: boolean
}

/** 历史数据请求的时间范围，按 K 线开盘时间过滤，缺省表示不限制 */
export interface DataFeedRange {
  /** 起始时间戳（毫秒，含）；为预热指标，调用方可将其设得比目标区间更早 */
  from?: number
  /** 结束时间戳（毫秒，含） */
  to?: number
}

/**
 * 行情数据
 *
 * 约定：
 * - tf 格式统一为 "<数字><单位>"，单位取 s / m / h / D / W / M，例如 "1m" "15m" "4h" "1D"
 * - 历史与实时的衔接：引擎按 time 去重。相同 time 视为同一根 K 线的更新，更大的 time 视为新 K 线
 * - 同一 (symbol, tf) 下，history 与 subscribe 合起来不得出现缺口，由实现方保证
 * - time 出现回退（小于已处理的最新 time）时，引擎抛出错误
 */
export interface DataFeed {
  /**
   * 返回指定 symbol / 周期的历史 K 线，按 time 严格升序、无重复。
   * 最后一根可能未收盘（closed 为 false）
   * 通过 AsyncIterable 实现 for await 按需拉取
   */
  history(symbol: string, tf: string, range?: DataFeedRange): AsyncIterable<Bar>

  /**
   * 订阅实时推送，返回取消订阅函数。
   * 每次回调传入的是当前 K 线的完整快照（不是增量）：
   * - time 与当前相同：更新当前 K 线
   * - time 更大：上一根已定稿，开始新的一根
   */
  subscribe?(symbol: string, tf: string, onTick: (bar: Bar) => void): () => void
}
