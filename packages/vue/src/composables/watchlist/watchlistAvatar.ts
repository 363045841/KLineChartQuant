/** 自选行图标：用代码首字符做图标文字，底色按代码稳定散列到指标色板。 */

/** 指标色板槽位数，对应 ColorTokens.palette 的 i1..i10。 */
export const AVATAR_PALETTE_SIZE = 10

/**
 * 取品种代码首字符作为图标文字。
 *
 * @param symbol - 品种代码
 */
export function symbolInitial(symbol: string): string {
  const trimmed = symbol.trim()
  return trimmed.length > 0 ? trimmed.charAt(0).toUpperCase() : '?'
}

/**
 * 把代码散列到 1..AVATAR_PALETTE_SIZE 的色板槽位。
 *
 * 散列只依赖代码，同一品种在任何会话、任何分组下底色一致。
 *
 * @param symbol - 品种代码
 */
export function symbolPaletteIndex(symbol: string): number {
  let hash = 0
  for (const char of symbol) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % AVATAR_PALETTE_SIZE
  }
  return hash + 1
}
