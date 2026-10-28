/**
 * 脚本绘图的常用色：别名契约，以及与主题色值的解析约定。
 *
 * 枚举值分两类：
 * - 以 `@` 开头的别名（如 `@red`）表示「主题色」。具体色值由宿主按当前主题从
 *   `Theme.colors.scriptPalette` 取，脚本不感知主题，主题切换后同一份输出自动变色。
 * - 其余值是绝对颜色（白、黑），用于文字和彩色底块上的叠加，不随主题变化。
 *
 * 需要别的颜色时照旧直接写 CSS 颜色字符串：颜色参数类型是 `Color | (string & {})`。
 * 需要透明度时在别名后直接拼两位十六进制 alpha，如 `Color.Teal + '80'`。
 */

/** 主题色别名的前缀；只有带它开头的值走主题解析，其余按 CSS 颜色直传。 */
export const SCRIPT_COLOR_PREFIX = '@'

/**
 * @summary 常用色
 *
 * 常用色：主题色别名 + 白 / 黑两个绝对色。
 *
 * 脚本里用 `Color.Red` 即可；别名与 Theme.colors.scriptPalette 的键一一对应。
 */
export const Color = {
  /** @summary 红 */
  Red: '@red',
  /** @summary 深橙 */
  DeepOrange: '@deepOrange',
  /** @summary 橙 */
  Orange: '@orange',
  /** @summary 琥珀 */
  Amber: '@amber',
  /** @summary 黄 */
  Yellow: '@yellow',
  /** @summary 青柠 */
  Lime: '@lime',
  /** @summary 浅绿 */
  LightGreen: '@lightGreen',
  /** @summary 绿 */
  Green: '@green',
  /** @summary 蓝绿 */
  Teal: '@teal',
  /** @summary 青 */
  Cyan: '@cyan',
  /** @summary 浅蓝 */
  LightBlue: '@lightBlue',
  /** @summary 蓝 */
  Blue: '@blue',
  /** @summary 靛蓝 */
  Indigo: '@indigo',
  /** @summary 紫 */
  Purple: '@purple',
  /** @summary 粉 */
  Pink: '@pink',
  /** @summary 棕 */
  Brown: '@brown',
  /** @summary 蓝灰 */
  BlueGray: '@blueGray',
  /** @summary 灰 */
  Gray: '@gray',
  /** @summary 前景 */
  Foreground: '@foreground',
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

/** 去掉前缀的别名联合；同时是 Theme.colors.scriptPalette 的键集合。 */
type ScriptColorAliasOf<Value> = Value extends `${typeof SCRIPT_COLOR_PREFIX}${infer Alias}`
  ? Alias
  : never

export type ScriptColorAlias = ScriptColorAliasOf<Color>

/** 契约里的别名集合，直接从 Color 取值派生，不维护第二份清单。 */
const ALIAS_SET: ReadonlySet<string> = new Set(
  Object.values(Color)
    .filter((value) => value.startsWith(SCRIPT_COLOR_PREFIX))
    .map((value) => value.slice(SCRIPT_COLOR_PREFIX.length)),
)

/** 拼接在别名之后的透明度：两位十六进制，与 CSS 的 8 位 hex 规则一致。 */
const ALPHA_SUFFIX = /^[\da-f]{2}$/i

/** 主题色别名或普通 CSS 颜色；解析结果由宿主决定如何取色值。 */
export type ParsedScriptColor =
  | { readonly kind: 'alias'; readonly alias: ScriptColorAlias; readonly alpha: string }
  | { readonly kind: 'css'; readonly value: string }

/** 判断字符串是否是契约声明的别名。 */
function isScriptColorAlias(value: string): value is ScriptColorAlias {
  return ALIAS_SET.has(value)
}

/** 契约声明的主题色别名，按 Color 的声明顺序；主题必须为每个别名提供取值。 */
export const SCRIPT_COLOR_ALIASES: readonly ScriptColorAlias[] = Object.values(Color).flatMap(
  (value) => {
    const alias = value.startsWith(SCRIPT_COLOR_PREFIX)
      ? value.slice(SCRIPT_COLOR_PREFIX.length)
      : ''
    return isScriptColorAlias(alias) ? [alias] : []
  },
)

/**
 * 解析一个脚本颜色值。
 *
 * @param value 脚本传入的颜色字符串，可能是别名（可带 alpha 后缀）或 CSS 颜色
 * @returns 别名与 alpha，或原样透传的 CSS 颜色
 * @throws TypeError 以 `@` 开头但不是合法别名时拒绝，避免拼错的别名静默画成透明
 */
export function parseScriptColor(value: string): ParsedScriptColor {
  if (!value.startsWith(SCRIPT_COLOR_PREFIX)) return { kind: 'css', value }
  const body = value.slice(SCRIPT_COLOR_PREFIX.length)
  if (isScriptColorAlias(body)) return { kind: 'alias', alias: body, alpha: '' }
  // 别名只含字母、alpha 只含十六进制数字，因此从末尾裁两位就能唯一还原别名。
  const alpha = body.slice(-2)
  const alias = body.slice(0, -2)
  if (ALPHA_SUFFIX.test(alpha) && isScriptColorAlias(alias)) return { kind: 'alias', alias, alpha }
  throw new TypeError(`Unknown script color alias: ${value}`)
}
