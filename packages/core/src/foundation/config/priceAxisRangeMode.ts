/** 主图价格轴范围来源的常量与类型。 */
export const PRICE_AXIS_RANGE_MODE = {
  AUTO: 'auto',
  HAND: 'hand',
} as const

/** 主图价格轴范围来源。 */
export type PriceAxisRangeMode = (typeof PRICE_AXIS_RANGE_MODE)[keyof typeof PRICE_AXIS_RANGE_MODE]
