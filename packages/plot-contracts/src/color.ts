/**
 * 脚本绘图的常用色；与 PlotKind / ShapeSize 一样是共享契约，由 Script 包生成成 VM 全局枚举。
 *
 * 这些是固定色值，不随主题变化。需要别的颜色时照旧在 `color` 里直接写 CSS 颜色字符串，
 * 契约的 `color?: string` 不因此收窄。
 */

/**
 * 常用色：色相顺序取自 Material Design 400 色阶，中性色单独取值。
 *
 * 脚本里用 `Color.Red` 即可，取值与同名字面量完全一致。
 */
export const Color = {
  Red: '#ef5350',
  DeepOrange: '#ff7043',
  Orange: '#ffa726',
  Amber: '#ffca28',
  Yellow: '#ffee58',
  Lime: '#d4e157',
  LightGreen: '#9ccc65',
  Green: '#66bb6a',
  Teal: '#26a69a',
  Cyan: '#26c6da',
  LightBlue: '#29b6f6',
  Blue: '#42a5f5',
  Indigo: '#5c6bc0',
  Purple: '#ab47bc',
  Pink: '#ec407a',
  Brown: '#8d6e63',
  BlueGray: '#78909c',
  Gray: '#808080',
  White: '#ffffff',
  Black: '#000000',
} satisfies Record<string, string>
