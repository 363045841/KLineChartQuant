/**
 * 缠论结构契约：K 线包含处理、分型、笔、中枢与整张快照。
 *
 * 只描述结构事实，不含任何交易判定；判定一律在调用方或规则层做。
 */

/** 原始 K 线的最小输入。 */
export interface ChanBar {
  /** 时间戳（毫秒）。 */
  time: number;
  /** 最高价。 */
  high: number;
  /** 最低价。 */
  low: number;
}

/** 处理包含关系后的合并 K 线。 */
export interface ChanMergedBar {
  /** 该合并柱覆盖的最后一根原始 K 线时间。 */
  time: number;
  /** 合并后高点。 */
  high: number;
  /** 合并后低点。 */
  low: number;
  /** 相对前一根合并柱的方向：1 向上、-1 向下、0 尚未确定。 */
  direction: 1 | -1 | 0;
  /** 起始原始索引。 */
  startIndex: number;
  /** 结束原始索引。 */
  endIndex: number;
}

/** 分型类型。 */
export type ChanFractalKind = "top" | "bottom";

/** 顶分型或底分型。 */
export interface ChanFractal {
  /** 分型中心在合并柱序列中的索引。 */
  index: number;
  /** 分型中心时间。 */
  time: number;
  /** 分型价格：顶取高点、底取低点。 */
  price: number;
  /** 分型类型。 */
  kind: ChanFractalKind;
}

/** 一笔：一个有方向的连接。 */
export interface ChanStroke {
  /** 起点分型索引。 */
  fromIndex: number;
  /** 终点分型索引。 */
  toIndex: number;
  /** 起点时间。 */
  fromTime: number;
  /** 终点时间。 */
  toTime: number;
  /** 起点价格。 */
  fromPrice: number;
  /** 终点价格。 */
  toPrice: number;
  /** 方向：1 向上、-1 向下。 */
  direction: 1 | -1;
}

/** 中枢：连续三笔的重叠区间。 */
export interface ChanHub {
  /** 起始笔序号。 */
  fromStroke: number;
  /** 结束笔序号（含）。 */
  toStroke: number;
  /** 中枢上沿。 */
  high: number;
  /** 中枢下沿。 */
  low: number;
  /** 中枢起始时间。 */
  fromTime: number;
  /** 中枢结束时间。 */
  toTime: number;
}

/** 一张完整快照。 */
export interface ChanSnapshot {
  /** 合并 K 线序列。 */
  merged: readonly ChanMergedBar[];
  /** 分型序列，按时间正序。 */
  fractals: readonly ChanFractal[];
  /** 笔序列，按时间正序且方向交替。 */
  strokes: readonly ChanStroke[];
  /** 中枢序列。 */
  hubs: readonly ChanHub[];
}
