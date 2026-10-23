/**
 * 脚本绘图的常用色；与 PlotKind / ShapeSize 一样是共享契约，由 Script 包生成成 VM 全局枚举。
 *
 * 这些是固定色值，不随主题变化。图形颜色参数的类型是 `Color | (string & {})`：
 * 常用色可用 `Color.Red`，需要别的颜色时照旧直接写 CSS 颜色字符串。
 */

/**
 * @summary 常用色
 *
 * 常用色：色相顺序取自 Material Design 400 色阶，中性色单独取值。
 *
 * 脚本里用 `Color.Red` 即可，取值与同名字面量完全一致。
 */
export const Color = {
  /** @summary 红 */
  Red: '#ef5350',
  /** @summary 深橙 */
  DeepOrange: '#ff7043',
  /** @summary 橙 */
  Orange: '#ffa726',
  /** @summary 琥珀 */
  Amber: '#ffca28',
  /** @summary 黄 */
  Yellow: '#ffee58',
  /** @summary 青柠 */
  Lime: '#d4e157',
  /** @summary 浅绿 */
  LightGreen: '#9ccc65',
  /** @summary 绿 */
  Green: '#66bb6a',
  /** @summary 蓝绿 */
  Teal: '#26a69a',
  /** @summary 青 */
  Cyan: '#26c6da',
  /** @summary 浅蓝 */
  LightBlue: '#29b6f6',
  /** @summary 蓝 */
  Blue: '#42a5f5',
  /** @summary 靛蓝 */
  Indigo: '#5c6bc0',
  /** @summary 紫 */
  Purple: '#ab47bc',
  /** @summary 粉 */
  Pink: '#ec407a',
  /** @summary 棕 */
  Brown: '#8d6e63',
  /** @summary 蓝灰 */
  BlueGray: '#78909c',
  /** @summary 灰 */
  Gray: '#808080',
  /** @summary 白 */
  White: '#ffffff',
  /** @summary 黑 */
  Black: '#000000',
} as const satisfies Record<string, string>

/**
 * 常用色的字面量联合。
 *
 * 颜色参数的类型为 `Color | (string & {})`：既接受常用色，也接受任意 CSS 颜色值
 * （包括 `Color.Teal + '80'` 这类带 alpha 的拼接结果）。
 */
export type Color = (typeof Color)[keyof typeof Color]
