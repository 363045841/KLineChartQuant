/**
 * 数值格式档位：与 PlotKind / ShapeSize 一样是共享契约，由 Script 包生成成 VM 全局枚举。
 *
 * 对应 Pine 的 format 选项，分两级：指标级 `IndicatorSourceDefinition.format` 决定整条轴的
 * 显示，plot 级 `PlotStyleBase.format` 可逐图覆盖；这里只声明档位语义，具体文本由消费端
 * （core 的坐标轴与图例）格式化。
 */

/**
 * @summary 数值格式
 *
 * 数值格式化档位；脚本里用 `Format.Volume` 即可，不填时按 `Format.Price` 处理。
 *
 * | 成员 | 示例 |
 * | --- | --- |
 * | `Format.Price` | `1234.567` |
 * | `Format.Volume` | `1.25K`、`12.30M`、`3.40B` |
 * | `Format.Percent` | `3.45%`、`-12.30%` |
 * | `Format.Mintick` | `1234.5678901` |
 */
export const Format = {
  /** @summary 价格 */
  Price: 'price',
  /** @summary 成交量 */
  Volume: 'volume',
  /** @summary 百分比 */
  Percent: 'percent',
  /** @summary 最小变动单位 */
  Mintick: 'mintick',
} as const satisfies Record<string, string>

export type Format = (typeof Format)[keyof typeof Format]

/** 判断数值格式档位，供跨 VM 边界校验使用。 */
export function isFormat(value: unknown): value is Format {
  return Object.values(Format).some((entry) => entry === value)
}
