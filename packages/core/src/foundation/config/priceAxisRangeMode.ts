/** 价格轴范围模式：自动范围的三档取数口径，外加停止拟合的手动模式。 */

export const PRICE_AXIS_RANGE_MODE = {
  /** 自动适应：指标、绘图、足迹、比较都参与轴范围。 */
  All: 'all',
  /** 仅缩放价格图表：只取可见 K 线。 */
  Bars: 'bars',
  /** 固定 K 线占比：只取可见 K 线，并按占比向上下留白。 */
  Ratio: 'ratio',
  /** 手动：不再拟合，停在当前范围。 */
  Manual: 'manual',
} as const

/** 价格轴范围模式。 */
export type PriceAxisRangeMode = (typeof PRICE_AXIS_RANGE_MODE)[keyof typeof PRICE_AXIS_RANGE_MODE]

/** 自动范围口径：决定轴范围把哪些来源计入。 */
export type AutoPriceAxisRangeMode = Exclude<PriceAxisRangeMode, 'manual'>

/** 自动口径的全部取值；顺序即界面顺序。 */
export const AUTO_PRICE_AXIS_RANGE_MODES = [
  PRICE_AXIS_RANGE_MODE.All,
  PRICE_AXIS_RANGE_MODE.Bars,
  PRICE_AXIS_RANGE_MODE.Ratio,
] as const satisfies ReadonlyArray<AutoPriceAxisRangeMode>

/** 固定 K 线占比：K 线占窗口高度的比例，其余平均分给上下留白。 */
export const PRICE_AXIS_RATIO_SHARE = 0.7

/** 能按可见 K 线定轴时的可选模式。 */
const PRICE_BAR_RANGE_MODES = [
  PRICE_AXIS_RANGE_MODE.All,
  PRICE_AXIS_RANGE_MODE.Bars,
  PRICE_AXIS_RANGE_MODE.Ratio,
  PRICE_AXIS_RANGE_MODE.Manual,
] as const

/** 只能按自身数值区间定轴时的可选模式。 */
const VALUE_RANGE_MODES = [PRICE_AXIS_RANGE_MODE.All, PRICE_AXIS_RANGE_MODE.Manual] as const

/**
 * 该轴可用的范围模式：只由「有没有可见 K 线可拟合」决定。
 *
 * 轴命令校验、配置读数与渲染取口径都消费这一份，不各自判断视图或轴角色。
 *
 * @param fitsPriceBars 该轴在当前模式下是否按可见 K 线定轴
 * @returns 可用的范围模式，保持固定的声明顺序
 */
export function availablePriceRangeModes(fitsPriceBars: boolean): readonly PriceAxisRangeMode[] {
  return fitsPriceBars ? PRICE_BAR_RANGE_MODES : VALUE_RANGE_MODES
}

/**
 * 实际生效的范围模式：模式在当前条件下不可用时退回全并。
 * 用户选择保留在状态里，条件恢复后自动生效。
 *
 * @param fitsPriceBars 该轴在当前模式下是否按可见 K 线定轴
 * @param rangeMode 状态里保存的范围模式
 * @returns 本帧应使用的范围模式
 */
export function resolvePriceAxisRangeMode(
  fitsPriceBars: boolean,
  rangeMode: PriceAxisRangeMode,
): PriceAxisRangeMode {
  return availablePriceRangeModes(fitsPriceBars).includes(rangeMode)
    ? rangeMode
    : PRICE_AXIS_RANGE_MODE.All
}

/** 运行期输入的轴范围模式校验；布局恢复与轴命令共用同一份取值集合。 */
export function isPriceAxisRangeMode(value: unknown): value is PriceAxisRangeMode {
  return (
    value === PRICE_AXIS_RANGE_MODE.All ||
    value === PRICE_AXIS_RANGE_MODE.Bars ||
    value === PRICE_AXIS_RANGE_MODE.Ratio ||
    value === PRICE_AXIS_RANGE_MODE.Manual
  )
}
