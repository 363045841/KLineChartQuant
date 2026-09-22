/**
 * 价格轴刻度类型的唯一词汇表。
 *
 * 所有坐标模式（linear/log/percent）的类型派生与运行时比较都必须引用这里，
 * 禁止在业务代码中散落字符串字面量；新增类型时只需改动本文件，
 * 依赖 `Record<ScaleType, ...>` 的分派会由编译器强制补齐。
 */

/** 价格轴刻度类型。 */
export const ScaleType = {
  /** 常规（算术）坐标。 */
  Linear: 'linear',
  /** 对数坐标。 */
  Log: 'log',
  /** 百分比坐标。 */
  Percent: 'percent',
} as const

/** 价格轴刻度类型的字符串联合。 */
export type ScaleType = (typeof ScaleType)[keyof typeof ScaleType]

/** 右轴「不显示」语义，独立于坐标类型。 */
export const AXIS_TYPE_NONE = 'none' as const

/** 右轴类型 = 坐标类型 + 不显示。 */
export type AxisType = ScaleType | typeof AXIS_TYPE_NONE
