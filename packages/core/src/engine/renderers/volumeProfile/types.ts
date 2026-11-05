/**
 * 成交量分布（Volume Profile）的对外契约。
 *
 * 计算口径对齐 TradingView 的 SVP / PVP：按价位分桶，桶内区分上涨与下跌成交量，
 * 价值区从 POC 向两侧按「上下各两行取大者」扩张。渲染与计算分离，计算部分是纯函数。
 */

/** 统计口径：按交易日重置，或按可配置阶段（周期）分段。 */
export type VolumeProfileScope = 'session' | 'periodic'

/** 每行成交量展示口径。 */
export type VolumeProfileVolumeMode = 'total' | 'updown' | 'delta'

/** 阶段单位：每 N 根 K 线、每 N 天/周/月。 */
export type VolumeProfilePeriodUnit = 'candle' | 'day' | 'week' | 'month'

/** 横条相对所属阶段区间的对齐方向。 */
export type VolumeProfileBoxPosition = 'left' | 'right'

/** 可调参数；字段一一对应 TradingView 的「输入」与「样式」两栏。 */
export interface VolumeProfileParams {
  /** 阶段数量，与 `periodUnit` 组合决定每段覆盖多少数据。 */
  readonly periodCount: number
  /** 阶段单位。 */
  readonly periodUnit: VolumeProfilePeriodUnit
  /** 每行成交量口径。 */
  readonly volumeMode: VolumeProfileVolumeMode
  /** 价值区占总量百分比。 */
  readonly valueAreaPercent: number
  /** 每段行数（价位桶数量）。 */
  readonly rowSize: number
  /** 横条最大宽度占所属阶段区间宽度的百分比。 */
  readonly boxWidthPercent: number
  /** 横条贴阶段左沿还是右沿。 */
  readonly boxPosition: VolumeProfileBoxPosition
  /** 向右延长 POC 直到价格穿越。 */
  readonly extendPoc: boolean
  /** 向右延长 VAH 直到价格穿越。 */
  readonly extendVah: boolean
  /** 向右延长 VAL 直到价格穿越。 */
  readonly extendVal: boolean
  /** 显示 POC 线。 */
  readonly showPoc: boolean
  /** 显示 VAH 线。 */
  readonly showVah: boolean
  /** 显示 VAL 线。 */
  readonly showVal: boolean
}

/** 单个价位桶。 */
export interface VolumeProfileLevel {
  /** 桶下沿价格。 */
  readonly priceLow: number
  /** 桶上沿价格。 */
  readonly priceHigh: number
  /** 上涨成交量。 */
  readonly upVolume: number
  /** 下跌成交量。 */
  readonly downVolume: number
  /** 上涨 + 下跌。 */
  readonly totalVolume: number
}

/** 一段数据的聚合结果。 */
export interface VolumeProfileResult {
  readonly levels: ReadonlyArray<VolumeProfileLevel>
  /** 成交量最大桶的中心价。 */
  readonly pointOfControl: number
  /** 价值区上沿价格。 */
  readonly valueAreaHigh: number
  /** 价值区下沿价格。 */
  readonly valueAreaLow: number
  /** 单桶最大总成交量，用于横条宽度归一化。 */
  readonly maxLevelVolume: number
  /** 单桶最大绝对差值（上涨 - 下跌），用于差值口径的宽度归一化。 */
  readonly maxLevelDelta: number
  readonly totalVolume: number
}

/** 一段连续数据在原序列中的闭区间下标。 */
export interface VolumeProfileSlice {
  readonly startIndex: number
  readonly endIndex: number
}

/** 默认参数：与 TradingView 的默认值一致（分布图贴阶段左沿）。 */
export const DEFAULT_VOLUME_PROFILE_PARAMS: VolumeProfileParams = {
  periodCount: 1,
  periodUnit: 'week',
  volumeMode: 'updown',
  valueAreaPercent: 70,
  rowSize: 120,
  boxWidthPercent: 30,
  boxPosition: 'left',
  extendPoc: false,
  extendVah: false,
  extendVal: false,
  showPoc: true,
  showVah: true,
  showVal: true,
}

/** 行数上下限：上限用于限制单帧绘制量。 */
export const MIN_PROFILE_ROWS = 4
export const MAX_PROFILE_ROWS = 400
/** 宽度百分比上下限。 */
export const MIN_BOX_WIDTH_PERCENT = 5
export const MAX_BOX_WIDTH_PERCENT = 100
/** 单帧最多绘制的段数：更早的段不参与本帧，避免滚动到远端时代价失控。 */
export const MAX_PROFILE_SLICES = 240
